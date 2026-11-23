#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                let has_updater_pubkey = app
                    .config()
                    .plugins
                    .0
                    .get("updater")
                    .and_then(|value| value.get("pubkey"))
                    .and_then(|value| value.as_str())
                    .map(|key| !key.trim().is_empty())
                    .unwrap_or(false);

                if has_updater_pubkey {
                    app.handle()
                        .plugin(tauri_plugin_updater::Builder::new().build())?;
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
