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
fn hide_window(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[tauri::command]
fn log_session(
    transcript: String,
    answer: String,
    state: tauri::State<SessionState>,
) -> Result<(), String> {
    let mut logs_dir = Config::get_app_data_dir();
    logs_dir.push("logs");
    
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
fn open_config_dir() -> Result<(), String> {
    let config_dir = Config::get_app_data_dir();
    if !config_dir.exists() {
        std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&config_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&config_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

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
    // Config::load now handles searching for .env in the right places

    // Load and validate config (don't expect anymore)
    let config = Config::load().unwrap_or_else(|e| {
         let c = Config {
            gemini_api_key: "".to_string(),
            gemini_model: "gemini-1.5-flash".to_string(),
            global_hotkey: "Command+Shift+K".to_string(),
            buffer_duration_secs: 45,
            whisper_ggml_path: "".to_string(),
            prompt: "".to_string(),
            detect_question_model: None,
            detect_question_min_chars: 50,
            error: Some(e),
         };
         c
    });

    let hotkey_str = &config.global_hotkey;
    let hotkey = hotkey_str
        .parse::<Shortcut>()
        .unwrap_or_else(|_| "Command+Shift+K".parse().unwrap());

    let session_filename = Local::now().format("%Y-%m-%d_%H-%M.md").to_string();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(config.clone())
        .manage(SessionState {
            filename: session_filename,
        })
        .setup(move |app| {
            // Initialize audio state with AppHandle (don't expect)
            match audio::AudioState::new(&config, app.handle().clone()) {
                Ok(audio_state) => {
                    app.manage(audio_state);
                }
                Err(e) => {
                    eprintln!("Failed to initialize audio capture: {:?}", e);
                }
            }

            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                window.set_content_protected(true)?;
                
                // If there's an error, show the window immediately so the user knows what to do
                if config.error.is_some() {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            Ok(())
        })
        // Handle Dock clicks / Re-activation
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Focused(true) = event {
                // Focus event on macOS often correlates with dock clicks if hidden
            }
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
        .invoke_handler(tauri::generate_handler![
            get_latest_audio,
            audio::transcribe_audio,
            audio::transcribe_latest,
            get_config,
            log_session,
            hide_window,
            open_config_dir,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
