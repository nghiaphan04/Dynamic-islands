//! Windows APIs the island reads and controls: media session, audio volume,
//! radios (Wi-Fi, Bluetooth, airplane mode), Wi-Fi networks, Bluetooth devices,
//! location and battery.

// The radio manager's method names follow Windows, not Rust.
#![allow(non_snake_case)]

use std::sync::Mutex;

use base64::Engine;
use serde::Serialize;
use windows::core::{interface, GUID, HRESULT, HSTRING};
use windows::Devices::Bluetooth::{
    BluetoothConnectionStatus, BluetoothDevice, BluetoothLEDevice, BluetoothMajorClass,
};
use windows::Devices::Enumeration::DeviceInformation;
use windows::Devices::Geolocation::{GeolocationAccessStatus, Geolocator};
use windows::Devices::Radios::{Radio, RadioKind, RadioState};
use windows::Devices::WiFi::{WiFiAccessStatus, WiFiAdapter, WiFiConnectionStatus, WiFiReconnectionKind};
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSessionManager as SessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
};
use windows::Networking::Connectivity::NetworkAuthenticationType;
use windows::Security::Credentials::PasswordCredential;
use windows::Storage::Streams::DataReader;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, CLSCTX_LOCAL_SERVER, COINIT_APARTMENTTHREADED,
    COINIT_MULTITHREADED,
};
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows::Win32::System::Registry::{
    RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ, RRF_RT_REG_SZ,
};
use windows_core::IUnknown;
use windows_core::IUnknown_Vtbl;

pub fn init_mta() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
}

/// 100-nanosecond ticks per second (WinRT TimeSpan).
const TICKS: f64 = 10_000_000.0;

// ---------- Media ----------

#[derive(Serialize)]
pub struct MediaInfo {
    title: String,
    artist: String,
    app: String,
    playing: bool,
    position: f64,
    duration: f64,
    cover: Option<String>,
    /// What the source app allows: a playlist app has next/previous, a video page only seeking.
    can_next: bool,
    can_prev: bool,
    can_seek: bool,
}

/// Cover per track. Apps often publish the artwork a moment after the title,
/// so a missing cover is retried on later polls instead of being cached as "none".
static COVER: Mutex<Option<(String, String)>> = Mutex::new(None);

/// Now, as a WinRT DateTime (100 ns ticks since 1601-01-01 UTC).
fn winrt_now() -> i64 {
    let unix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as i64 / 100)
        .unwrap_or(0);
    unix + 116_444_736_000_000_000
}

pub fn media_info() -> windows::core::Result<MediaInfo> {
    let session = SessionManager::RequestAsync()?.get()?.GetCurrentSession()?;
    let props = session.TryGetMediaPropertiesAsync()?.get()?;
    let title = props.Title()?.to_string();
    let artist = props.Artist()?.to_string();
    let timeline = session.GetTimelineProperties()?;
    let info = session.GetPlaybackInfo()?;
    let status = info.PlaybackStatus()?;
    let controls = info.Controls()?;
    let playing = status == PlaybackStatus::Playing;

    let key = format!("{title}\u{1f}{artist}");
    let cover = {
        let mut cache = COVER.lock().unwrap();
        match cache.as_ref() {
            Some((k, c)) if *k == key => Some(c.clone()),
            _ => {
                let c = read_cover(&props).ok();
                if let Some(c) = &c {
                    *cache = Some((key, c.clone()));
                }
                c
            }
        }
    };

    // The app only reports its position now and then (LastUpdatedTime);
    // project it forward to "now" while playing.
    let start = timeline.StartTime()?.Duration;
    let end = timeline.EndTime()?.Duration;
    let mut position = timeline.Position()?.Duration - start;
    if playing {
        let updated = timeline.LastUpdatedTime()?.UniversalTime;
        if updated > 0 {
            position += (winrt_now() - updated).max(0);
        }
    }
    let duration = (end - start).max(0);
    if duration > 0 {
        position = position.min(duration);
    }

    Ok(MediaInfo {
        title,
        artist,
        app: session.SourceAppUserModelId()?.to_string(),
        playing,
        position: position.max(0) as f64 / TICKS,
        duration: duration as f64 / TICKS,
        cover,
        can_next: controls.IsNextEnabled().unwrap_or(true),
        can_prev: controls.IsPreviousEnabled().unwrap_or(true),
        can_seek: controls.IsPlaybackPositionEnabled().unwrap_or(false),
    })
}

