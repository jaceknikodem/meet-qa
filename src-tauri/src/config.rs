use serde::{Deserialize, Serialize};
use std::env;
use std::path::Path;
use tauri_plugin_global_shortcut::Shortcut;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(rename = "api_key")]
    pub gemini_api_key: String,
    #[serde(rename = "model")]
    pub gemini_model: String,
    pub global_hotkey: String,
    pub buffer_duration_secs: usize,
    pub whisper_ggml_path: String,
    pub prompt: String,
    pub detect_question_model: Option<String>,
    pub detect_question_min_chars: usize,
    pub min_confidence: f32,
    pub error: Option<String>,
}

impl Config {
    pub fn get_app_data_dir() -> std::path::PathBuf {
        // In development, use the project root (current directory)
        #[cfg(debug_assertions)]
        return std::env::current_dir().unwrap_or_default();

        #[cfg(not(debug_assertions))]
        {
            let path = tauri::utils::platform::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

            // On macOS, if we're in a bundle, the AppData is better for config
            #[cfg(target_os = "macos")]
            if let Some(home_dir) = dirs::home_dir() {
                let mut path: std::path::PathBuf = home_dir;
                path.push("Library/Application Support/Stealth Sidekick");
                return path;
            }

            path
        }
    }

    pub fn load() -> Result<Self, String> {
        let app_data_dir = Self::get_app_data_dir();
        if !app_data_dir.exists() {
            if let Err(e) = std::fs::create_dir_all(&app_data_dir) {
                return Err(format!(
                    "Failed to create config directory at {:?}: {}",
                    app_data_dir, e
                ));
            }
        }

        // Try to load .env from app data dir first
        let env_path = app_data_dir.join(".env");
        if !env_path.exists() {
            let default_env = r#"# Stealth Sidekick Configuration

# 1. Your Google Gemini API Key (Required)
# Get one at: https://aistudio.google.com/
GEMINI_API_KEY=

# 2. Path to your Whisper GGML model .bin file (Required)
# Example: /Users/yourname/models/ggml-base.en.bin
WHISPER_GGML_PATH=

# 3. AI Model to use (Optional)
GEMINI_MODEL=gemini-1.5-flash

# 4. Global Hotkey (Optional, Default: Command+Shift+K)
# Format: Command+Shift+K, Alt+Space, etc.
GLOBAL_HOTKEY=Command+Shift+K

# 5. Audio buffer length in seconds (Optional, Default: 45)
BUFFER_DURATION_SECS=45

# 6. Minimum confidence for AI response (Optional, Default: 0.5)
MIN_CONFIDENCE=0.5
"#;
            if let Err(e) = std::fs::write(&env_path, default_env) {
                println!("Warning: Failed to create .env template: {}", e);
            }
        }

        if env_path.exists() {
            dotenvy::from_path(&env_path).ok();
            println!("Loaded .env from: {:?}", env_path);
        }

        let gemini_api_key = env::var("GEMINI_API_KEY").unwrap_or_default();
        let whisper_ggml_path = env::var("WHISPER_GGML_PATH").unwrap_or_default();

        let mut error = None;
        if gemini_api_key.is_empty() || whisper_ggml_path.is_empty() {
            error = Some(format!(
                "Setting Required. Open the folder and edit .env at: {:?}",
                app_data_dir
            ));
        } else if !Path::new(&whisper_ggml_path).exists() {
            error = Some(format!(
                "Whisper model not found at: {}. Please check your .env file in {:?}",
                whisper_ggml_path, app_data_dir
            ));
        }

        let gemini_model =
            env::var("GEMINI_MODEL").unwrap_or_else(|_| "gemini-1.5-flash".to_string());

        let detect_question_model = env::var("DETECT_QUESTION_MODEL").ok();

        let detect_question_min_chars = env::var("DETECT_QUESTION_MIN_CHARS")
            .unwrap_or_else(|_| "50".to_string())
            .parse::<usize>()
            .unwrap_or(50);

        let global_hotkey =
            env::var("GLOBAL_HOTKEY").unwrap_or_else(|_| "Command+Shift+K".to_string());

        // Validate hotkey
        global_hotkey
            .parse::<Shortcut>()
            .map_err(|e| format!("Invalid GLOBAL_HOTKEY '{}': {}", global_hotkey, e))?;

        let buffer_duration_secs = env::var("BUFFER_DURATION_SECS")
            .unwrap_or_else(|_| "45".to_string())
            .parse::<usize>()
            .unwrap_or(45);

        let min_confidence = env::var("MIN_CONFIDENCE")
            .unwrap_or_else(|_| "0.5".to_string())
            .parse::<f32>()
            .unwrap_or(0.5);

        // Load prompt from file in App Data dir
        let mut prompt = String::new();
        let prompt_path = app_data_dir.join("prompt.txt");

        if prompt_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&prompt_path) {
                prompt = content.trim().to_string();
            }
        }

        if prompt.is_empty() {
            prompt = "You are a live meeting sidekick. Answer questions or verify claims from the transcript.".to_string();
            let _ = std::fs::write(&prompt_path, &prompt);
        }

        Ok(Config {
            gemini_api_key,
            gemini_model,
            global_hotkey,
            buffer_duration_secs,
            whisper_ggml_path,
            prompt,
            detect_question_model,
            detect_question_min_chars,
            min_confidence,
            error,
        })
    }
}
