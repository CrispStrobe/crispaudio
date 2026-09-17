//! Native iOS integrations for CrispAudio.
//!
//! All behaviour lives in Swift (`ios/`); the frontend invokes it directly as
//! `plugin:crispaudio-native|<command>`. On other platforms the plugin
//! registers nothing, and the frontend only calls it when running on iOS.
use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_crispaudio_native);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("crispaudio-native")
        .setup(|_app, _api| {
            #[cfg(target_os = "ios")]
            _api.register_ios_plugin(init_plugin_crispaudio_native)?;
            Ok(())
        })
        .build()
}