fn read_cover(
    props: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties,
) -> windows::core::Result<String> {
    let stream = props.Thumbnail()?.OpenReadAsync()?.get()?;
    let size = stream.Size()? as u32;
    let mime = stream.ContentType()?.to_string();
    let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0)?)?;
    reader.LoadAsync(size)?.get()?;
    let mut bytes = vec![0u8; size as usize];
    reader.ReadBytes(&mut bytes)?;
    let mime = if mime.is_empty() { "image/png".to_string() } else { mime };
    Ok(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

pub fn media_control(action: &str, position: Option<f64>) -> windows::core::Result<()> {
    let session = SessionManager::RequestAsync()?.get()?.GetCurrentSession()?;
    match action {
        "toggle" => session.TryTogglePlayPauseAsync()?.get()?,
        "next" => session.TrySkipNextAsync()?.get()?,
        "previous" => session.TrySkipPreviousAsync()?.get()?,
        "seek" => {
            // Positions are relative to the timeline's start.
            let start = session.GetTimelineProperties()?.StartTime()?.Duration;
            session
                .TryChangePlaybackPositionAsync(start + (position.unwrap_or(0.0) * TICKS) as i64)?
                .get()?
        }
        _ => false,
    };
    Ok(())
}

// ---------- Battery ----------

#[derive(Serialize, Clone)]
pub struct Battery {
    percent: Option<u8>,
    charging: bool,
}

pub fn battery() -> Battery {
    let mut status = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut status) }.is_err() {
        return Battery { percent: None, charging: false };
    }
    // 128 = no system battery (desktop PC); 255 = percent unknown.
    let has_battery = status.BatteryFlag != 128 && status.BatteryLifePercent != 255;
    Battery {
        percent: has_battery.then_some(status.BatteryLifePercent),
        charging: status.ACLineStatus == 1,
    }
}

// ---------- Volume ----------

#[derive(Serialize)]
pub struct Volume {
    level: f32,
    muted: bool,
}

fn endpoint_volume() -> windows::core::Result<IAudioEndpointVolume> {
    unsafe {
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
        device.Activate(CLSCTX_ALL, None)
    }
}

pub fn volume() -> windows::core::Result<Volume> {
    let v = endpoint_volume()?;
    unsafe {
        Ok(Volume {
            level: v.GetMasterVolumeLevelScalar()?,
            muted: v.GetMute()?.as_bool(),
        })
    }
}

pub fn set_volume(level: Option<f32>, muted: Option<bool>) -> windows::core::Result<()> {
    let v = endpoint_volume()?;
    unsafe {
        if let Some(level) = level {
            v.SetMasterVolumeLevelScalar(level.clamp(0.0, 1.0), std::ptr::null())?;
        }
        if let Some(muted) = muted {
            v.SetMute(muted, std::ptr::null())?;
        }
    }
    Ok(())
}

// ---------- Radios & airplane mode ----------

#[derive(Serialize)]
pub struct Radios {
    wifi: Option<bool>,
    bluetooth: Option<bool>,
    airplane: Option<bool>,
    /// The internet connection currently goes over Wi-Fi.
    wifi_connected: bool,
}

fn all_radios() -> windows::core::Result<Vec<Radio>> {
    Radio::RequestAccessAsync()?.get()?;
    Ok(Radio::GetRadiosAsync()?.get()?.into_iter().collect())
}

