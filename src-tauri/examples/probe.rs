// Prints what the island sees for Bluetooth devices and power, for debugging.
#[path = "../src/system.rs"]
mod system;

fn main() {
    system::init_mta();
    for i in 0..3 {
        match system::bluetooth_devices() {
            Ok(list) => println!("bt[{i}]: {}", serde_json::to_string(&list).unwrap()),
            Err(e) => println!("bt[{i}] error: {e:?}"),
        }
        println!("battery[{i}]: {}", serde_json::to_string(&system::battery()).unwrap());
        std::thread::sleep(std::time::Duration::from_secs(2));
    }
}
