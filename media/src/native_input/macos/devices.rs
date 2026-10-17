//! Read-only CoreAudio input/output inventory. Never changes defaults or rates.
use crate::Result;
use std::ffi::{c_char, c_void};

#[derive(Clone, Debug)]
pub struct InputDevice {
    pub uid: String,
    pub label: String,
    pub channels: u32,
    pub nominal_rate: f64,
    pub is_default: bool,
}
#[repr(C)]
struct Address {
    selector: u32,
    scope: u32,
    element: u32,
}
fn address(selector: &[u8; 4], input: bool) -> Address {
    Address {
        selector: u32::from_be_bytes(*selector),
        scope: u32::from_be_bytes(if input { *b"inpt" } else { *b"glob" }),
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
fn check(status: i32) -> Result<()> {
    if status == 0 {
        Ok(())
    } else {
        Err(format!("CoreAudio input property error ({status})"))
    }
}
fn bytes(object: u32, a: Address) -> Result<Vec<u8>> {
    let mut size = 0;
    check(unsafe { AudioObjectGetPropertyDataSize(object, &a, 0, std::ptr::null(), &mut size) })?;
    if size > 65536 {
        return Err("Input device property exceeds limit".into());
    }
    let mut output = vec![0u8; size as usize];
    let capacity = size;
    check(unsafe {
        AudioObjectGetPropertyData(
            object,
            &a,
            0,
            std::ptr::null(),
            &mut size,
            output.as_mut_ptr().cast(),
        )
    })?;
    if size > capacity {
        return Err("Input device property changed size".into());
    }
    output.truncate(size as usize);
    Ok(output)
}
fn number(object: u32, selector: &[u8; 4]) -> Result<u32> {
    let data = bytes(object, address(selector, false))?;
    Ok(u32::from_ne_bytes(
        data.try_into().map_err(|_| "Invalid input device number")?,
    ))
}
fn text(object: u32, selector: &[u8; 4]) -> Result<String> {
    // CFString properties return a retained object, released on every path.
    let data = bytes(object, address(selector, false))?;
    let pointer = usize::from_ne_bytes(data.try_into().map_err(|_| "Invalid input device string")?)
        as *const c_void;
    if pointer.is_null() {
        return Err("Missing input device string".into());
    }
    let mut output = [0u8; 4096];
    let ok = unsafe {
        CFStringGetCString(
            pointer,
            output.as_mut_ptr().cast(),
            output.len() as isize,
            0x08000100,
        )
    };
    unsafe {
        CFRelease(pointer);
    }
    if !ok {
        return Err("Input device string exceeds limit".into());
    }
    let end = output
        .iter()
        .position(|b| *b == 0)
        .ok_or("Invalid input device string")?;
    String::from_utf8(output[..end].to_vec()).map_err(|_| "Invalid input device UTF-8".into())
}
#[repr(C)]
struct AudioBuffer {
    channels: u32,
    bytes: u32,
    data: *mut c_void,
}
#[repr(C)]
struct AudioBufferList {
    count: u32,
    buffers: [AudioBuffer; 0],
}
fn channel_count(data: &[u8]) -> Result<u32> {
    let header = std::mem::size_of::<AudioBufferList>();
    if data.len() < header {
        return Err("Invalid input stream configuration".into());
    }
    let count = u32::from_ne_bytes(data[..4].try_into().unwrap()) as usize;
    let stride = std::mem::size_of::<AudioBuffer>();
    if count > 32 || data.len() != header + count * stride {
        return Err("Invalid input channel layout".into());
    }
    let mut channels = 0u32;
    for buffer in data[header..].chunks_exact(stride) {
        channels = channels
            .checked_add(u32::from_ne_bytes(buffer[..4].try_into().unwrap()))
            .ok_or("Input channel count overflow")?;
    }
    if channels > 32 {
        return Err("Input devices with more than 32 channels are unsupported".into());
    }
    Ok(channels)
}
pub fn list_inputs() -> Result<Vec<InputDevice>> {
    list(true)
}
/// Same inventory fields as an input, for an explicitly selected output UID.
pub type OutputDevice = InputDevice;
pub fn list_outputs() -> Result<Vec<OutputDevice>> {
    list(false)
}
fn list(input: bool) -> Result<Vec<InputDevice>> {
    let data = bytes(1, address(b"dev#", false))?;
    if data.len() % 4 != 0 {
        return Err("Invalid input device inventory".into());
    }
    let default = number(1, if input { b"dIn " } else { b"dOut" })?;
    let mut devices = Vec::new();
    for value in data.chunks_exact(4) {
        let object = u32::from_ne_bytes(value.try_into().unwrap());
        // Hot-plug races omit the disappearing device, never select a replacement.
        let entry = (|| -> Result<Option<InputDevice>> {
            if number(object, b"livn")? != 1 {
                return Ok(None);
            }
            let mut stream_address = address(b"slay", true);
            if !input {
                stream_address.scope = u32::from_be_bytes(*b"outp");
            }
            let channels = channel_count(&bytes(object, stream_address)?)?;
            if channels == 0 {
                return Ok(None);
            }
            let rate = f64::from_ne_bytes(
                bytes(object, address(b"nsrt", false))?
                    .try_into()
                    .map_err(|_| "Invalid input sample rate")?,
            );
            if !rate.is_finite() || rate <= 0. {
                return Err("Invalid input sample rate".into());
            }
            Ok(Some(InputDevice {
                uid: text(object, b"uid ")?,
                label: text(object, b"lnam")?,
                channels,
                nominal_rate: rate,
                is_default: object == default,
            }))
        })();
        if let Ok(Some(entry)) = entry {
            devices.push(entry);
        }
    }
    Ok(devices)
}
pub(super) fn resolve(uid: &str) -> Result<InputDevice> {
    if uid.is_empty() || uid.len() > 4096 || uid.contains('\0') {
        return Err("Invalid input device UID".into());
    }
    list_inputs()?
        .into_iter()
        .find(|device| device.uid == uid)
        .ok_or("Selected input device is unavailable".into())
}

pub(super) fn resolve_output(uid: &str) -> Result<OutputDevice> {
    if uid.is_empty() || uid.len() > 4096 || uid.contains('\0') {
        return Err("Invalid output device UID".into());
    }
    list_outputs()?
        .into_iter()
        .find(|device| device.uid == uid)
        .ok_or("Selected output device is unavailable".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stream_layout_parsing_is_bounded_and_counts_all_buffers() {
        let header = std::mem::size_of::<AudioBufferList>();
        let stride = std::mem::size_of::<AudioBuffer>();
        let mut bytes = vec![0u8; header + 2 * stride];
        bytes[..4].copy_from_slice(&2u32.to_ne_bytes());
        bytes[header..header + 4].copy_from_slice(&1u32.to_ne_bytes());
        bytes[header + stride..header + stride + 4].copy_from_slice(&2u32.to_ne_bytes());
        assert_eq!(channel_count(&bytes).unwrap(), 3);
        assert!(channel_count(&bytes[..bytes.len() - 1]).is_err());
        bytes[header..header + 4].copy_from_slice(&u32::MAX.to_ne_bytes());
        assert!(channel_count(&bytes).is_err());
        bytes[..4].copy_from_slice(&33u32.to_ne_bytes());
        assert!(channel_count(&bytes).is_err());
    }
    #[test]
    fn inventory_is_read_only_and_contains_only_supported_inputs() {
        for device in list_inputs().unwrap() {
            assert!(!device.uid.is_empty());
            assert!((1..=32).contains(&device.channels));
            assert!(device.nominal_rate.is_finite() && device.nominal_rate > 0.);
        }
        assert!(resolve("\0").is_err());
    }
}
