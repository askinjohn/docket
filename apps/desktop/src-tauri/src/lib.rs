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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(CoreProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![core_status])
        .setup(|app| {
            let child = start_core_if_needed();
            if let Some(c) = child {
                if let Some(state) = app.try_state::<CoreProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        *guard = Some(c);
                    }
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Local Mail")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<CoreProcess>() {
                    stop_core(&state);
                }
            }
        });
}
