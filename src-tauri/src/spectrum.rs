//! What is playing, split into five frequency bands for the music wave.
//! Captures the default output device in loopback mode (the mix the speakers get),
//! runs an FFT ~40 times a second and reports each band's level, 0..1.

use std::collections::VecDeque;
use std::time::{Duration, Instant};

use windows::Win32::Media::Audio::{
    eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator, MMDeviceEnumerator,
    AUDCLNT_SHAREMODE_SHARED, WAVEFORMATEX,
};
use windows::Win32::System::Com::{CoCreateInstance, CoTaskMemFree, CLSCTX_ALL};

const FFT: usize = 1024;
const STREAMFLAGS_LOOPBACK: u32 = 0x0002_0000;
const BUFFERFLAGS_SILENT: u32 = 0x2;
/// Band edges in Hz: bass, low-mid, mid, high-mid, treble.
const EDGES: [f32; 6] = [40.0, 160.0, 400.0, 1200.0, 3500.0, 9000.0];

struct Capture {
    client: IAudioClient,
    capture: IAudioCaptureClient,
    channels: usize,
    float: bool,
    rate: f32,
}

impl Drop for Capture {
    fn drop(&mut self) {
        unsafe {
            let _ = self.client.Stop();
        }
    }
}

fn open() -> windows::core::Result<Capture> {
    unsafe {
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
        let client: IAudioClient = device.Activate(CLSCTX_ALL, None)?;
        let format = client.GetMixFormat()?;
        let fmt: WAVEFORMATEX = *format;
        let result = client.Initialize(AUDCLNT_SHAREMODE_SHARED, STREAMFLAGS_LOOPBACK, 2_000_000, 0, format, None);
        CoTaskMemFree(Some(format as *const _ as *const core::ffi::c_void));
        result?;
        let capture: IAudioCaptureClient = client.GetService()?;
        client.Start()?;
        Ok(Capture {
            client,
            capture,
            channels: fmt.nChannels.max(1) as usize,
            // The shared mix format is 32-bit float on every current Windows; 16-bit PCM is handled too.
            float: fmt.wBitsPerSample == 32,
            rate: fmt.nSamplesPerSec as f32,
        })
    }
}

/// Pull everything waiting in the capture buffer into `ring` as mono samples.
fn drain(c: &Capture, ring: &mut VecDeque<f32>) -> windows::core::Result<()> {
    unsafe {
        loop {
            let packet = c.capture.GetNextPacketSize()?;
            if packet == 0 {
                return Ok(());
            }
            let mut data = std::ptr::null_mut();
            let mut frames = 0u32;
            let mut flags = 0u32;
            c.capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None)?;
            let n = frames as usize;
            let silent = flags & BUFFERFLAGS_SILENT != 0 || data.is_null();
            for f in 0..n {
                let mut sum = 0.0f32;
                if !silent {
                    for ch in 0..c.channels {
                        let i = f * c.channels + ch;
                        sum += if c.float {
                            *(data as *const f32).add(i)
                        } else {
                            *(data as *const i16).add(i) as f32 / 32768.0
                        };
                    }
                }
                ring.push_back(sum / c.channels as f32);
            }
            c.capture.ReleaseBuffer(frames)?;
            while ring.len() > FFT * 2 {
                ring.pop_front();
            }
        }
    }
}

/// In-place iterative radix-2 FFT.
fn fft(re: &mut [f32], im: &mut [f32]) {
    let n = re.len();
    let mut j = 0;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j |= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let ang = -2.0 * std::f32::consts::PI / len as f32;
        let (wr, wi) = (ang.cos(), ang.sin());
        for start in (0..n).step_by(len) {
            let (mut cr, mut ci) = (1.0f32, 0.0f32);
            for k in 0..len / 2 {
                let (a, b) = (start + k, start + k + len / 2);
                let tr = re[b] * cr - im[b] * ci;
                let ti = re[b] * ci + im[b] * cr;
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
                let nr = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = nr;
            }
        }
        len <<= 1;
    }
}

/// Raw energy per band from the latest FFT window.
fn bands(ring: &VecDeque<f32>, rate: f32) -> ([f32; 5], f32) {
    let start = ring.len().saturating_sub(FFT);
    let mut re = vec![0.0f32; FFT];
    let mut im = vec![0.0f32; FFT];
    let mut rms = 0.0f32;
    for (i, s) in ring.iter().skip(start).enumerate().take(FFT) {
        let w = 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / (FFT - 1) as f32).cos();
        re[i] = s * w;
        rms += s * s;
    }
    rms = (rms / FFT as f32).sqrt();
    fft(&mut re, &mut im);
    let hz = rate / FFT as f32;
    let mut out = [0.0f32; 5];
    for b in 0..5 {
        let lo = ((EDGES[b] / hz) as usize).max(1);
        let hi = ((EDGES[b + 1] / hz) as usize).clamp(lo + 1, FFT / 2);
        let mut sum = 0.0;
        for k in lo..hi {
            sum += (re[k] * re[k] + im[k] * im[k]).sqrt();
        }
        out[b] = sum / (hi - lo) as f32;
    }
    (out, rms)
}

/// Run forever, calling `emit` with five 0..1 levels (bass first) while sound plays.
pub fn run(mut emit: impl FnMut([f32; 5])) {
    let mut ring: VecDeque<f32> = VecDeque::with_capacity(FFT * 2);
    // Per-band running peak, so quiet and loud songs both fill the bars.
    let mut peak = [1e-3f32; 5];
    let mut capture: Option<Capture> = None;
    let mut opened = Instant::now();
    let mut silent_frames = 0u32;
    loop {
        std::thread::sleep(Duration::from_millis(25));
        // Re-open now and then so a switched output device is followed.
        if capture.is_none() || opened.elapsed() > Duration::from_secs(10) && silent_frames > 40 {
            capture = open().ok();
            opened = Instant::now();
            ring.clear();
            if capture.is_none() {
                std::thread::sleep(Duration::from_secs(2));
                continue;
            }
        }
        let c = capture.as_ref().unwrap();
        if drain(c, &mut ring).is_err() {
            capture = None;
            continue;
        }
        if ring.len() < FFT {
            continue;
        }
        let (raw, rms) = bands(&ring, c.rate);
        if rms < 0.0005 {
            silent_frames += 1;
            if silent_frames == 3 {
                emit([0.0; 5]);
            }
            continue;
        }
        silent_frames = 0;
        let mut levels = [0.0f32; 5];
        for b in 0..5 {
            peak[b] = (peak[b] * 0.997).max(raw[b]).max(1e-4);
            levels[b] = (raw[b] / peak[b]).clamp(0.0, 1.0).powf(1.6);
        }
        emit(levels);
    }
}
