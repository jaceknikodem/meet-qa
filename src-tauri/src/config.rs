use serde::Serialize;
use std::env;
use std::path::Path;
use tauri_plugin_global_shortcut::Shortcut;

#[derive(Debug, Clone, Serialize)]
pub struct Config {
    #[serde(rename = "api_key")]
    pub gemini_api_key: String,
    #[serde(rename = "model")]
    pub gemini_model: String,
    pub global_hotkey: String,
    pub buffer_duration_secs: usize,
    pub whisper_ggml_path: String,
    pub prompt: String,
}

impl Config {
    pub fn load() -> Result<Self, String> {
        // Load .env if it exists (dotenvy is already called in lib.rs,
        // but we'll ensure env vars are available here)

        let gemini_api_key = env::var("GEMINI_API_KEY")
            .map_err(|_| "GEMINI_API_KEY environment variable is required".to_string())?;

        if gemini_api_key.trim().is_empty() {
            return Err("GEMINI_API_KEY cannot be empty".to_string());
        }

        let gemini_model =
            env::var("GEMINI_MODEL").unwrap_or_else(|_| "gemini-1.5-flash".to_string());

        let global_hotkey =
            env::var("GLOBAL_HOTKEY").unwrap_or_else(|_| "Command+Shift+K".to_string());

        // Validate hotkey
        global_hotkey
            .parse::<Shortcut>()
            .map_err(|e| format!("Invalid GLOBAL_HOTKEY '{}': {}", global_hotkey, e))?;

        let buffer_duration_secs = env::var("BUFFER_DURATION_SECS")
            .unwrap_or_else(|_| "45".to_string())
            .parse::<usize>()
            .map_err(|e| format!("Invalid BUFFER_DURATION_SECS: {}", e))?;

        let whisper_ggml_path = env::var("WHISPER_GGML_PATH")
            .map_err(|_| "WHISPER_GGML_PATH environment variable is required".to_string())?;

        // Validate whisper model path
        if !Path::new(&whisper_ggml_path).exists() {
            return Err(format!("Whisper model not found at: {}", whisper_ggml_path));
        }

        // Load prompt from file
        let mut prompt = String::new();
        if let Ok(cwd) = env::current_dir() {
            let mut path = cwd.clone();
            loop {
                let prompt_path = path.join("prompt.txt");
                if prompt_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&prompt_path) {
                        prompt = content.trim().to_string();
                        println!("Loaded prompt from: {:?}", prompt_path);
                    }
                    break;
                }
                if !path.pop() {
                    break;
                }
            }
        }

        if prompt.is_empty() {
            // Minimal fallback if no file found
            prompt = "You are a live meeting sidekick. Answer questions or verify claims from the transcript.".to_string();
        }

        Ok(Config {
            gemini_api_key,
            gemini_model,
            global_hotkey,
            buffer_duration_secs,
            whisper_ggml_path,
            prompt,
        })
    }
}
