// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod audio;
mod config;
mod commands;

use config::Config;

pub struct SessionState {
    pub filename: String,
}

use chrono::Local;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Config::load now handles searching for .env in the right places

    // Load and validate config (don't expect anymore)
    let config = Config::load().unwrap_or_else(|e| {
         let c = Config {
            gemini_api_key: "".to_string(),
            gemini_model: "gemini-2.5-flash".to_string(),
            global_hotkey: "Command+Shift+K".to_string(),
            buffer_duration_secs: 45,
            whisper_ggml_path: "".to_string(),
            prompt: "".to_string(),
            ollama_model: None,
            ollama_embedding_model: None,
            ollama_min_chars: 50,
            min_confidence: 0.5,
            silence_threshold: 0.005,
            transcription_mode: "speed".to_string(),
            whisper_language: "en".to_string(),
            agenda_similarity_threshold: 0.35,
            transcription_interval_secs: 5,
            agenda_check_cooldown_secs: 20,
            cache_freshness_secs: 12,
            ollama_base_url: "http://localhost:11434".to_string(),
            whisper_threads: 8,
            min_analysis_chars: 25,
            agenda_answered_threshold: 0.95,
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
            commands::get_latest_audio,
            commands::transcribe_audio,
            commands::transcribe_latest,
            commands::get_config,
            commands::get_audio_device,
            commands::list_audio_devices,
            commands::set_audio_device,
            commands::log_session,
            commands::hide_window,
            commands::open_config_dir,
            commands::quit_app,
            commands::set_recording_state,
            commands::update_config,
            commands::list_ollama_models,
            commands::validate_gemini_key,
            commands::validate_file_path,
            commands::validate_hotkey,
            commands::update_agenda,
            commands::clear_audio_buffer,
            commands::expand_agenda_item
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });
}
