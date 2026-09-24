//! The shell: a window around the app, and the daemon under it. Nothing else. It starts
//! the daemon, waits for the daemon to say where it is, hands that to the webview as it
//! opens, and stops the daemon when the app quits. What the app is, is in ../../app; what
//! it talks to, in ../../daemon.

use std::{
  fs,
  path::PathBuf,
  process::{Child, Command, Stdio},
  sync::Mutex,
  thread,
  time::Duration,
};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

/// The running daemon, so it can be stopped on exit.
struct Daemon(Mutex<Option<Child>>);

/// Where the daemon keeps its state. The daemon owns this decision; the shell only needs
/// the session file, and reads it from the same place under the same override.
fn home() -> PathBuf {
  if let Ok(dir) = std::env::var("LATTICE_HOME") {
    return PathBuf::from(dir);
  }
  PathBuf::from(std::env::var("HOME").expect("HOME")).join(".lattice")
}

/// Start the daemon as a child. In development that is Bun running the source; a sidecar
/// binary takes its place when there is a build to ship. Stdin is piped and LATTICE_PARENT
/// set, which is how the daemon knows to stop when this process goes away.
fn start_daemon() -> std::io::Result<Child> {
  let daemon_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../daemon");
  Command::new("bun")
    .args(["run", "src/main.ts"])
    .current_dir(daemon_dir)
    .env("LATTICE_PARENT", "1")
    .stdin(Stdio::piped())
    .stdout(Stdio::inherit())
    .stderr(Stdio::inherit())
    .spawn()
}

/// The daemon writes its port and token when it is listening. Wait for that, briefly.
fn wait_for_session() -> Option<String> {
  let file = home().join("session.json");
  for _ in 0..100 {
    if let Ok(text) = fs::read_to_string(&file) {
      if text.contains("port") {
        return Some(text);
      }
    }
    thread::sleep(Duration::from_millis(50));
  }
  None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())?;
      }
      // A stale session file from a daemon that is gone would send the app to nothing.
      let _ = fs::remove_file(home().join("session.json"));
      let child = start_daemon()?;
      app.manage(Daemon(Mutex::new(Some(child))));
      // The webview learns where the daemon is before its first script runs; with no
      // daemon it learns nothing and the app says so.
      let session = wait_for_session().unwrap_or_else(|| "null".to_string());
      let script = format!("window.__lattice = {};", session);
      WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("Lattice")
        .inner_size(1400.0, 900.0)
        .initialization_script(&script)
        .build()?;
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      if let RunEvent::Exit = event {
        // The daemon is a child of the app: it goes when the app goes.
        if let Some(mut child) = app.state::<Daemon>().0.lock().unwrap().take() {
          let _ = child.kill();
          let _ = child.wait();
        }
      }
    });
}
