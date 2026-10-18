//! Discord Rich Presence for the desktop app. Talks to the locally running Discord client.

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// The Discord application ID of "Folk AMLL Tool".
/// Create an application with that name at https://discord.com/developers/applications and
/// paste its "Application ID" here (or set FOLK_DISCORD_CLIENT_ID when building).
const DISCORD_CLIENT_ID: &str = match option_env!("FOLK_DISCORD_CLIENT_ID") {
    Some(id) => id,
    None => "REPLACE_WITH_YOUR_DISCORD_APPLICATION_ID",
};
const REPOSITORY_URL: &str = "https://github.com/Monke90/Folk-AMLL-Editor";
const RETRY_DELAY: Duration = Duration::from_secs(15);

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordActivityPayload {
    details: Option<String>,
    state: Option<String>,
    show_repository_button: bool,
    start_timestamp: Option<i64>,
    end_timestamp: Option<i64>,
}

#[derive(Default)]
pub struct DiscordConnection {
    client: Option<DiscordIpcClient>,
    retry_after: Option<Instant>,
}

#[derive(Default)]
pub struct DiscordState(Mutex<DiscordConnection>);

fn configured() -> bool {
    !DISCORD_CLIENT_ID.starts_with("REPLACE_WITH")
}

fn connect() -> Result<DiscordIpcClient, String> {
    let mut client = DiscordIpcClient::new(DISCORD_CLIENT_ID);
    client.connect().map_err(|e| e.to_string())?;
    Ok(client)
}

#[tauri::command]
pub fn set_discord_activity(
    payload: DiscordActivityPayload,
    discord: tauri::State<'_, DiscordState>,
) -> Result<(), String> {
    if !configured() {
        return Err("No Discord application ID is set in this build".into());
    }
    let mut connection = discord.0.lock().map_err(|e| e.to_string())?;
    if connection.client.is_none() {
        if connection.retry_after.is_some_and(|t| t > Instant::now()) {
            return Ok(());
        }
        match connect() {
            Ok(client) => {
                connection.client = Some(client);
                connection.retry_after = None;
            }
            Err(_) => {
                // Discord is not running; try again later
                connection.retry_after = Some(Instant::now() + RETRY_DELAY);
                return Ok(());
            }
        }
    }

    let mut rich_presence = activity::Activity::new()
        .activity_type(activity::ActivityType::Listening)
        .status_display_type(activity::StatusDisplayType::Details);
    if let Some(details) = payload.details.as_deref().filter(|s| !s.is_empty()) {
        rich_presence = rich_presence.details(details);
    }
    if let Some(state) = payload.state.as_deref().filter(|s| !s.is_empty()) {
        rich_presence = rich_presence.state(state);
    }
    if payload.show_repository_button {
        rich_presence = rich_presence.buttons(vec![activity::Button::new(
            "View repository",
            REPOSITORY_URL,
        )]);
    }
    if let Some(start) = payload.start_timestamp {
        let mut timestamps = activity::Timestamps::new().start(start);
        if let Some(end) = payload.end_timestamp {
            timestamps = timestamps.end(end);
        }
        rich_presence = rich_presence.timestamps(timestamps);
    }

    let result = connection
        .client
        .as_mut()
        .expect("Discord client was just connected")
        .set_activity(rich_presence)
        .map_err(|e| e.to_string());
    if result.is_err() {
        connection.client = None;
        connection.retry_after = Some(Instant::now() + RETRY_DELAY);
    }
    result
}

#[tauri::command]
pub fn clear_discord_activity(discord: tauri::State<'_, DiscordState>) -> Result<(), String> {
    let mut connection = discord.0.lock().map_err(|e| e.to_string())?;
    if let Some(client) = connection.client.as_mut() {
        let result = client.clear_activity().map_err(|e| e.to_string());
        if result.is_err() {
            connection.client = None;
        }
        return result;
    }
    Ok(())
}
