//! Is there an app window under a screen point, below the island?
//! Used to let the compact island step aside when it covers something clickable
//! (a browser's tab strip, say), but stay put over an empty desktop.

use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, GetWindow, GetWindowLongW, GetWindowRect, IsIconic, IsWindowVisible, GWL_EXSTYLE,
    GW_HWNDNEXT, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
};

/// Shell surfaces that count as "nothing behind": the desktop and the taskbar.
const SHELL: [&str; 4] = ["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"];

fn class_name(hwnd: HWND) -> String {
    let mut buf = [0u16; 64];
    let n = unsafe { GetClassNameW(hwnd, &mut buf) };
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
}

fn cloaked(hwnd: HWND) -> bool {
    let mut value = 0u32;
    unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut value as *mut u32 as *mut core::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        )
        .is_ok()
            && value != 0
    }
}

/// Walk the z-order below `ours` and report whether a real app window contains `point`.
pub fn window_below(ours: HWND, point: POINT) -> bool {
    unsafe {
        let mut hwnd = GetWindow(ours, GW_HWNDNEXT).unwrap_or_default();
        while !hwnd.is_invalid() {
            if IsWindowVisible(hwnd).as_bool() && !IsIconic(hwnd).as_bool() && !cloaked(hwnd) {
                let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
                let mut r = RECT::default();
                let skip = ex & (WS_EX_TRANSPARENT.0 | WS_EX_TOOLWINDOW.0) != 0;
                if !skip
                    && GetWindowRect(hwnd, &mut r).is_ok()
                    && point.x >= r.left
                    && point.x < r.right
                    && point.y >= r.top
                    && point.y < r.bottom
                {
                    return !SHELL.contains(&class_name(hwnd).as_str());
                }
            }
            hwnd = GetWindow(hwnd, GW_HWNDNEXT).unwrap_or_default();
        }
        false
    }
}

pub fn ctrl_down() -> bool {
    unsafe { (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16) & 0x8000 != 0 }
}
