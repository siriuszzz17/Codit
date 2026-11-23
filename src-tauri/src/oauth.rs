use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

const PREFERRED_CALLBACK_PORT: u16 = 43823;
const OAUTH_TIMEOUT_SECS: u64 = 300;
const OAUTH_CALLBACK_PATH: &str = "/auth/callback";
pub const OAUTH_CALLBACK_EVENT: &str = "codit://oauth-callback";

#[derive(Default)]
pub struct DesktopOAuthState {
    active_cancel: Mutex<Option<Arc<AtomicBool>>>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopOAuthPrepared {
    pub port: u16,
    pub redirect_url: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopOAuthCallbackEvent {
    callback_url: String,
}

pub(crate) fn validate_oauth_authorize_url(raw_url: &str) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(raw_url.trim())
        .map_err(|_| "URL de autenticação inválida.".to_string())?;

    if !url.username().is_empty() || url.password().is_some() {
        return Err("URL de autenticação não pode conter credenciais embutidas.".to_string());
    }

    let host = url
        .host_str()
        .ok_or_else(|| "URL de autenticação sem host válido.".to_string())?
        .to_ascii_lowercase();

    let is_valid_host = match url.scheme() {
        "https" => host.ends_with(".supabase.co") && host.len() > ".supabase.co".len(),
        "http" => host == "127.0.0.1" || host == "localhost",
        _ => false,
    };

    if !is_valid_host {
        return Err("Host de autenticação não autorizado.".to_string());
    }

    if url.path() != "/auth/v1/authorize" {
        return Err("Caminho de autorização inválido.".to_string());
    }

    Ok(url)
}

pub(crate) fn parse_http_get_target(request: &str) -> Option<String> {
    let first_line = request.lines().next()?.trim();
    let mut parts = first_line.split_whitespace();
    let method = parts.next()?;
    let target = parts.next()?;
    if method != "GET" || !target.starts_with('/') {
        return None;
    }
    Some(target.to_string())
}

fn build_success_html() -> &'static str {
    "<!DOCTYPE html>
<html lang=\"pt-BR\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>Codit — Login concluído</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Inter, Segoe UI, system-ui, sans-serif;
      background: #0b0a16;
      color: #f4f2ff;
      padding: 24px;
      text-align: center;
    }
    .card {
      max-width: 420px;
      width: 100%;
      background: #141228;
      border: 1px solid #2c2752;
      border-radius: 20px;
      padding: 28px 24px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      background: #231b46;
      color: #a78bfa;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { font-size: 14px; color: #b8b2d8; line-height: 1.5; margin: 0; }
  </style>
</head>
<body>
  <main class=\"card\">
    <span class=\"badge\">Codit · Octopy</span>
    <h1>Login concluído!</h1>
    <p>Você já pode fechar esta aba e voltar para o aplicativo Codit.</p>
  </main>
</body>
</html>"
}

fn write_http_response(
    stream: &mut std::net::TcpStream,
    status: &str,
    content_type: &str,
    body: &[u8],
) {
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    if !body.is_empty() {
        let _ = stream.write_all(body);
    }
    let _ = stream.flush();
}

fn cancel_active_listener(state: &DesktopOAuthState) {
    if let Ok(mut guard) = state.active_cancel.lock() {
        if let Some(previous) = guard.take() {
            previous.store(true, Ordering::SeqCst);
        }
    }
}

