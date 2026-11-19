mod behind;
mod spectrum;
mod system;
mod watch;

use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// The island's rectangle inside the (larger, transparent) window, in CSS pixels,
/// and whether it is compact. Outside it the window lets clicks through.
struct HitRect(Mutex<([f64; 4], bool)>);

/// Run a blocking WinRT/COM call off the main thread.
async fn blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> windows::core::Result<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        system::init_mta();
        f()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.message().to_string())
}

#[tauri::command]
async fn media_info() -> Option<system::MediaInfo> {
    blocking(system::media_info).await.ok()
}

#[tauri::command]
async fn media_control(action: String, position: Option<f64>) -> Result<(), String> {
    blocking(move || system::media_control(&action, position)).await
}

#[tauri::command]
fn battery() -> system::Battery {
    system::battery()
}

#[tauri::command]
async fn volume() -> Result<system::Volume, String> {
    blocking(system::volume).await
}

#[tauri::command]
async fn set_volume(level: Option<f32>, muted: Option<bool>) -> Result<(), String> {
    blocking(move || system::set_volume(level, muted)).await
}

#[tauri::command]
async fn radios() -> Result<system::Radios, String> {
    blocking(system::radios).await
}

#[tauri::command]
async fn set_radio(kind: String, on: bool) -> Result<(), String> {
    blocking(move || system::set_radio(&kind, on)).await
}

#[tauri::command]
async fn set_airplane(on: bool) -> Result<(), String> {
    // The radio manager wants a single-threaded apartment of its own.
    tauri::async_runtime::spawn_blocking(move || system::set_airplane(on))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.message().to_string())
}

#[tauri::command]
async fn wifi_scan() -> Result<system::WifiScan, String> {
    blocking(system::wifi_scan).await
}

#[tauri::command]
async fn wifi_connect(ssid: String, password: Option<String>) -> Result<String, String> {
    blocking(move || system::wifi_connect(&ssid, password.as_deref())).await
}

#[tauri::command]
async fn bluetooth_devices() -> Result<Vec<system::BtDevice>, String> {
    blocking(system::bluetooth_devices).await
}

#[tauri::command]
async fn location() -> Result<Option<(f64, f64)>, String> {
    blocking(system::location).await
}

#[tauri::command]
fn open_settings(page: String) -> Result<(), String> {
    const ALLOWED: [&str; 4] = [
        "ms-settings:bluetooth",
        "ms-settings:network-wifi",
        "ms-settings:privacy-location",
        "ms-settings:sound",
    ];
    if !ALLOWED.contains(&page.as_str()) {
        return Err("unknown settings page".into());
    }
    std::process::Command::new("explorer")
        .arg(page)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_hit(state: State<HitRect>, x: f64, y: f64, w: f64, h: f64, compact: Option<bool>) {
    *state.0.lock().unwrap() = ([x, y, w, h], compact.unwrap_or(false));
}

/// Lines from the island's JavaScript (errors, events), printed to the dev console.
#[tauri::command]
fn log(line: String) {
    println!("[island] {line}");
}

#[tauri::command]
fn monitors(app: AppHandle) -> Vec<String> {
    let Some(window) = app.get_webview_window("main") else { return vec![] };
    window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let size = m.size();
            let name = m.name().cloned().unwrap_or_else(|| "Màn hình".into());
            let name = name.trim_start_matches("\\\\.\\").to_string();
            format!("{name} ({}×{})", size.width, size.height)
        })
        .collect()
}

#[tauri::command]
fn set_monitor(app: AppHandle, index: usize) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("no island window")?;
    place(&window, index).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_autostart() -> bool {
    system::get_autostart()
}

#[tauri::command]
fn set_autostart(on: bool) -> Result<(), String> {
    system::set_autostart(on).map_err(|e| e.message().to_string())
}

#[tauri::command]
fn set_hotkey(app: AppHandle, accelerator: String) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    shortcuts.unregister_all().map_err(|e| e.to_string())?;
    if accelerator.trim().is_empty() {
        return Ok(());
    }
    let shortcut: Shortcut = accelerator.parse().map_err(|e| format!("{e:?}"))?;
    shortcuts.register(shortcut).map_err(|e| e.to_string())
}

