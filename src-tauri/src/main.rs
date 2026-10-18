// Hides the extra console window on Windows release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod discord;

use tauri::{WebviewUrl, WebviewWindowBuilder};

/// The webview ignores `window.open` and `target="_blank"` links, so send external
/// http(s) links to the user's default browser instead.
const OPEN_EXTERNAL_LINKS: &str = r#"
(function () {
  const openExternal = (url) => {
    try {
      window.__TAURI_INTERNALS__.invoke('plugin:opener|open_url', { url: url });
    } catch (e) {
      console.error('Could not open link', e);
    }
  };
  const external = (href) => {
    try {
      const u = new URL(href, location.href);
      return /^https?:$/.test(u.protocol) && u.origin !== location.origin ? u.href : null;
    } catch (_) {
      return null;
    }
  };
  window.open = function (url) {
    const target = url && external(String(url));
    if (target) openExternal(target);
    return null;
  };
  document.addEventListener(
    'click',
    (event) => {
      const a = event.target && event.target.closest && event.target.closest('a[href]');
      const target = a && external(a.href);
      if (target) {
        event.preventDefault();
        openExternal(target);
      }
    },
    true
  );
})();
"#;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(discord::DiscordState::default())
        .invoke_handler(tauri::generate_handler![
            discord::set_discord_activity,
            discord::clear_discord_activity
        ])
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Folk AMLL Editor")
                .inner_size(1400.0, 900.0)
                .min_inner_size(900.0, 600.0)
                // The editor draws its own title bar and window buttons
                .decorations(false)
                .initialization_script(OPEN_EXTERNAL_LINKS)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Folk AMLL Editor");
}
