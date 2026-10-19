//! "High performance mode": lets the desktop app use more of the PC.
//!
//! The setting is remembered in a small file in the app's config folder, because the web view's
//! graphics options can only be chosen when the window is created. Changing the toggle therefore
//! takes effect the next time the app starts.

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime, WebviewWindowBuilder};

fn flag_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    Some(dir.join("high-performance"))
}

fn is_enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
    flag_path(app).is_some_and(|p| p.exists())
}

#[tauri::command]
pub fn set_high_performance<R: Runtime>(app: AppHandle<R>, enabled: bool) -> Result<(), String> {
    let path = flag_path(&app).ok_or("No config folder")?;
    if enabled {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        fs::write(&path, b"1").map_err(|e| e.to_string())
    } else if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

/// Adds the extra web view options when high performance mode was left on.
#[cfg(windows)]
pub fn apply<'a, R: Runtime, M: Manager<R>>(
    app: &AppHandle<R>,
    builder: WebviewWindowBuilder<'a, R, M>,
) -> WebviewWindowBuilder<'a, R, M> {
    // These replace Tauri's default options, so the defaults are repeated first.
    const DEFAULTS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";
    const HIGH: &str = "--ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy \
        --disable-renderer-backgrounding --disable-background-timer-throttling \
        --disable-backgrounding-occluded-windows";
    if is_enabled(app) {
        builder.additional_browser_args(&format!("{DEFAULTS} {HIGH}"))
    } else {
        builder
    }
}

#[cfg(not(windows))]
pub fn apply<'a, R: Runtime, M: Manager<R>>(
    _app: &AppHandle<R>,
    builder: WebviewWindowBuilder<'a, R, M>,
) -> WebviewWindowBuilder<'a, R, M> {
    // The web view on macOS and Linux has no equivalent options
    let _ = is_enabled::<R>;
    builder
}