pub fn radios() -> windows::core::Result<Radios> {
    let wifi_connected = windows::Networking::Connectivity::NetworkInformation::GetInternetConnectionProfile()
        .and_then(|p| p.IsWlanConnectionProfile())
        .unwrap_or(false);
    let mut out = Radios { wifi: None, bluetooth: None, airplane: None, wifi_connected };
    for radio in all_radios()? {
        let on = radio.State()? == RadioState::On;
        match radio.Kind()? {
            RadioKind::WiFi => out.wifi = Some(out.wifi.unwrap_or(false) || on),
            RadioKind::Bluetooth => out.bluetooth = Some(out.bluetooth.unwrap_or(false) || on),
            _ => {}
        }
    }
    // Read on its own STA thread, as the radio manager expects.
    out.airplane = std::thread::spawn(airplane_state).join().ok().flatten();
    Ok(out)
}

pub fn set_radio(kind: &str, on: bool) -> windows::core::Result<()> {
    let wanted = match kind {
        "wifi" => RadioKind::WiFi,
        "bluetooth" => RadioKind::Bluetooth,
        _ => return Ok(()),
    };
    let state = if on { RadioState::On } else { RadioState::Off };
    for radio in all_radios()? {
        if radio.Kind()? == wanted {
            radio.SetStateAsync(state)?.get()?;
        }
    }
    Ok(())
}

/// The system radio manager behind Windows' own airplane-mode switch.
/// Undocumented, but stable since Windows 8.
#[interface("DB3AFBFB-08E6-46C6-AA70-BF9A34C30AB7")]
unsafe trait IRadioManager: IUnknown {
    fn IsRMSupported(&self, state: *mut u32) -> HRESULT;
    fn GetUIRadioInstances(&self, instances: *mut *mut core::ffi::c_void) -> HRESULT;
    fn GetSystemRadioState(&self, enabled: *mut i32, policy: *mut i32, change: *mut i32) -> HRESULT;
    fn SetSystemRadioState(&self, enabled: i32) -> HRESULT;
}

const CLSID_RADIO_MANAGER: GUID = GUID::from_u128(0x581333f6_28db_41be_bc7a_ff201f12f3f6);

fn radio_manager() -> windows::core::Result<IRadioManager> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        CoCreateInstance(&CLSID_RADIO_MANAGER, None, CLSCTX_LOCAL_SERVER)
    }
}

fn airplane_state() -> Option<bool> {
    let manager = radio_manager().ok()?;
    let (mut enabled, mut policy, mut change) = (0, 0, 0);
    unsafe { manager.GetSystemRadioState(&mut enabled, &mut policy, &mut change) }.ok().ok()?;
    // "System radios enabled" is the opposite of airplane mode.
    Some(enabled == 0)
}

pub fn set_airplane(on: bool) -> windows::core::Result<()> {
    let manager = radio_manager()?;
    unsafe { manager.SetSystemRadioState(if on { 0 } else { 1 }) }.ok()
}

// ---------- Wi-Fi ----------

#[derive(Serialize)]
pub struct WifiNetwork {
    ssid: String,
    bars: u8,
    secure: bool,
    connected: bool,
}

#[derive(Serialize)]
pub struct WifiScan {
    allowed: bool,
    networks: Vec<WifiNetwork>,
}

fn wifi_adapter() -> windows::core::Result<Option<WiFiAdapter>> {
    if WiFiAdapter::RequestAccessAsync()?.get()? != WiFiAccessStatus::Allowed {
        return Ok(None);
    }
    let adapters = WiFiAdapter::FindAllAdaptersAsync()?.get()?;
    Ok(adapters.into_iter().next())
}

fn connected_ssid(adapter: &WiFiAdapter) -> Option<String> {
    let profile = adapter.NetworkAdapter().ok()?.GetConnectedProfileAsync().ok()?.get().ok()?;
    let details = profile.WlanConnectionProfileDetails().ok()?;
    details.GetConnectedSsid().ok().map(|s| s.to_string())
}