/// Centre the window at the top of the chosen monitor.
fn place(window: &WebviewWindow, index: usize) -> tauri::Result<()> {
    let monitors = window.available_monitors()?;
    let monitor = monitors
        .get(index)
        .cloned()
        .or(window.primary_monitor()?)
        .or(window.current_monitor()?);
    if let Some(monitor) = monitor {
        let screen = monitor.position();
        let width = window.outer_size()?.width as i32;
        window.set_position(PhysicalPosition::new(
            screen.x + (monitor.size().width as i32 - width) / 2,
            screen.y,
        ))?;
    }
    Ok(())
}

fn open_settings_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("settings") {
        window.show()?;
        return window.set_focus();
    }
    WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
        .title("Tuỳ chỉnh Dynamic Islands")
        .inner_size(500.0, 680.0)
        .min_inner_size(440.0, 400.0)
        .theme(Some(tauri::Theme::Dark))
        .center()
        .build()?;
    Ok(())
}

fn toggle_island(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(true) {
            let _ = window.hide();
        } else {
            let _ = window.show();
        }
    }
}

/// Let clicks through everywhere except over the island itself. While compact, the
/// island also steps aside (fades out, clicks pass through) when the pointer is over it
/// and an app window lies underneath; holding Ctrl keeps it in place.
fn watch_cursor(window: WebviewWindow) {
    std::thread::spawn(move || {
        let ours = window
            .hwnd()
            .map(|h| windows::Win32::Foundation::HWND(h.0 as *mut core::ffi::c_void))
            .ok();
        let mut ignoring: Option<bool> = None;
        let mut peeking = false;
        loop {
            std::thread::sleep(Duration::from_millis(30));
            let (Ok(cursor), Ok(origin), Ok(scale)) = (
                window.cursor_position(),
                window.outer_position(),
                window.scale_factor(),
            ) else {
                continue;
            };
            let ([x, y, w, h], compact) = *window.state::<HitRect>().0.lock().unwrap();
            let cx = (cursor.x - origin.x as f64) / scale;
            let cy = (cursor.y - origin.y as f64) / scale;
            let inside = cx >= x && cx <= x + w && cy >= y && cy <= y + h;

            let peek = inside
                && compact
                && !behind::ctrl_down()
                && ours.is_some_and(|hwnd| {
                    behind::window_below(
                        hwnd,
                        windows::Win32::Foundation::POINT { x: cursor.x as i32, y: cursor.y as i32 },
                    )
                });
            if peek != peeking {
                peeking = peek;
                let _ = window.emit("island-peek", peek);
            }

            let ignore = !inside || peek;
            if ignoring != Some(ignore) && window.set_ignore_cursor_events(ignore).is_ok() {
                ignoring = Some(ignore);
            }
        }
    });
}

/// Stream five frequency bands of what is playing to the island for the music wave.
fn watch_audio(app: AppHandle) {
    std::thread::spawn(move || {
        system::init_mta();
        spectrum::run(|levels| {
            let _ = app.emit("audio-bands", levels);
        });
    });
}

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_island(app);
                    }
                })
                .build(),
        )
        .manage(HitRect(Mutex::new(([0.0; 4], true))))
        .setup(|app| {
            let customize = MenuItem::with_id(app, "customize", "Tuỳ chỉnh…", true, None::<&str>)?;
            let toggle = MenuItem::with_id(app, "toggle", "Ẩn / hiện island", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Thoát", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&customize, &toggle, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Dynamic Islands")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "customize" => {
                        let _ = open_settings_window(app);
                    }
                    "toggle" => toggle_island(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                place(&window, 0)?;
                watch_cursor(window);
            }
            watch_audio(app.handle().clone());
            // Instant power and Bluetooth notifications (the island also polls as a fallback).
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                system::init_mta();
                if let Err(e) = watch::power(handle.clone()) {
                    println!("[island] power watch failed: {e:?}");
                }
                if let Err(e) = watch::bluetooth(handle) {
                    println!("[island] bluetooth watch failed: {e:?}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            media_info,
            media_control,
            battery,
            volume,
            set_volume,
            radios,
            set_radio,
            set_airplane,
            wifi_scan,
            wifi_connect,
            bluetooth_devices,
            location,
            open_settings,
            set_hit,
            monitors,
            set_monitor,
            get_autostart,
            set_autostart,
            set_hotkey,
            log
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dynamic Islands");
}
