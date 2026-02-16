// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod audio;
use audio::get_latest_audio;

#[derive(serde::Serialize)]
struct GeminiConfig {
    api_key: String,
    model: String,
}

#[tauri::command]
fn get_gemini_config() -> Result<GeminiConfig, String> {
    // Load .env if not loaded. 
    // Actually dotenvy::dotenv() should be called at start of run()
    let api_key = std::env::var("GEMINI_API_KEY").map_err(|_| "GEMINI_API_KEY not found".to_string())?;
    let model = std::env::var("GEMINI_MODEL").unwrap_or("gemini-1.5-flash".to_string());
    Ok(GeminiConfig { api_key, model })
}

use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};
use tauri::{Manager, Emitter};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file
    dotenvy::dotenv().ok();

    // Initialize audio state. Panic if fails because this is core functionality.
    let audio_state = audio::AudioState::new().expect("Failed to initialize audio capture");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut(Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyK))
                .expect("Failed to register global shortcut")
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::KeyK) {
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
                    }
                })
                .build()
        )
        .manage(audio_state)
        .invoke_handler(tauri::generate_handler![get_latest_audio, audio::transcribe_audio, get_gemini_config])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
