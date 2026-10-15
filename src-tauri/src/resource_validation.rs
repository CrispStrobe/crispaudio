//! Isolated PowerBox file/folder selection, process relaunch and access boundaries.
use serde_json::{json, Value};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

pub fn run(options: Value, mut context: tauri::Context<tauri::Wry>) {
    context.config_mut().app.windows.clear();
    tauri::Builder::default().plugin(tauri_plugin_dialog::init()).setup(move |app|{
            // A windowless probe still needs a foreground application for its
            // native file picker; launch it through macOS Launch Services.
            app.set_activation_policy(tauri::ActivationPolicy::Regular);


  let root=std::path::PathBuf::from(options["root"].as_str().ok_or("Expected owned fixtures")?);
  let mode=options["resourceProbe"].as_str().ok_or("Expected mode")?.to_string();
  let source=root.join("input/take.wav");let project=root.join("project/session.crispaudio.json");
  let target=if mode=="select-media"{source.clone()}else if mode=="select-folder"{root.join("project")}else{project.clone()};
  let denied=if target.is_dir(){std::fs::read_dir(&target).is_err()}else{std::fs::read(&target).is_err()};
  let handle=app.handle().clone();let picker=handle.clone();let pick=mode.starts_with("select-");let folder=mode=="select-folder";
  let picker_directory=if folder{target.clone()}else{target.parent().unwrap().to_path_buf()};
  let finish=move |selected:Option<std::path::PathBuf>|{
   tauri::async_runtime::spawn(async move{
    let result:Result<Value,String>=async{
     if !denied{return Err("Resource accessible before selection/restoration".into());}
     let file=handle.path().app_data_dir().map_err(|e|e.to_string())?.join("resource-bookmarks.json");
     let unavailable=crispaudio_media::security_scope::restore_resources(&file)?;
     if !unavailable.is_empty(){return Err("Saved resource could not be restored".into());}
     if pick{
      if selected.as_ref()!=Some(&target){return Err("Wrong owned fixture selected".into());}
      crate::commands::resources::remember_resources(handle.clone(),vec![target.to_string_lossy().into_owned()],mode!="select-media").await?;
     }
     tauri::async_runtime::spawn_blocking(move ||{
      let info=crispaudio_media::probe_with_backend(source.to_str().unwrap(),crispaudio_media::apple::Backend::Apple)?;
      if (info.duration-0.1).abs()>0.01{return Err("Incorrect selected-file decode".into());}
      let neighbor=root.join("input/unselected.wav");
      if std::fs::read(&neighbor).is_ok() || crispaudio_media::probe_with_backend(neighbor.to_str().unwrap(),crispaudio_media::apple::Backend::Apple).is_ok(){return Err("Unselected neighboring file was accessible".into());}
      if mode!="select-media"{
       let text=std::fs::read_to_string(&project).map_err(|e|e.to_string())?;
       let resolved=crate::commands::delivery::resolve_project_media(text.clone(),project.to_string_lossy().into_owned())?;
       let doc:Value=serde_json::from_str(&resolved).map_err(|e|e.to_string())?;
       if doc["version"]!=4 || std::path::Path::new(doc["sources"][0]["path"].as_str().unwrap_or("")).canonicalize().ok()!=source.canonicalize().ok(){return Err("Version4 relative-path project did not reopen".into());}
       std::fs::write(&project,text).map_err(|e|format!("Saved project write access lost: {e}"))?;
      }
      if !pick && std::fs::OpenOptions::new().write(true).open(&source).is_ok(){return Err("Read-only source bookmark allowed a write".into());}
      if folder || mode=="restore-folder"{
       let output=root.join("project/output.aac");let _=std::fs::remove_file(&output);
       crispaudio_media::apple::attempt(crispaudio_media::apple::Backend::Apple,&["encode-aac".into(),source.to_string_lossy().into_owned(),output.to_string_lossy().into_owned(),"192".into()],None)?.ok_or("No native encode")?;
       if std::fs::metadata(&output).map_err(|e|e.to_string())?.len()<7{return Err("Selected-directory helper output missing".into());}
       std::fs::remove_file(output).map_err(|e|e.to_string())?;
      }
      Ok(json!({"success":true,"mode":mode,"deniedBeforeGrant":true,"swiftRead":true,"neighborDenied":true,"readOnlySource":!pick,"version4Project":mode!="select-media","projectWritable":mode!="select-media","helperOutput":folder||mode=="restore-folder"}))
     }).await.map_err(|e|e.to_string())?
    }.await;
    let (report,code)=match result{Ok(value)=>(value,0),Err(error)=>(json!({"success":false,"error":error}),1)};
    println!("CRISPAUDIO_RESOURCE_VALIDATION {report}");std::process::exit(code);
   });
  };
  if pick{std::thread::spawn(move ||{
   std::thread::sleep(std::time::Duration::from_millis(300));
   let dialog=picker.dialog().file().set_directory(picker_directory).set_title("CrispAudio resource sandbox test");
   if folder{dialog.pick_folder(move |path|finish(path.and_then(|p|p.into_path().ok())));}else{dialog.pick_file(move |path|finish(path.and_then(|p|p.into_path().ok())));}
  });}else{finish(None);}
  Ok(())
 }).run(context).expect("Resource probe startup failed");
}
