use std::fs::{self, File, OpenOptions};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::Manager;

struct CoreProcess(Mutex<Option<Child>>);

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn repo_core_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../core")
}

fn bundled_core_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let path = app.path();
    let mut cands: Vec<PathBuf> = Vec::new();
    if let Ok(p) = path.resolve("core", tauri::path::BaseDirectory::Resource) {
        cands.push(p);
    }
    if let Ok(res) = path.resource_dir() {
        cands.push(res.join("core"));
        cands.push(res.join("resources").join("core"));
        cands.push(res.join("_up_").join("core"));
    }
    cands.into_iter().find(|p| p.join("package.json").exists())
}

fn resolve_core_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let repo = repo_core_dir();
    if repo.join("package.json").exists() {
        return Some(repo);
    }
    bundled_core_dir(app)
}

fn find_node() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("DOCKET_NODE") {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    let mut bins: Vec<PathBuf> = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ];
    if let Some(home) = home_dir() {
        let nvm = home.join(".nvm/versions/node");
        if let Ok(rd) = fs::read_dir(&nvm) {
            let mut vers: Vec<PathBuf> = rd.filter_map(|e| e.ok()).map(|e| e.path()).collect();
            vers.sort();
            vers.reverse();
            for v in vers {
                bins.push(v.join("bin"));
            }
        }
        bins.push(home.join(".local/share/fnm/aliases/default/bin"));
    }
    let extra: Vec<String> = bins
        .iter()
        .filter(|p| p.is_dir())
        .map(|p| p.display().to_string())
        .collect();
    let path = format!(
        "{}:{}",
        extra.join(":"),
        std::env::var("PATH").unwrap_or_default()
    );
    let out = Command::new("/usr/bin/which")
        .arg("node")
        .env("PATH", &path)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(PathBuf::from(s))
    }
}

fn dotenv_file() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("DOCKET_ENV_FILE") {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    let repo_env = repo_core_dir().join(".env");
    if repo_env.is_file() {
        return Some(repo_env);
    }
    if let Some(home) = home_dir() {
        for rel in [".docket/.env", ".local-mail/.env"] {
            let p = home.join(rel);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

fn core_log_file() -> Option<File> {
    let home = home_dir()?;
    let dir = home.join(".docket");
    let _ = fs::create_dir_all(&dir);
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("core.log"))
        .ok()
}

fn core_port_open() -> bool {
    TcpStream::connect_timeout(
        &"127.0.0.1:8787".parse().unwrap(),
        Duration::from_millis(200),
    )
    .is_ok()
}

fn start_core_if_needed(app: &tauri::AppHandle) -> Option<Child> {
    if core_port_open() {
        eprintln!("[docket] core already listening on 127.0.0.1:8787 — reusing");
        return None;
    }

    let dir = match resolve_core_dir(app) {
        Some(d) => d,
        None => {
            eprintln!("[docket] core directory missing — start core manually (cd apps/core && npm run start)");
            return None;
        }
    };

    let node = match find_node() {
        Some(n) => n,
        None => {
            eprintln!("[docket] Node.js not found (nvm / Homebrew). Install Node 22+ or set DOCKET_NODE.");
            return None;
        }
    };

    let tsx = dir.join("node_modules/tsx/dist/cli.mjs");
    if !tsx.exists() {
        eprintln!(
            "[docket] tsx missing in {} — run npm install in apps/core",
            dir.display()
        );
        return None;
    }

    let web_origin = if cfg!(debug_assertions) {
        "http://127.0.0.1:4300"
    } else {
        "https://tauri.localhost"
    };

    eprintln!(
        "[docket] starting core from {} with {}",
        dir.display(),
        node.display()
    );

    let mut cmd = Command::new(&node);
    cmd.args([tsx.to_str()?, "src/index.ts"])
        .current_dir(&dir)
        .env("DOCKET_CORE_HOST", "127.0.0.1")
        .env("DOCKET_CORE_PORT", "8787")
        .env("DOCKET_WEB_ORIGIN", web_origin);
    if let Some(envf) = dotenv_file() {
        cmd.env("DOCKET_ENV_FILE", envf);
    }
    if let Some(bin) = node.parent() {
        let path = format!(
            "{}:{}",
            bin.display(),
            std::env::var("PATH").unwrap_or_default()
        );
        cmd.env("PATH", path);
    }
    if let Some(log) = core_log_file() {
        if let Ok(err) = log.try_clone() {
            cmd.stdout(Stdio::from(log));
            cmd.stderr(Stdio::from(err));
        }
    } else {
        cmd.stdout(Stdio::null()).stderr(Stdio::null());
    }

    match cmd.spawn() {
        Ok(child) => {
            for _ in 0..80 {
                if core_port_open() {
                    eprintln!("[docket] core is up");
                    break;
                }
                std::thread::sleep(Duration::from_millis(150));
            }
            if !core_port_open() {
                eprintln!("[docket] warning: core did not open :8787 yet (UI may show offline briefly)");
            }
            Some(child)
        }
        Err(e) => {
            eprintln!("[docket] failed to spawn core: {e}");
            None
        }
    }
}

fn stop_core(state: &CoreProcess) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
            eprintln!("[docket] core process stopped");
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
        "Docket".to_string()
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
            r#"display notification "{body}" with title "{title}" subtitle "Docket" sound name "New Mail""#,
            title = apple_escape(&title),
            body = apple_escape(&body),
        );
        match Command::new("osascript").args(["-e", &script]).status() {
            Ok(st) if st.success() => {
                eprintln!("[docket] notification sent via osascript: {title}");
                return Ok(());
            }
            Ok(st) => eprintln!("[docket] osascript notification exit {st}"),
            Err(e) => eprintln!("[docket] osascript notification failed: {e}"),
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
            let child = start_core_if_needed(&app.handle().clone());
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
                        eprintln!("[docket] window hidden — core still watching inbox");
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Docket")
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
