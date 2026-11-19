//! Push notifications from Windows instead of polling: power plugged/unplugged and
//! Bluetooth devices connecting/disconnecting reach the island the moment they happen.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use windows::core::{IInspectable, HSTRING};
use windows::Devices::Bluetooth::{BluetoothDevice, BluetoothLEDevice};
use windows::Devices::Enumeration::{
    DeviceInformation, DeviceInformationKind, DeviceInformationUpdate, DeviceWatcher,
};
use windows::Foundation::{EventHandler, IReference, TypedEventHandler};
use windows::System::Power::PowerManager;
use windows_collections::IIterable;
use windows_core::Interface;

const CONNECTED: &str = "System.Devices.Aep.IsConnected";

#[derive(Serialize, Clone)]
struct BtChange {
    name: String,
    connected: bool,
}

/// Plugged in / unplugged, battery level changes.
pub fn power(app: AppHandle) -> windows::core::Result<()> {
    let notify = move || {
        let _ = app.emit("power-changed", crate::system::battery());
    };
    let a = notify.clone();
    PowerManager::PowerSupplyStatusChanged(&EventHandler::<IInspectable>::new(move |_, _| {
        a();
        Ok(())
    }))?;
    PowerManager::BatteryStatusChanged(&EventHandler::<IInspectable>::new(move |_, _| {
        notify();
        Ok(())
    }))?;
    Ok(())
}

fn connected_of(props: &windows_collections::IMapView<HSTRING, IInspectable>) -> Option<bool> {
    props
        .Lookup(&HSTRING::from(CONNECTED))
        .ok()
        .and_then(|v| v.cast::<IReference<bool>>().ok())
        .and_then(|r| r.Value().ok())
}

/// Paired Bluetooth devices (classic and low-energy) connecting or disconnecting.
pub fn bluetooth(app: AppHandle) -> windows::core::Result<()> {
    let known: &'static Mutex<HashMap<String, (String, bool)>> = Box::leak(Box::new(Mutex::new(HashMap::new())));
    for selector in [
        BluetoothDevice::GetDeviceSelectorFromPairingState(true)?,
        BluetoothLEDevice::GetDeviceSelectorFromPairingState(true)?,
    ] {
        let props: IIterable<HSTRING> = vec![HSTRING::from(CONNECTED)].into();
        let watcher = DeviceInformation::CreateWatcherWithKindAqsFilterAndAdditionalProperties(
            &selector,
            &props,
            DeviceInformationKind::AssociationEndpoint,
        )?;

        watcher.Added(&TypedEventHandler::<DeviceWatcher, DeviceInformation>::new(move |_, info| {
            if let Some(info) = info.as_ref() {
                let connected = info.Properties().ok().and_then(|p| connected_of(&p)).unwrap_or(false);
                let name = info.Name().map(|n| n.to_string().trim().to_string()).unwrap_or_default();
                known.lock().unwrap().insert(info.Id()?.to_string(), (name, connected));
            }
            Ok(())
        }))?;

        let app = app.clone();
        watcher.Updated(&TypedEventHandler::<DeviceWatcher, DeviceInformationUpdate>::new(move |_, update| {
            let Some(update) = update.as_ref() else { return Ok(()) };
            let Some(connected) = update.Properties().ok().and_then(|p| connected_of(&p)) else {
                return Ok(());
            };
            let id = update.Id()?.to_string();
            let change = {
                let mut map = known.lock().unwrap();
                match map.get_mut(&id) {
                    Some((name, was)) if *was != connected => {
                        *was = connected;
                        Some(BtChange { name: name.clone(), connected })
                    }
                    _ => None,
                }
            };
            if let Some(change) = change {
                let _ = app.emit("bt-changed", change);
            }
            Ok(())
        }))?;

        watcher.Start()?;
        // The watcher lives as long as the app.
        std::mem::forget(watcher);
    }
    Ok(())
}
