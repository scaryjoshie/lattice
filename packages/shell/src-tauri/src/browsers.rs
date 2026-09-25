//! Browsers: one native webview per browser tile, a child of the window, which the app
//! places over its opened panel's page area. WebKit, as cmux's browser is. Being native it
//! cannot scale with the panel or be frosted, so the app shows it once the panel has landed
//! and hides it before the panel goes back. Its address, title and loading are told to the
//! app as they change. The commands are async: adding a child webview waits on the main
//! thread, which a command already running there would deadlock.

use std::{process::Command, sync::{mpsc, OnceLock}};

use serde::Serialize;
use tauri::{
  webview::{NewWindowResponse, PageLoadEvent},
  AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Theme, Url, Webview, WebviewBuilder, WebviewUrl,
};

/// Safari's user agent, with the Safari installed here. A bare WebKit view does not say it
/// is Safari, and sites decide what to send by that: Google sends a bare view its legacy
/// page. Safari freezes the system and WebKit parts of its user agent; only its own version
/// moves, so that is read from Safari itself.
fn user_agent() -> &'static str {
  static AGENT: OnceLock<String> = OnceLock::new();
  AGENT.get_or_init(|| {
    let version = Command::new("/usr/libexec/PlistBuddy")
      .args(["-c", "Print CFBundleShortVersionString", "/Applications/Safari.app/Contents/Info.plist"])
      .output()
      .ok()
      .and_then(|out| String::from_utf8(out.stdout).ok())
      .map(|v| v.trim().to_string())
      .filter(|v| !v.is_empty())
      .unwrap_or_else(|| "26.0".to_string());
    format!("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/{version} Safari/605.1.15")
  })
}

/// What the app is told about a browser's page: where it is, what it is called, whether
/// it is still loading. Fields not known by the event that sent it are absent.
#[derive(Clone, Serialize)]
struct Page {
  host: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  url: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  title: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  loading: Option<bool>,
}

/// Where the app's own page begins inside the window's content view, in points. A native
/// page is placed by wry against that content view, while the app measures from the top of
/// its web content, so any gap between the two would put every native page that much too
/// high. There are two: where the app's view sits in the content view, and how far below
/// the view's own top its content starts, which macOS insets under a title bar. The second
/// is the view's height less the content's, `seen` being the content's height as the app
/// measured it; the inset is at the top.
fn page_origin(app: &AppHandle, seen: f64) -> (f64, f64) {
  let Some(main) = app.get_webview("main") else { return (0.0, 0.0) };
  let (tx, rx) = mpsc::channel();
  let asked = main.with_webview(move |platform| {
    // SAFETY: on macOS the platform webview is a WKWebView, which is an NSView, and this
    // runs on the main thread, where AppKit may be asked.
    let view = unsafe { &*(platform.inner() as *const objc2_app_kit::NSView) };
    let frame = view.frame();
    let (left, top) = match unsafe { view.superview() } {
      Some(parent) if !parent.isFlipped() => (frame.origin.x, parent.frame().size.height - frame.origin.y - frame.size.height),
      _ => (frame.origin.x, frame.origin.y),
    };
    let inset = (frame.size.height - seen).max(0.0);
    let _ = tx.send((left, top + inset));
  });
  if asked.is_err() {
    return (0.0, 0.0);
  }
  rx.recv_timeout(std::time::Duration::from_millis(500)).unwrap_or((0.0, 0.0))
}

fn label(host: &str) -> String {
  format!("browser-{host}")
}

fn find(app: &AppHandle, host: &str) -> Option<Webview> {
  app.get_webview(&label(host))
}

fn tell(app: &AppHandle, page: Page) {
  let _ = app.emit_to("main", "browser", page);
}

/// Show a tile's browser over the given rectangle, in the window's logical pixels, making
/// it at `url` the first time.
#[tauri::command]
pub async fn browser_show(app: AppHandle, host: String, url: String, x: f64, y: f64, width: f64, height: f64, seen: f64) -> Result<(), String> {
  let (left, top) = page_origin(&app, seen);
  let at = LogicalPosition::new(x + left, y + top);
  let size = LogicalSize::new(width, height);
  if let Some(view) = find(&app, &host) {
    view.set_position(at).map_err(|e| e.to_string())?;
    view.set_size(size).map_err(|e| e.to_string())?;
    view.show().map_err(|e| e.to_string())?;
    let _ = view.set_focus();
    return Ok(());
  }
  let window = app.get_window("main").ok_or("no window")?;
  let start: Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
  let (loads, titles, opens) = ((app.clone(), host.clone()), (app.clone(), host.clone()), (app.clone(), host.clone()));
  let builder = WebviewBuilder::new(label(&host), WebviewUrl::External(start))
    .user_agent(user_agent())
    .on_page_load(move |_, payload| {
      tell(&loads.0, Page {
        host: loads.1.clone(),
        url: Some(payload.url().to_string()),
        title: None,
        loading: Some(matches!(payload.event(), PageLoadEvent::Started)),
      });
    })
    .on_document_title_changed(move |_, title| {
      tell(&titles.0, Page { host: titles.1.clone(), url: None, title: Some(title), loading: None });
    })
    // A link that asks for a new window opens here, until there are tabs to open it in.
    .on_new_window(move |url, _| {
      if let Some(view) = find(&opens.0, &opens.1) {
        let _ = view.navigate(url);
      }
      NewWindowResponse::Deny
    });
  let view = window.add_child(builder, at, size).map_err(|e| e.to_string())?;
  let _ = view.set_focus();
  Ok(())
}

#[tauri::command]
pub async fn browser_hide(app: AppHandle, host: String) -> Result<(), String> {
  if let Some(view) = find(&app, &host) {
    view.hide().map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
pub async fn browser_go(app: AppHandle, host: String, url: String) -> Result<(), String> {
  let to: Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
  find(&app, &host).ok_or("no browser")?.navigate(to).map_err(|e| e.to_string())
}

/// Back, forward or reload, as the page's own history does them.
#[tauri::command]
pub async fn browser_step(app: AppHandle, host: String, step: String) -> Result<(), String> {
  let view = find(&app, &host).ok_or("no browser")?;
  match step.as_str() {
    "back" => view.eval("history.back()"),
    "forward" => view.eval("history.forward()"),
    "reload" => view.reload(),
    _ => return Err(format!("no step {step}")),
  }
  .map_err(|e| e.to_string())
}

/// The tile is gone: so is its browser.
#[tauri::command]
pub async fn browser_close(app: AppHandle, host: String) -> Result<(), String> {
  if let Some(view) = find(&app, &host) {
    view.close().map_err(|e| e.to_string())?;
  }
  Ok(())
}

/// The window's appearance, which pages follow for light and dark: the app's theme, or the
/// system's when the theme follows it.
#[tauri::command]
pub async fn appearance(app: AppHandle, theme: String) -> Result<(), String> {
  let window = app.get_window("main").ok_or("no window")?;
  let theme = match theme.as_str() {
    "light" => Some(Theme::Light),
    "dark" => Some(Theme::Dark),
    _ => None,
  };
  window.set_theme(theme).map_err(|e| e.to_string())
}
