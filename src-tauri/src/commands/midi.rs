//! Explicit, input-only MIDI connection. No output or SysEx is exposed.
use serde::Serialize;
#[derive(Clone, Serialize)]
pub struct MidiPort {
    id: String,
    name: String,
}
#[cfg(target_os = "macos")]
#[derive(Default)]
pub struct MidiState(std::sync::Mutex<Option<(String, midir::MidiInputConnection<()>)>>);
#[cfg(not(target_os = "macos"))]
#[derive(Default)]
pub struct MidiState;
#[tauri::command]
pub fn list_midi_inputs() -> Result<Vec<MidiPort>, String> {
    #[cfg(target_os = "macos")]
    {
        let input =
            midir::MidiInput::new("CrispAudio input discovery").map_err(|e| e.to_string())?;
        input
            .ports()
            .iter()
            .map(|p| {
                Ok(MidiPort {
                    id: p.id(),
                    name: input.port_name(p).map_err(|e| e.to_string())?,
                })
            })
            .collect()
    }
    #[cfg(not(target_os = "macos"))]
    Err("Native MIDI input is available on macOS; use browser MIDI where supported".into())
}
/// Only ordinary channel notes and sustain/panic controls enter the webview.
fn supported_message(data: &[u8]) -> bool {
    if data.len() != 3 || data[1] > 127 || data[2] > 127 {
        return false;
    }
    matches!(data[0] & 0xf0, 0x80 | 0x90)
        || (data[0] & 0xf0 == 0xb0 && matches!(data[1], 64 | 120 | 123))
}
#[tauri::command]
pub fn connect_midi_input(
    app: tauri::AppHandle,
    state: tauri::State<'_, MidiState>,
    id: String,
    session: String,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use tauri::Emitter;
        if session.len() > 128 || session.is_empty() {
            return Err("Invalid MIDI session".into());
        }
        let mut input =
            midir::MidiInput::new("CrispAudio MIDI input").map_err(|e| e.to_string())?;
        input.ignore(midir::Ignore::Sysex | midir::Ignore::Time | midir::Ignore::ActiveSense);
        let port = input
            .find_port_by_id(&id)
            .ok_or("MIDI device disconnected; refresh inputs")?;
        #[derive(Clone, Serialize)]
        struct Message {
            session: String,
            data: Vec<u8>,
        }
        let owner = session.clone();
        let connection = input
            .connect(
                &port,
                "CrispAudio notes",
                move |_, bytes, _| {
                    if supported_message(bytes) {
                        let _ = app.emit(
                            "crispaudio-midi",
                            Message {
                                session: session.clone(),
                                data: bytes.to_vec(),
                            },
                        );
                    }
                },
                (),
            )
            .map_err(|e| e.to_string())?;
        // A failed replacement leaves the previous connection intact.
        *state.0.lock().map_err(|e| e.to_string())? = Some((owner, connection));
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, state, id, session);
        Err("Native MIDI input is unavailable on this platform".into())
    }
}
#[tauri::command]
pub fn disconnect_midi_input(
    state: tauri::State<'_, MidiState>,
    session: String,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut connection = state.0.lock().map_err(|e| e.to_string())?;
        if connection
            .as_ref()
            .is_some_and(|(owner, _)| owner == &session)
        {
            *connection = None;
        }
    }
    let _ = (state, session);
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "macos")]
    #[test]
    fn virtual_core_midi_source_receives_filtered_notes_and_disconnects() {
        use midir::os::unix::VirtualOutput;
        let name = format!("CrispAudio validation {}", std::process::id());
        let mut source = midir::MidiOutput::new(&name)
            .unwrap()
            .create_virtual(&name)
            .unwrap();
        let input = midir::MidiInput::new("CrispAudio validation reader").unwrap();
        let port = input
            .ports()
            .into_iter()
            .find(|p| input.port_name(p).unwrap_or_default() == name)
            .expect("virtual CoreMIDI source is discoverable");
        assert!(list_midi_inputs()
            .unwrap()
            .iter()
            .any(|p| p.id == port.id()));
        let (send, receive) = std::sync::mpsc::channel();
        let connection = input
            .connect(
                &port,
                "CrispAudio validation input",
                move |_, bytes, _| {
                    if supported_message(bytes) {
                        send.send(bytes.to_vec()).unwrap();
                    }
                },
                (),
            )
            .unwrap();
        source.send(&[0x90, 69, 100]).unwrap();
        assert_eq!(
            receive
                .recv_timeout(std::time::Duration::from_secs(2))
                .unwrap(),
            vec![0x90, 69, 100]
        );
        source.send(&[0xb0, 64, 127]).unwrap();
        assert_eq!(
            receive
                .recv_timeout(std::time::Duration::from_secs(2))
                .unwrap(),
            vec![0xb0, 64, 127]
        );
        drop(connection);
        source.send(&[0x80, 69, 0]).unwrap();
        assert!(receive
            .recv_timeout(std::time::Duration::from_millis(100))
            .is_err());
    }
    #[test]
    fn input_filter_accepts_notes_and_sustain_but_rejects_programming_and_invalid_bytes() {
        for data in [
            [0x90, 60, 100],
            [0x82, 60, 0],
            [0xb3, 64, 127],
            [0xb0, 123, 0],
        ] {
            assert!(supported_message(&data));
        }
        for data in [
            vec![0xf0, 60, 1],
            vec![0xc0, 1],
            vec![0xb0, 7, 100],
            vec![0x90, 128, 1],
            vec![0x90, 60, 1, 0],
        ] {
            assert!(!supported_message(&data));
        }
    }
}
