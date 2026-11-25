#[cfg(desktop)]
mod oauth;

use tauri::webview::{PermissionKind, PermissionResponse};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .on_permission_request(|_webview, kind| match kind {
            PermissionKind::Microphone => PermissionResponse::Allow,
            // RN-504: câmera de vídeo permanece estritamente bloqueada no Codit.
            PermissionKind::Camera => PermissionResponse::Deny,
            _ => PermissionResponse::Default,
        });

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_opener::init())
        .manage(oauth::DesktopOAuthState::default())
        .invoke_handler(tauri::generate_handler![
            oauth::prepare_desktop_oauth,
            oauth::open_desktop_oauth_url,
            oauth::cancel_desktop_oauth
        ]);

    builder
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