pub fn wifi_scan() -> windows::core::Result<WifiScan> {
    let Some(adapter) = wifi_adapter()? else {
        return Ok(WifiScan { allowed: false, networks: vec![] });
    };
    // Windows throttles scans; a refused scan still leaves the last report readable.
    let _ = adapter.ScanAsync().and_then(|op| op.get());
    let mut report = adapter.NetworkReport()?.AvailableNetworks()?;
    if report.Size()? == 0 {
        std::thread::sleep(std::time::Duration::from_millis(1500));
        let _ = adapter.ScanAsync().and_then(|op| op.get());
        report = adapter.NetworkReport()?.AvailableNetworks()?;
    }
    let current = connected_ssid(&adapter);
    let mut networks: Vec<WifiNetwork> = Vec::new();
    for net in report {
        let ssid = net.Ssid()?.to_string();
        if ssid.is_empty() || networks.iter().any(|n| n.ssid == ssid) {
            continue;
        }
        let auth = net.SecuritySettings()?.NetworkAuthenticationType()?;
        networks.push(WifiNetwork {
            connected: current.as_deref() == Some(ssid.as_str()),
            secure: auth != NetworkAuthenticationType::Open80211 && auth != NetworkAuthenticationType::None,
            bars: net.SignalBars()?,
            ssid,
        });
    }
    networks.sort_by(|a, b| b.connected.cmp(&a.connected).then(b.bars.cmp(&a.bars)));
    Ok(WifiScan { allowed: true, networks })
}

/// Returns "ok", "password" (a key is needed) or "failed".
pub fn wifi_connect(ssid: &str, password: Option<&str>) -> windows::core::Result<String> {
    let Some(adapter) = wifi_adapter()? else { return Ok("failed".into()) };
    let network = adapter
        .NetworkReport()?
        .AvailableNetworks()?
        .into_iter()
        .find(|n| n.Ssid().map(|s| s.to_string() == ssid).unwrap_or(false));
    let Some(network) = network else { return Ok("failed".into()) };
    let kind = WiFiReconnectionKind::Automatic;
    let result = match password {
        Some(key) => {
            let credential = PasswordCredential::new()?;
            credential.SetPassword(&HSTRING::from(key))?;
            adapter.ConnectWithPasswordCredentialAsync(&network, kind, &credential)?.get()?
        }
        None => adapter.ConnectAsync(&network, kind)?.get()?,
    };
    Ok(match result.ConnectionStatus()? {
        WiFiConnectionStatus::Success => "ok",
        WiFiConnectionStatus::InvalidCredential => "password",
        _ if password.is_none() => {
            let auth = network.SecuritySettings()?.NetworkAuthenticationType()?;
            if auth == NetworkAuthenticationType::Open80211 { "failed" } else { "password" }
        }
        _ => "failed",
    }
    .to_string())
}

// ---------- Bluetooth ----------

#[derive(Serialize)]
pub struct BtDevice {
    name: String,
    connected: bool,
    audio: bool,
    battery: Option<u8>,
}

/// Battery levels Windows knows for Bluetooth devices (headsets report it over HFP),
/// keyed by the device node's display name.
fn bt_batteries() -> Vec<(String, u8)> {
    use windows::Devices::Enumeration::Pnp::{PnpObject, PnpObjectType};
    use windows_collections::IIterable;
    use windows::Foundation::IReference;
    use windows_core::Interface;

    const BATTERY: &str = "{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2";
    let run = || -> windows::core::Result<Vec<(String, u8)>> {
        let props: IIterable<HSTRING> = vec![HSTRING::from(BATTERY), HSTRING::from("System.ItemNameDisplay")].into();
        // The level sits on the headset's "Hands-Free AG" node (class System), e.g. "AP09 Hands-Free AG".
        let nodes = PnpObject::FindAllAsync(PnpObjectType::Device, &props)?.get()?;
        let mut out = Vec::new();
        for node in nodes {
            let map = node.Properties()?;
            let level = map
                .Lookup(&HSTRING::from(BATTERY))
                .ok()
                .and_then(|v| v.cast::<IReference<u8>>().ok())
                .and_then(|r| r.Value().ok());
            let name = map
                .Lookup(&HSTRING::from("System.ItemNameDisplay"))
                .ok()
                .and_then(|v| v.cast::<IReference<HSTRING>>().ok())
                .and_then(|r| r.Value().ok())
                .map(|s| s.to_string());
            if let (Some(level), Some(name)) = (level, name) {
                out.push((name.to_lowercase(), level));
            }
        }
        Ok(out)
    };
    run().unwrap_or_default()
}

