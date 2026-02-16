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


#[derive(serde::Deserialize)]
struct OllamaModel {
    name: String,
}

#[derive(serde::Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaModel>,
}
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

#[tauri::command]
fn set_recording_state(state: tauri::State<audio::AudioState>, active: bool) {
    state.is_recording.store(active, std::sync::atomic::Ordering::Relaxed);
}

#[tauri::command]
fn update_config(new_config: Config) -> Result<(), String> {
    let app_data_dir = Config::get_app_data_dir();
    let env_path = app_data_dir.join(".env");
    let prompt_path = app_data_dir.join("prompt.txt");

    // Write prompt.txt
    std::fs::write(&prompt_path, &new_config.prompt).map_err(|e| e.to_string())?;

    // Write .env
    let env_content = format!(
        r#"# Stealth Sidekick Configuration
GEMINI_API_KEY={}
WHISPER_GGML_PATH={}
GEMINI_MODEL={}
GLOBAL_HOTKEY={}
BUFFER_DURATION_SECS={}
DETECT_QUESTION_MODEL={}
DETECT_QUESTION_MIN_CHARS={}
"#,
        new_config.gemini_api_key,
        new_config.whisper_ggml_path,
        new_config.gemini_model,
        new_config.global_hotkey,
        new_config.buffer_duration_secs,
        new_config.detect_question_model.unwrap_or_default(),
        new_config.detect_question_min_chars
    );

    std::fs::write(&env_path, env_content).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn validate_file_path(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
fn validate_hotkey(hotkey: String) -> bool {
    hotkey.parse::<tauri_plugin_global_shortcut::Shortcut>().is_ok()
}

#[tauri::command]
async fn list_ollama_models() -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("http://localhost:11434/api/tags")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
         return Err(format!("Ollama returned status: {}", resp.status()));
    }

    let tags: OllamaTagsResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(tags.models.into_iter().map(|m| m.name).collect())
}

#[tauri::command]
async fn validate_gemini_key(api_key: String) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(&format!(
            "https://generativelanguage.googleapis.com/v1beta/models?key={}",
            api_key
        ))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        Ok(true)
    } else {
         Err(format!("Gemini API Error: {}", resp.status()))
    }
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
                
                // Show the window on startup
                let _ = window.show();
                let _ = window.set_focus();
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
            quit_app,
            set_recording_state,
            update_config,
            list_ollama_models,
            validate_gemini_key,
            validate_file_path,
            validate_hotkey
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
