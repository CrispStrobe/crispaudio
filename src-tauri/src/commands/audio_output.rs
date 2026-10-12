//! The WKWebView uses the macOS default output. Expose real CoreAudio output
//! devices, and change that default only in response to explicit UI selection.
use serde::Serialize;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputDevice {
    pub id: String,
    pub label: String,
    pub is_default: bool,
}
#[tauri::command]
pub fn list_audio_outputs() -> Result<Vec<OutputDevice>, String> {
    platform::list()
}
#[tauri::command]
pub fn select_audio_output(id: String) -> Result<(), String> {
    platform::select(&id)
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::OutputDevice;
    pub fn list() -> Result<Vec<OutputDevice>, String> {
        Err("Native output selection is available on macOS".into())
    }
    pub fn select(_: &str) -> Result<(), String> {
        Err("Native output selection is available on macOS".into())
    }
}
#[cfg(target_os = "macos")]
mod platform {
    use super::OutputDevice;
    use std::ffi::{c_char, c_void};
    #[repr(C)]
    struct Address {
        selector: u32,
        scope: u32,
        element: u32,
    }
    const fn code(s: &[u8; 4]) -> u32 {
        u32::from_be_bytes(*s)
    }
    const SYSTEM: u32 = 1;
    fn address(selector: &[u8; 4], scope: &[u8; 4]) -> Address {
        Address {
            selector: code(selector),
            scope: code(scope),
            element: 0,
        }
    }
    #[link(name = "CoreAudio", kind = "framework")]
    extern "C" {
        fn AudioObjectGetPropertyDataSize(
            object: u32,
            address: *const Address,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: *mut u32,
        ) -> i32;
        fn AudioObjectGetPropertyData(
            object: u32,
            address: *const Address,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: *mut u32,
            data: *mut c_void,
        ) -> i32;
        fn AudioObjectSetPropertyData(
            object: u32,
            address: *const Address,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: u32,
            data: *const c_void,
        ) -> i32;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringGetCString(
            string: *const c_void,
            buffer: *mut c_char,
            size: isize,
            encoding: u32,
        ) -> bool;
        fn CFRelease(value: *const c_void);
    }
    fn check(status: i32) -> Result<(), String> {
        if status == 0 {
            Ok(())
        } else {
            Err(format!("CoreAudio output error ({status})"))
        }
    }
    fn data_size(device: u32, a: &Address) -> Result<u32, String> {
        let mut size = 0;
        check(unsafe {
            AudioObjectGetPropertyDataSize(device, a, 0, std::ptr::null(), &mut size)
        })?;
        Ok(size)
    }
    fn number(device: u32, a: &Address) -> Result<u32, String> {
        let mut value = 0u32;
        let mut size = 4;
        check(unsafe {
            AudioObjectGetPropertyData(
                device,
                a,
                0,
                std::ptr::null(),
                &mut size,
                (&mut value as *mut u32).cast(),
            )
        })?;
        if size != 4 {
            return Err("Invalid CoreAudio output value".into());
        }
        Ok(value)
    }
    fn string(device: u32, selector: &[u8; 4]) -> Result<String, String> {
        let mut value: *const c_void = std::ptr::null();
        let mut size = std::mem::size_of_val(&value) as u32;
        check(unsafe {
            AudioObjectGetPropertyData(
                device,
                &address(selector, b"glob"),
                0,
                std::ptr::null(),
                &mut size,
                (&mut value as *mut *const c_void).cast(),
            )
        })?;
        if value.is_null() {
            return Err("Missing audio device name".into());
        }
        let mut bytes = [0u8; 4096];
        let converted = unsafe {
            CFStringGetCString(
                value,
                bytes.as_mut_ptr().cast(),
                bytes.len() as isize,
                0x08000100,
            )
        };
        unsafe { CFRelease(value) };
        if !converted {
            return Err("Audio device name is too long".into());
        }
        let end = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
        String::from_utf8(bytes[..end].to_vec()).map_err(|_| "Invalid audio device name".into())
    }
    fn devices() -> Result<Vec<u32>, String> {
        let a = address(b"dev#", b"glob");
        let mut size = data_size(SYSTEM, &a)?;
        if size % 4 != 0 || size > 65536 {
            return Err("Invalid audio device list".into());
        }
        let mut devices = vec![0u32; size as usize / 4];
        check(unsafe {
            AudioObjectGetPropertyData(
                SYSTEM,
                &a,
                0,
                std::ptr::null(),
                &mut size,
                devices.as_mut_ptr().cast(),
            )
        })?;
        devices.truncate(size as usize / 4);
        Ok(devices)
    }
    fn output(device: u32) -> bool {
        data_size(device, &address(b"stm#", b"outp")).is_ok_and(|size| size > 0)
    }
    pub fn list() -> Result<Vec<OutputDevice>, String> {
        let default = number(SYSTEM, &address(b"dOut", b"glob"))?;
        devices()?
            .into_iter()
            .filter(|d| output(*d))
            .map(|d| {
                Ok(OutputDevice {
                    id: string(d, b"uid ")?,
                    label: string(d, b"lnam")?,
                    is_default: d == default,
                })
            })
            .collect()
    }
    pub fn select(uid: &str) -> Result<(), String> {
        let device = devices()?
            .into_iter()
            .find(|d| output(*d) && string(*d, b"uid ").is_ok_and(|id| id == uid))
            .ok_or("Output device disconnected; refresh the list")?;
        check(unsafe {
            AudioObjectSetPropertyData(
                SYSTEM,
                &address(b"dOut", b"glob"),
                0,
                std::ptr::null(),
                4,
                (&device as *const u32).cast(),
            )
        })?;
        if number(SYSTEM, &address(b"dOut", b"glob"))? != device {
            return Err("macOS did not select the requested output".into());
        }
        Ok(())
    }
    #[test]
    #[ignore = "Requires a real macOS output device; run explicitly on hardware"]
    fn actual_output_devices_include_a_named_default() {
        let list = list().unwrap();
        assert!(list.iter().any(|d| d.is_default));
        select(&list.iter().find(|d| d.is_default).unwrap().id).unwrap();
        assert!(list.iter().all(|d| !d.id.is_empty() && !d.label.is_empty()));
        assert!(select("crispaudio-missing-device").is_err());
    }
}