pub fn bluetooth_devices() -> windows::core::Result<Vec<BtDevice>> {
    let mut out: Vec<BtDevice> = Vec::new();
    let batteries = bt_batteries();
    let battery_of = |name: &str| {
        let name = name.to_lowercase();
        batteries
            .iter()
            .find(|(node, _)| node.contains(&name) || name.contains(node.as_str()))
            .map(|(_, level)| *level)
    };

    let classic = BluetoothDevice::GetDeviceSelectorFromPairingState(true)?;
    for info in DeviceInformation::FindAllAsyncAqsFilter(&classic)?.get()? {
        let Ok(device) = BluetoothDevice::FromIdAsync(&info.Id()?)?.get() else { continue };
        let audio = device
            .ClassOfDevice()
            .and_then(|c| c.MajorClass())
            .map(|m| m == BluetoothMajorClass::AudioVideo)
            .unwrap_or(false);
        let name = info.Name()?.to_string();
        out.push(BtDevice {
            battery: battery_of(&name),
            connected: device.ConnectionStatus()? == BluetoothConnectionStatus::Connected,
            audio,
            name,
        });
    }

    let low_energy = BluetoothLEDevice::GetDeviceSelectorFromPairingState(true)?;
    for info in DeviceInformation::FindAllAsyncAqsFilter(&low_energy)?.get()? {
        let name = info.Name()?.to_string();
        if out.iter().any(|d| d.name == name) {
            continue;
        }
        let Ok(device) = BluetoothLEDevice::FromIdAsync(&info.Id()?)?.get() else { continue };
        out.push(BtDevice {
            battery: battery_of(&name),
            connected: device.ConnectionStatus()? == BluetoothConnectionStatus::Connected,
            audio: false,
            name,
        });
    }

    out.sort_by(|a, b| b.connected.cmp(&a.connected).then(a.name.cmp(&b.name)));
    Ok(out)
}

// ---------- Start with Windows ----------

const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_NAME: &str = "DynamicIslands";

pub fn get_autostart() -> bool {
    unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            &HSTRING::from(RUN_KEY),
            &HSTRING::from(RUN_NAME),
            RRF_RT_REG_SZ,
            None,
            None,
            None,
        )
        .is_ok()
    }
}

pub fn set_autostart(on: bool) -> windows::core::Result<()> {
    let key = HSTRING::from(RUN_KEY);
    let name = HSTRING::from(RUN_NAME);
    unsafe {
        if on {
            let exe = std::env::current_exe().map_err(|_| windows::core::Error::from_win32())?;
            let value: Vec<u16> = format!("\"{}\"", exe.display()).encode_utf16().chain([0]).collect();
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                &key,
                &name,
                REG_SZ.0,
                Some(value.as_ptr() as *const core::ffi::c_void),
                (value.len() * 2) as u32,
            )
            .ok()
        } else {
            let _ = RegDeleteKeyValueW(HKEY_CURRENT_USER, &key, &name);
            Ok(())
        }
    }
}

// ---------- Location ----------

/// Rounded to two decimals (about 1 km): enough for weather, not an address.
pub fn location() -> windows::core::Result<Option<(f64, f64)>> {
    if Geolocator::RequestAccessAsync()?.get()? != GeolocationAccessStatus::Allowed {
        return Ok(None);
    }
    let position = Geolocator::new()?.GetGeopositionAsync()?.get()?;
    let point = position.Coordinate()?.Point()?.Position()?;
    let round = |v: f64| (v * 100.0).round() / 100.0;
    Ok(Some((round(point.Latitude), round(point.Longitude))))
}
