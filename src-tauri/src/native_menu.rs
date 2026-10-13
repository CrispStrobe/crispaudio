//! macOS menu bar. Text fields use AppKit's responder-chain editing actions;
//! timeline actions are emitted to the same frontend handlers as the toolbar.
use serde::Deserialize;

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct MenuContext {
    language: String,
    disabled_tools: Vec<String>,
    labels: std::collections::HashMap<String, String>,
    ready: bool,
    timeline: bool,
    text_editing: bool,
    blocked: bool,
    help_mode: bool,
    can_undo: bool,
    can_redo: bool,
    selection: bool,
    clipboard: bool,
    content: bool,
    loop_enabled: bool,
    snap_enabled: bool,
    edit_range: bool,
    range_mode: bool,
}

#[tauri::command]
pub fn configure_native_menu(app: tauri::AppHandle, context: MenuContext) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    install(&app, &context).map_err(|error| error.to_string())?;
    let _ = (app, context);
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn install(app: &tauri::AppHandle, context: &MenuContext) -> tauri::Result<()> {
    use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem as Native, Submenu};
    let de = context.language.starts_with("de");
    let label = |en: &'static str, german: &'static str| {
        context
            .labels
            .get(en)
            .map(String::as_str)
            .unwrap_or(if de { german } else { en })
    };
    let enabled = context.ready && !context.blocked;
    let timeline = enabled && context.timeline && !context.text_editing;
    let item = |id: &str, en: &'static str, german: &'static str, active, key: Option<&str>| {
        MenuItem::with_id(
            app,
            format!("ca-{id}"),
            label(en, german),
            active && !context.disabled_tools.iter().any(|tool| tool == id),
            key,
        )
    };
    let sep = || Native::separator(app);
    let app_menu = Submenu::with_items(
        app,
        "CrispAudio",
        true,
        &[
            &item(
                "about",
                "About CrispAudio",
                "Über CrispAudio",
                enabled,
                None,
            )?,
            &sep()?,
            &item(
                "settings",
                "Settings…",
                "Einstellungen…",
                enabled,
                Some("CmdOrCtrl+Comma"),
            )?,
            &sep()?,
            &Native::services(app, None)?,
            &sep()?,
            &Native::hide(app, None)?,
            &Native::hide_others(app, None)?,
            &Native::show_all(app, None)?,
            &sep()?,
            &Native::quit(app, None)?,
        ],
    )?;
    let file = Submenu::with_items(
        app,
        label("File", "Ablage"),
        true,
        &[
            &item(
                "new",
                "New Project…",
                "Neues Projekt…",
                enabled,
                Some("CmdOrCtrl+N"),
            )?,
            &item(
                "open",
                "Open Project…",
                "Projekt öffnen…",
                enabled,
                Some("CmdOrCtrl+O"),
            )?,
            &item(
                "save",
                "Save Project…",
                "Projekt speichern…",
                enabled,
                Some("CmdOrCtrl+S"),
            )?,
            &sep()?,
            &item(
                "import",
                "Import Audio…",
                "Audio importieren…",
                enabled,
                Some("CmdOrCtrl+I"),
            )?,
            &item(
                "export",
                "Export Audio Mix…",
                "Audiomischung exportieren…",
                enabled && context.content,
                Some("CmdOrCtrl+Shift+E"),
            )?,
            &item(
                "export-range",
                "Export Selected Audio Range…",
                "Ausgewählten Audiobereich exportieren…",
                enabled && context.edit_range,
                None,
            )?,
            &sep()?,
            &item(
                "load-tracks",
                "Import Tracks…",
                "Spuren importieren…",
                enabled,
                None,
            )?,
            &item(
                "save-tracks",
                "Save Tracks…",
                "Spuren speichern…",
                timeline,
                None,
            )?,
            &item("delivery", "Delivery…", "Ausgabe…", timeline, None)?,
            &item(
                "export-video",
                "Export Video…",
                "Video exportieren…",
                timeline && context.content,
                None,
            )?,
            &sep()?,
            &item(
                "walkthroughs",
                "Sample Walkthroughs…",
                "Beispielanleitungen…",
                enabled,
                None,
            )?,
            &item(
                "review-export",
                "Review Export…",
                "Export prüfen…",
                timeline,
                None,
            )?,
            &item(
                "samples",
                "Sample Sessions…",
                "Beispielsitzungen…",
                enabled,
                None,
            )?,
            &sep()?,
            &Native::close_window(app, None)?,
        ],
    )?;
    let edit = Submenu::new(app, label("Edit", "Bearbeiten"), true)?;
    if !context.help_mode && context.text_editing {
        edit.append_items(&[
            &Native::undo(app, None)?,
            &Native::redo(app, None)?,
            &sep()?,
            &Native::cut(app, None)?,
            &Native::copy(app, None)?,
            &Native::paste(app, None)?,
            &Native::select_all(app, None)?,
        ])?;
    } else {
        edit.append_items(&[
            &item(
                "undo",
                "Undo",
                "Rückgängig",
                enabled && context.can_undo,
                Some("CmdOrCtrl+Z"),
            )?,
            &item(
                "redo",
                "Redo",
                "Wiederholen",
                enabled && context.can_redo,
                Some("CmdOrCtrl+Shift+Z"),
            )?,
            &sep()?,
            &item(
                "cut",
                "Cut",
                "Ausschneiden",
                timeline && context.selection,
                Some("CmdOrCtrl+X"),
            )?,
            &item(
                "copy",
                "Copy",
                "Kopieren",
                timeline && context.selection,
                Some("CmdOrCtrl+C"),
            )?,
            &item(
                "paste",
                "Paste at Playhead",
                "Am Abspielkopf einfügen",
                timeline && context.clipboard,
                Some("CmdOrCtrl+V"),
            )?,
            &item(
                "delete",
                "Delete Selected Clips",
                "Ausgewählte Clips löschen",
                timeline && context.selection,
                Some("Backspace"),
            )?,
            &sep()?,
            &item(
                "select-all",
                "Select All Clips",
                "Alle Clips auswählen",
                timeline && context.content,
                Some("CmdOrCtrl+A"),
            )?,
            &item(
                "deselect",
                "Deselect All",
                "Auswahl aufheben",
                timeline && context.selection,
                Some("CmdOrCtrl+Shift+A"),
            )?,
        ])?;
    }
    edit.append_items(&[
        &sep()?,
        &item(
            "clip-settings",
            "Clip Settings…",
            "Clip-Einstellungen…",
            timeline && context.selection,
            None,
        )?,
        &item(
            "fades",
            "Fades…",
            "Blenden…",
            timeline && context.selection,
            None,
        )?,
        &item(
            "retime",
            "Speed / Pitch…",
            "Tempo / Tonhöhe…",
            timeline && context.selection,
            None,
        )?,
        &item(
            "blend",
            "Crossfade Overlaps",
            "Überlappungen überblenden",
            timeline && context.selection,
            None,
        )?,
        &item(
            "split-all",
            "Split All at Playhead",
            "Alle am Abspielkopf teilen",
            timeline && context.content,
            None,
        )?,
        &item(
            "range-tools",
            "Range Edits…",
            "Bereich bearbeiten…",
            timeline && context.edit_range,
            None,
        )?,
        &item(
            "nudge-left",
            "Nudge Left",
            "Nach links verschieben",
            timeline && context.selection,
            None,
        )?,
        &item(
            "nudge-right",
            "Nudge Right",
            "Nach rechts verschieben",
            timeline && context.selection,
            None,
        )?,
        &item(
            "nudge-settings",
            "Nudge Step…",
            "Verschiebeschritt…",
            timeline,
            None,
        )?,
        &item(
            "edit-groups",
            "Named Edit Groups…",
            "Benannte Schnittgruppen…",
            timeline && context.content,
            None,
        )?,
        &item(
            "commands",
            "Find Command…",
            "Befehl suchen…",
            enabled,
            Some("CmdOrCtrl+K"),
        )?,
        &item(
            "place-clips",
            "Place Clips at Time…",
            "Clips zeitlich platzieren…",
            timeline && context.selection,
            None,
        )?,
        &item(
            "trim-start-playhead",
            "Trim Start to Playhead",
            "Anfang bis Abspielposition kürzen",
            timeline && context.selection,
            None,
        )?,
        &item(
            "trim-end-playhead",
            "Trim End to Playhead",
            "Ende bis Abspielposition kürzen",
            timeline && context.selection,
            None,
        )?,
        &item(
            "previous-clip",
            "Select Previous Clip",
            "Vorigen Clip auswählen",
            timeline,
            None,
        )?,
        &item(
            "next-clip",
            "Select Next Clip",
            "Nächsten Clip auswählen",
            timeline,
            None,
        )?,
        &item(
            "clip-above",
            "Select Clip Above",
            "Clip darüber auswählen",
            timeline,
            None,
        )?,
        &item(
            "clip-below",
            "Select Clip Below",
            "Clip darunter auswählen",
            timeline,
            None,
        )?,
        &item(
            "trim-tools",
            "Trim Tools…",
            "Schnittwerkzeuge…",
            timeline && context.selection,
            None,
        )?,
        &item(
            "previous-edit",
            "Previous Edit Point",
            "Vorherige Schnittkante",
            timeline && context.content,
            Some("CmdOrCtrl+Alt+Left"),
        )?,
        &item(
            "next-edit",
            "Next Edit Point",
            "Nächste Schnittkante",
            timeline && context.content,
            Some("CmdOrCtrl+Alt+Right"),
        )?,
        &item(
            "split",
            "Split Selected at Playhead",
            "Auswahl am Abspielkopf teilen",
            timeline && context.selection,
            Some("CmdOrCtrl+B"),
        )?,
        &item(
            "add-track",
            "Add Audio Track",
            "Audiospur hinzufügen",
            enabled,
            Some("CmdOrCtrl+Shift+N"),
        )?,
    ])?;
    let view = Submenu::with_items(
        app,
        label("View", "Darstellung"),
        true,
        &[
            &item("mixer", "Mixer", "Mixer", timeline, None)?,
            &item("automation", "Automation", "Automation", timeline, None)?,
            &item(
                "navigation-view",
                "Show / Hide Zoom and Navigation",
                "Zoom und Navigation ein-/ausblenden",
                timeline,
                None,
            )?,
            &item(
                "view-settings",
                "Timeline View…",
                "Zeitleistenansicht…",
                timeline,
                None,
            )?,
            &item(
                "track-folders",
                "Track Folders…",
                "Spurordner…",
                timeline,
                None,
            )?,
            &item(
                "track-settings",
                "Track Settings…",
                "Spureinstellungen…",
                timeline,
                None,
            )?,
            &sep()?,
            &item(
                "zoom-in",
                "Zoom In Timeline",
                "Zeitleiste vergrößern",
                enabled,
                Some("CmdOrCtrl+Equal"),
            )?,
            &item(
                "zoom-out",
                "Zoom Out Timeline",
                "Zeitleiste verkleinern",
                enabled,
                Some("CmdOrCtrl+Minus"),
            )?,
            &item(
                "fit",
                "Fit All Tracks",
                "Alle Spuren einpassen",
                enabled && context.content,
                Some("CmdOrCtrl+0"),
            )?,
            &item(
                "waveform-mode",
                "Waveform Display",
                "Wellenformdarstellung",
                timeline,
                None,
            )?,
            &item("height-up", "Taller Tracks", "Spuren höher", enabled, None)?,
            &item(
                "height-down",
                "Shorter Tracks",
                "Spuren niedriger",
                enabled,
                None,
            )?,
            &sep()?,
            &CheckMenuItem::with_id(
                app,
                "ca-snap",
                label("Snap to Clip Edges", "An Clip-Kanten einrasten"),
                timeline,
                context.snap_enabled,
                None::<&str>,
            )?,
            &item(
                "workspace",
                "Show / Hide Workspace",
                "Arbeitsbereich ein-/ausblenden",
                enabled,
                None,
            )?,
            &sep()?,
            &item(
                "timeline",
                "Timeline",
                "Zeitleiste",
                enabled,
                Some("CmdOrCtrl+3"),
            )?,
            &item("voice", "Voice", "Stimme", enabled, Some("CmdOrCtrl+2"))?,
            &item(
                "sfx",
                "Sound Effects",
                "Klangeffekte",
                enabled,
                Some("CmdOrCtrl+1"),
            )?,
        ],
    )?;
    let playback = Submenu::with_items(
        app,
        label("Playback", "Wiedergabe"),
        true,
        &[
            &item(
                "recording",
                "Record / Takes…",
                "Aufnahme / Takes…",
                timeline,
                Some("CmdOrCtrl+Shift+R"),
            )?,
            &item(
                "play",
                "Play / Pause",
                "Wiedergabe / Pause",
                timeline && context.content,
                None,
            )?,
            &item(
                "play-range",
                "Play Selected Range",
                "Ausgewählten Bereich abspielen",
                timeline && context.edit_range,
                Some("CmdOrCtrl+Shift+Space"),
            )?,
            &CheckMenuItem::with_id(
                app,
                "ca-range-mode",
                label("Select Time Range", "Zeitbereich auswählen"),
                timeline && context.content,
                context.range_mode,
                None::<&str>,
            )?,
            &item(
                "clear-range",
                "Clear Time Range",
                "Zeitbereich löschen",
                timeline && context.edit_range,
                None,
            )?,
            &item("stop", "Stop", "Stopp", timeline && context.content, None)?,
            &item(
                "start",
                "Go to Beginning",
                "Zum Anfang",
                timeline && context.content,
                None,
            )?,
            &item(
                "end",
                "Go to End",
                "Zum Ende",
                timeline && context.content,
                None,
            )?,
            &sep()?,
            &CheckMenuItem::with_id(
                app,
                "ca-loop",
                label("Loop", "Wiedergabeschleife"),
                timeline,
                context.loop_enabled,
                Some("CmdOrCtrl+L"),
            )?,
        ],
    )?;
    let tools = Submenu::with_items(
        app,
        label("Tools", "Werkzeuge"),
        true,
        &[
            &item("mix-review", "Mix A/B…", "Mix A/B…", timeline, None)?,
            &item(
                "align",
                "Alignment…",
                "Ausrichtung…",
                timeline && context.content,
                None,
            )?,
            &item(
                "auto-sync",
                "Synchronize Tracks…",
                "Spuren synchronisieren…",
                timeline && context.content,
                None,
            )?,
            &item(
                "source-speech",
                "Source Transcripts…",
                "Quelltranskripte…",
                timeline && context.content,
                None,
            )?,
            &item("tts", "Text to Speech…", "Sprachausgabe…", timeline, None)?,
            &sep()?,
            &item(
                "video-setup",
                "Video Setup…",
                "Video einrichten…",
                timeline,
                None,
            )?,
            &item(
                "open-session",
                "Open Media Session…",
                "Mediensitzung öffnen…",
                timeline,
                None,
            )?,
            &item(
                "detach-video",
                "Detach Video",
                "Video entfernen",
                timeline,
                None,
            )?,
            &item(
                "recover-media",
                "Recover Media…",
                "Medien wiederherstellen…",
                timeline,
                None,
            )?,
            &item("multicam", "Multicam…", "Mehrkamera…", timeline, None)?,
            &sep()?,
            &item(
                "musical-time",
                "Musical Time…",
                "Musikalische Zeit…",
                timeline,
                None,
            )?,
            &item("midi", "MIDI…", "MIDI…", timeline, None)?,
        ],
    )?;
    let window = Submenu::with_items(
        app,
        label("Window", "Fenster"),
        true,
        &[
            &Native::minimize(app, None)?,
            &Native::maximize(app, None)?,
            &Native::fullscreen(app, None)?,
        ],
    )?;
    let help = Submenu::with_items(
        app,
        label("Help", "Hilfe"),
        true,
        &[
            &item(
                "help",
                "Explain Timeline Controls",
                "Bedienelemente der Zeitleiste erklären",
                enabled,
                None,
            )?,
            &item(
                "shortcuts",
                "Keyboard Shortcuts",
                "Tastaturkurzbefehle",
                enabled,
                None,
            )?,
        ],
    )?;
    app.set_menu(Menu::with_items(
        app,
        &[
            &app_menu, &file, &edit, &view, &playback, &tools, &window, &help,
        ],
    )?)?;
    Ok(())
}
