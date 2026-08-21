use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::Manager;

struct CoreProcess(Mutex<Option<Child>>);

fn core_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../core")
}

fn core_port_open() -> bool {
    TcpStream::connect_timeout(
        &"127.0.0.1:8787".parse().unwrap(),
        Duration::from_millis(200),
    )
    .is_ok()
}

fn start_core_if_needed() -> Option<Child> {
    if core_port_open() {
        eprintln!("[local-mail] core already listening on 127.0.0.1:8787 — reusing");
        return None;
    }

    let dir = core_dir();
    if !dir.exists() {
        eprintln!(
            "[local-mail] core directory missing at {} — start core manually",
            dir.display()
        );
        return None;
    }

    eprintln!("[local-mail] starting core from {}", dir.display());

    // Prefer npm so local tsx/node resolution matches apps/core package.json
    let mut cmd = Command::new("npm");
    cmd.args(["run", "start"])
        .current_dir(&dir)
        .env("LOCAL_MAIL_CORE_HOST", "127.0.0.1")
        .env("LOCAL_MAIL_CORE_PORT", "8787")
        .env("LOCAL_MAIL_WEB_ORIGIN", "http://127.0.0.1:4300")
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    match cmd.spawn() {
        Ok(child) => {
            // Brief wait so /health can come up
            for _ in 0..40 {
                if core_port_open() {
                    eprintln!("[local-mail] core is up");
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            if !core_port_open() {
                eprintln!("[local-mail] warning: core did not open :8787 yet (UI may show offline briefly)");
            }
            Some(child)
        }
        Err(e) => {
            eprintln!("[local-mail] failed to spawn core: {e}");
            eprintln!("[local-mail] run manually: cd apps/core && npm run dev");
            None
        }
    }
}

fn stop_core(state: &CoreProcess) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
            eprintln!("[local-mail] core process stopped");
        }
    }
}

#[tauri::command]
fn core_status() -> serde_json::Value {
    serde_json::json!({
        "online": core_port_open(),
        "url": "http://127.0.0.1:8787",
    })
}

fn apple_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// OS notification that does not impersonate Terminal in `tauri dev`.
/// The official plugin uses `com.apple.Terminal` in dev, so banners never
/// appear unless Terminal itself is allowed in System Settings.
#[tauri::command]
fn show_mail_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    let title = if title.trim().is_empty() {
        "Local Mail".to_string()
    } else {
        title
    };
    let body = if body.trim().is_empty() {
        "New mail".to_string()
    } else {
        body
    };

    #[cfg(target_os = "macos")]
    {
        let script = format!(
            r#"display notification "{body}" with title "{title}" subtitle "Local Mail" sound name "New Mail""#,
            title = apple_escape(&title),
            body = apple_escape(&body),
        );
        match Command::new("osascript").args(["-e", &script]).status() {
            Ok(st) if st.success() => {
                eprintln!("[local-mail] notification sent via osascript: {title}");
                return Ok(());
            }
            Ok(st) => eprintln!("[local-mail] osascript notification exit {st}"),
            Err(e) => eprintln!("[local-mail] osascript notification failed: {e}"),
        }
    }

    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .sound("Ping")
        .show()
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(CoreProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            core_status,
            show_mail_notification
        ])
        .setup(|app| {
            let child = start_core_if_needed();
            if let Some(c) = child {
                if let Some(state) = app.try_state::<CoreProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        *guard = Some(c);
                    }
                }
            }
            // Red close button hides to Dock; core keeps polling Gmail.
            if let Some(win) = app.get_webview_window("main") {
                let hidden = win.clone();
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = hidden.hide();
                        eprintln!("[local-mail] window hidden — core still watching inbox");
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Local Mail")
        .run(|app_handle, event| {
            match event {
                tauri::RunEvent::Reopen { .. } => {
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                }
                tauri::RunEvent::Exit => {
                    if let Some(state) = app_handle.try_state::<CoreProcess>() {
                        stop_core(&state);
                    }
                }
                _ => {}
            }
        });
}