#[tauri::command]
pub fn prepare_desktop_oauth(
    app: tauri::AppHandle,
    state: tauri::State<'_, DesktopOAuthState>,
) -> Result<DesktopOAuthPrepared, String> {
    cancel_active_listener(&state);

    let listener = TcpListener::bind(("127.0.0.1", PREFERRED_CALLBACK_PORT))
        .or_else(|_| TcpListener::bind(("127.0.0.1", 0)))
        .map_err(|err| format!("Não foi possível iniciar o servidor local de login: {err}"))?;

    let port = listener
        .local_addr()
        .map_err(|err| format!("Não foi possível obter a porta local de login: {err}"))?
        .port();

    listener
        .set_nonblocking(true)
        .map_err(|err| format!("Não foi possível configurar o listener de login: {err}"))?;

    let cancel_flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut guard) = state.active_cancel.lock() {
        *guard = Some(cancel_flag.clone());
    }

    let app_handle = app.clone();
    std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(OAUTH_TIMEOUT_SECS);

        loop {
            if cancel_flag.load(Ordering::SeqCst) || Instant::now() >= deadline {
                break;
            }

            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_nonblocking(false);
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));

                    let mut buffer = [0_u8; 8192];
                    let bytes_read = match stream.read(&mut buffer) {
                        Ok(n) if n > 0 => n,
                        _ => continue,
                    };

                    let request_text = String::from_utf8_lossy(&buffer[..bytes_read]);
                    let Some(target) = parse_http_get_target(&request_text) else {
                        write_http_response(&mut stream, "400 Bad Request", "text/plain; charset=utf-8", b"Bad Request");
                        continue;
                    };

                    let path = target.split('?').next().unwrap_or("");
                    if path == "/favicon.ico" {
                        write_http_response(&mut stream, "204 No Content", "text/plain", b"");
                        continue;
                    }

                    if path != OAUTH_CALLBACK_PATH {
                        write_http_response(&mut stream, "404 Not Found", "text/plain; charset=utf-8", b"Not Found");
                        continue;
                    }

                    let callback_url = format!("http://127.0.0.1:{port}{target}");
                    write_http_response(
                        &mut stream,
                        "200 OK",
                        "text/html; charset=utf-8",
                        build_success_html().as_bytes(),
                    );

                    let _ = app_handle.emit(
                        OAUTH_CALLBACK_EVENT,
                        DesktopOAuthCallbackEvent { callback_url },
                    );

                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }

                    break;
                }
                Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(80));
                }
                Err(_) => break,
            }
        }

        if let Some(managed) = app_handle.try_state::<DesktopOAuthState>() {
            if let Ok(mut guard) = managed.active_cancel.lock() {
                if guard
                    .as_ref()
                    .is_some_and(|current| Arc::ptr_eq(current, &cancel_flag))
                {
                    *guard = None;
                }
            }
        }
    });

    Ok(DesktopOAuthPrepared {
        port,
        redirect_url: format!("http://127.0.0.1:{port}{OAUTH_CALLBACK_PATH}"),
    })
}

#[tauri::command]
pub fn open_desktop_oauth_url(app: tauri::AppHandle, auth_url: String) -> Result<(), String> {
    let validated = validate_oauth_authorize_url(&auth_url)?;
    app.opener()
        .open_url(validated.as_str(), None::<&str>)
        .map_err(|err| format!("Não foi possível abrir o navegador padrão: {err}"))
}

#[tauri::command]
pub fn cancel_desktop_oauth(state: tauri::State<'_, DesktopOAuthState>) -> Result<(), String> {
    cancel_active_listener(&state);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{parse_http_get_target, validate_oauth_authorize_url};

    #[test]
    fn accepts_valid_supabase_and_local_authorize_urls() {
        assert!(validate_oauth_authorize_url(
            "https://yirtthdqdttxufoxvvml.supabase.co/auth/v1/authorize?provider=google"
        )
        .is_ok());

        assert!(
            validate_oauth_authorize_url("http://127.0.0.1:54321/auth/v1/authorize?provider=google")
                .is_ok()
        );
    }

    #[test]
    fn rejects_untrusted_or_malformed_oauth_urls() {
        let invalid_urls = [
            "javascript:alert(1)",
            "file:///C:/Windows/calc.exe",
            "https://evil.example/auth/v1/authorize",
            "https://supabase.co/auth/v1/authorize",
            "https://yirtthdqdttxufoxvvml.supabase.co/rest/v1/profiles",
            "https://user:pass@yirtthdqdttxufoxvvml.supabase.co/auth/v1/authorize",
        ];

        for candidate in invalid_urls {
            assert!(
                validate_oauth_authorize_url(candidate).is_err(),
                "expected rejection for {candidate}"
            );
        }
    }

    #[test]
    fn parses_http_get_target_and_rejects_other_methods() {
        let req = "GET /auth/callback?code=abc123 HTTP/1.1\r\nHost: 127.0.0.1:43823\r\n\r\n";
        assert_eq!(
            parse_http_get_target(req).as_deref(),
            Some("/auth/callback?code=abc123")
        );

        let post_req = "POST /auth/callback HTTP/1.1\r\nHost: 127.0.0.1:43823\r\n\r\n";
        assert_eq!(parse_http_get_target(post_req), None);
    }
}
