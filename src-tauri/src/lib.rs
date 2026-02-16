// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod audio;
mod config;
use audio::get_latest_audio;
use config::Config;

struct SessionState {
    filename: String,
}

use chrono::Local;
use std::fs::OpenOptions;
use std::io::Write;

#[tauri::command]
fn log_session(
    transcript: String,
    answer: String,
    state: tauri::State<SessionState>,
) -> Result<(), String> {
    let logs_dir = std::env::current_dir().unwrap_or_default().join("logs");
    if !logs_dir.exists() {
        std::fs::create_dir_all(&logs_dir).map_err(|e| e.to_string())?;
    }

    let file_path = logs_dir.join(&state.filename);

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(file_path)
        .map_err(|e| e.to_string())?;

    let timestamp = Local::now().format("%H:%M:%S").to_string();
    let log_entry = format!(
        "## [{}]\n\n**Transcript:**\n{}\n\n**Sidekick:**\n{}\n\n---\n\n",
        timestamp, transcript, answer
    );

    file.write_all(log_entry.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_config(config: tauri::State<Config>) -> Config {
    config.inner().clone()
}

use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file
    // We try to find it in the current dir or parent dir (since we're likely in src-tauri)
    if let Ok(cwd) = std::env::current_dir() {
        let mut path = cwd.clone();
        loop {
            let env_path = path.join(".env");
            if env_path.exists() {
                dotenvy::from_path(env_path).ok();
                break;
            }
            if !path.pop() {
                // Fallback to standard search if we hit root
                dotenvy::dotenv().ok();
                break;
            }
        }
    } else {
        dotenvy::dotenv().ok();
    }

    // Load and validate config
    let config = Config::load().expect("Failed to load configuration");

    let hotkey_str = &config.global_hotkey;
    let hotkey = hotkey_str
        .parse::<Shortcut>()
        .expect("Failed to parse global shortcut");

    let session_filename = Local::now().format("%Y-%m-%d_%H-%M.md").to_string();

    // Initialize audio state. Panic if fails because this is core functionality.
    let audio_state = audio::AudioState::new(&config).expect("Failed to initialize audio capture");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                window.set_content_protected(true)?;
            }
            Ok(())
        })
        .plugin({
            let builder = tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut(hotkey.clone());
            
            match builder {
                Ok(b) => b,
                Err(e) => {
                    eprintln!("Failed to register global shortcut: {:?}", e);
                    #[cfg(target_os = "macos")]
                    {
                        // Open System Settings -> Privacy & Security -> Accessibility
                        let _ = std::process::Command::new("open")
                            .arg("x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility")
                            .spawn();
                    }
                    tauri_plugin_global_shortcut::Builder::new()
                }
            }
            .with_handler(move |app, shortcut, event| {
                if event.state == ShortcutState::Pressed && shortcut == &hotkey {
                    if let Some(window) = app.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("trigger-process", ());
                        }
                    }
                }
            })
            .build()
        })
        .manage(config)
        .manage(audio_state)
        .manage(SessionState {
            filename: session_filename,
        })
        .invoke_handler(tauri::generate_handler![
            get_latest_audio,
            audio::transcribe_audio,
            get_config,
            log_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
