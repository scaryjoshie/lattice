//! The shell: a window around the app, and the daemon under it. Nothing else. It starts
//! the daemon, waits for the daemon to say where it is, hands that to the webview as it
//! opens, asks before quitting while terminals are running, holds the browsers' native
//! webviews (browsers.rs), and stops the daemon when the app quits. What the app is, is in ../../app; what it talks to, in ../../daemon.

mod browsers;

use std::{
  fs,
  io::{BufRead, BufReader, Write},
  os::unix::net::UnixStream,
  path::PathBuf,
  process::{Child, Command, Stdio},
  sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
  },
  thread,
  time::Duration,
};

use tauri::{
  menu::{Menu, MenuItem, MenuItemKind},
  AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

/// The running daemon, so it can be stopped on exit.
struct Daemon(Mutex<Option<Child>>);

/// Set once leaving has been confirmed, so the quit it starts is not asked about again.
struct Leaving(AtomicBool);

/// How many terminals the daemon is running: what quitting would stop. Asked over its
/// socket, one JSON-RPC line each way, past the notifications it greets a client with. No
/// answer counts as none, so a daemon that is gone never holds the app open.
fn running_terminals() -> usize {
  let ask = || -> Option<usize> {
    let mut socket = UnixStream::connect(home().join("daemon.sock")).ok()?;
    socket.set_read_timeout(Some(Duration::from_secs(1))).ok()?;
    socket.write_all(b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"running\",\"params\":{}}\n").ok()?;
    for line in BufReader::new(socket).lines() {
      let message: serde_json::Value = serde_json::from_str(&line.ok()?).ok()?;
      if message.get("id").and_then(|id| id.as_i64()) == Some(1) {
        return message["result"]["terminals"].as_u64().map(|n| n as usize);
      }
    }
    None
  };
  ask().unwrap_or(0)
}

/// Quit, or close the last window, which is the same thing here. With terminals running it
/// asks first, as Terminal does (runtime.md 2), since quitting stops them; with none it
/// just goes. Returns whether the caller may go ahead now.
fn leave(app: &AppHandle) -> bool {
  if app.state::<Leaving>().0.load(Ordering::SeqCst) {
    return true;
  }
  let n = running_terminals();
  if n == 0 {
    return true;
  }
  let handle = app.clone();
  app
    .dialog()
    .message(if n == 1 { "1 terminal is running.".to_string() } else { format!("{n} terminals are running.") })
    .title("Quit Lattice?")
    .kind(MessageDialogKind::Warning)
    .buttons(MessageDialogButtons::OkCancelCustom("Quit".into(), "Cancel".into()))
    .show(move |quit| {
      if quit {
        handle.state::<Leaving>().0.store(true, Ordering::SeqCst);
        handle.exit(0);
      }
    });
  false
}

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

/// Close the window, as its close button does: through the same ask while terminals run.
#[tauri::command]
async fn close_window(app: AppHandle) -> Result<(), String> {
  app.get_window("main").ok_or("no window")?.close().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      close_window,
      browsers::browser_show,
      browsers::browser_hide,
      browsers::browser_go,
      browsers::browser_step,
      browsers::browser_close,
      browsers::appearance,
    ])
    .on_menu_event(|app, event| {
      if event.id() == "quit" && leave(app) {
        app.exit(0);
      }
      // Closing an opened panel is the app's, but a browser's native page takes the keys
      // while it has focus, so Cmd-Escape is a menu item, which macOS routes to the menu
      // whichever view has focus, and the app is told.
      if event.id() == "close-panel" {
        let _ = app.emit_to("main", "close-panel", ());
      }
      // A new tab in the open browser, for the same reason: the page has the keys.
      if event.id() == "new-tab" {
        let _ = app.emit_to("main", "new-tab", ());
      }
      // Cmd-W closes the tab when a browser is open and the window otherwise, which only
      // the app knows, so it is asked; it closes the window by `close_window`.
      if event.id() == "close" {
        let _ = app.emit_to("main", "close", ());
      }
    })
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        if !leave(window.app_handle()) {
          api.prevent_close();
        }
      }
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())?;
      }
      // A stale session file from a daemon that is gone would send the app to nothing.
      let _ = fs::remove_file(home().join("session.json"));
      let child = start_daemon()?;
      app.manage(Daemon(Mutex::new(Some(child))));
      app.manage(Leaving(AtomicBool::new(false)));
      // The default menu, with its Quit replaced by one that asks first. The system's own
      // quit cannot be held, so Cmd-Q has to be ours.
      let menu = Menu::default(app.handle())?;
      if let Some(MenuItemKind::Submenu(first)) = menu.items()?.into_iter().next() {
        let count = first.items()?.len();
        if count > 0 {
          first.remove_at(count - 1)?;
        }
        first.append(&MenuItem::with_id(app, "quit", "Quit Lattice", true, Some("CmdOrCtrl+Q"))?)?;
      }
      let submenu = |name: &str| {
        menu.items().ok()?.into_iter().find_map(|item| match item {
          MenuItemKind::Submenu(sub) if sub.text().ok().as_deref() == Some(name) => Some(sub),
          _ => None,
        })
      };
      if let Some(window) = submenu("Window") {
        window.append(&MenuItem::with_id(app, "close-panel", "Close Panel", true, Some("CmdOrCtrl+Escape"))?)?;
      }
      // The default Close Window items both hold Cmd-W: they go, for one Close that asks.
      for item in menu.items()? {
        if let MenuItemKind::Submenu(sub) = item {
          for inner in sub.items()? {
            if let MenuItemKind::Predefined(p) = &inner {
              if p.text().ok().as_deref() == Some("Close Window") {
                sub.remove(p)?;
              }
            }
          }
        }
      }
      if let Some(file) = submenu("File") {
        file.prepend(&MenuItem::with_id(app, "close", "Close", true, Some("CmdOrCtrl+W"))?)?;
        file.prepend(&MenuItem::with_id(app, "new-tab", "New Tab", true, Some("CmdOrCtrl+T"))?)?;
      }
      app.set_menu(menu)?;
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
