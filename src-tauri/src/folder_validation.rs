//! Explicit native-validation mode: a real NSOpenPanel grant and a second launch.
//! No microphone, output device, installed session or production app data is used.
use serde_json::{json, Value};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

pub fn run(options: Value, mut context: tauri::Context<tauri::Wry>) {
    context.config_mut().app.windows.clear();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            // A windowless probe still needs a foreground application for its
            // native file picker; launch it through macOS Launch Services.
            app.set_activation_policy(tauri::ActivationPolicy::Regular);


            let expected = options["folder"].as_str().ok_or("Expected owned fixture folder")?.to_string();
            let mode = options["folderProbe"].as_str().ok_or("Expected probe mode")?.to_string();
            let denied = std::fs::read_dir(&expected).is_err();
            let handle = app.handle().clone();
            let picker_directory=std::path::PathBuf::from(&expected);
            let finish = move |selected: Option<String>| {
                let handle = handle.clone(); let expected = expected.clone(); let mode = mode.clone();
                tauri::async_runtime::spawn(async move {
                    let result: Result<Value,String> = async {
                        if !denied { return Err("Fixture was accessible before a picker/bookmark grant".into()); }
                        let file=handle.path().app_data_dir().map_err(|e|e.to_string())?.join("plugin-folders.json");
                        if mode=="select" {
                            if selected.as_deref()!=Some(&expected) {return Err("Owned fixture folder was not selected".into());}
                            crate::commands::plugins::remember_plugin_folder(handle.clone(),expected.clone()).await?;
                        } else if mode=="restore" {
                            let unavailable=crispaudio_media::security_scope::restore(&file)?;
                            if !unavailable.is_empty(){return Err("Saved fixture folder failed to restore".into());}
                        } else {return Err("Invalid folder probe mode".into());}
                        tauri::async_runtime::spawn_blocking(move || {
                            if std::fs::read_dir(&expected).is_err(){return Err("Parent folder access denied after grant".into());}
                            let report=crispaudio_media::apple::plugin("plugin-scan",&json!({"folders":[expected],"report":true}).to_string())?;
                            let vst=report["plugins"].as_array().ok_or("No plugins")?.iter().find(|v|v["name"]=="ADelay" && v["id"].as_str().is_some_and(|id|id.contains(&expected))).ok_or("External VST3 fixture not discovered")?;
                            let mut stream=crispaudio_media::plugin_stream::PluginStream::open(&json!({"id":vst["id"],"sampleRate":48000,"channels":2}))?;
                            let mut input=vec![vec![0.0;1024];2];input[0][0]=0.25;input[1][0]=0.25;
                            let reply=stream.process(&input,&json!({}),false)?;
                            if reply.samples.iter().flatten().any(|v|!v.is_finite()){return Err("Invalid external VST3 stream output".into());}
                            drop(stream);
                            let cache=handle.path().app_cache_dir().map_err(|e|e.to_string())?;
                            std::fs::create_dir_all(&cache).map_err(|e|e.to_string())?;
                            let output=cache.join("folder-probe.wav");let _=std::fs::remove_file(&output);
                            let au=report["plugins"].as_array().unwrap().iter().find(|v|v["name"]=="AUBandpass").ok_or("Missing Apple fixture")?;
                            crispaudio_media::apple::plugin("plugin-render",&json!({"id":au["id"],"path":std::path::Path::new(&expected).join("input.wav"),"output":output,"offset":0,"duration":0.1}).to_string())?;
                            let rendered=std::fs::metadata(&output).map_err(|e|e.to_string())?.len();let _=std::fs::remove_file(output);
                            if rendered<44{return Err("Swift helper did not render selected-folder audio".into());}
                            Ok(json!({"success":true,"mode":mode,"deniedBeforeGrant":true,"parentRead":true,"externalVstScan":true,"externalVstStream":true,"swiftHelperRead":true}))
                        }).await.map_err(|e|e.to_string())?
                    }.await;
                    let (report,code)=match result{Ok(report)=>(report,0),Err(error)=>(json!({"success":false,"error":error}),1)};
                    println!("CRISPAUDIO_FOLDER_VALIDATION {report}");
                    // Let scoped streams and their child processes drop before exit.
                    handle_exit(code);
                });
            };
            if options["folderProbe"]=="select" {
                let picker = app.handle().clone();
                std::thread::spawn(move || {
                    // NSApplication must finish launching before NSOpenPanel runs.
                    std::thread::sleep(std::time::Duration::from_millis(300));
                    picker.dialog().file().set_directory(picker_directory).set_title("CrispAudio sandbox fixture — select the test folder").pick_folder(move |folder| finish(folder.and_then(|v|v.into_path().ok()).map(|v|v.to_string_lossy().into_owned())));
                });
            } else {finish(None);}
            Ok(())
        })
        .run(context)
        .expect("Could not start isolated folder validation");
}
fn handle_exit(code: i32) {
    std::process::exit(code);
}
