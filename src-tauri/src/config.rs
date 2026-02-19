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
    pub ollama_model: Option<String>,
    pub ollama_embedding_model: Option<String>,
    pub ollama_min_chars: usize,
    pub min_confidence: f32,
    pub silence_threshold: f32,
    pub transcription_mode: String,
    pub whisper_language: String,
    pub agenda_similarity_threshold: f32,
    pub transcription_interval_secs: u64,
    pub agenda_check_cooldown_secs: u64,
    pub cache_freshness_secs: u64,
    pub ollama_base_url: String,
    pub whisper_threads: usize,
    pub min_analysis_chars: usize,
    pub agenda_answered_threshold: f32,
    pub error: Option<String>,
}

impl Config {
    pub fn get_app_data_dir() -> std::path::PathBuf {
        let mut path = dirs::config_dir()
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
            .join("Kuroko");

        #[cfg(debug_assertions)]
        {
            path.push("dev");
        }

        path
    }

    pub fn get_env_path() -> std::path::PathBuf {
        let app_data_dir = Self::get_app_data_dir();
        let app_data_env = app_data_dir.join(".env");
        let local_env = std::env::current_dir().unwrap_or_default().join(".env");

        #[cfg(debug_assertions)]
        {
            // In dev, prefer local .env if it exists
            if local_env.exists() {
                return local_env;
            }
            app_data_env
        }

        #[cfg(not(debug_assertions))]
        {
            // In production, prefer AppData .env
            if app_data_env.exists() {
                return app_data_env;
            }
            local_env
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

        let env_path = Self::get_env_path();
        let has_env = env_path.exists();

        if !has_env {
            let default_env = r#"# Kuroko Configuration

# 1. Your Google Gemini API Key (Required)
# Get one at: https://aistudio.google.com/
GEMINI_API_KEY=

# 2. Path to your Whisper GGML model .bin file (Required)
# Example: /Users/yourname/models/ggml-base.en.bin
WHISPER_GGML_PATH=

# 3. AI Model to use (Optional)
GEMINI_MODEL=gemini-2.5-flash

# 4. Global Hotkey (Optional, Default: Command+Shift+K)
# Format: Command+Shift+K, Alt+Space, etc.
GLOBAL_HOTKEY=Command+Shift+K

# 5. Audio buffer length in seconds (Optional, Default: 45)
BUFFER_DURATION_SECS=45

# 6. Minimum confidence for AI response (Optional, Default: 0.5)
MIN_CONFIDENCE=0.5

# 7. Silence Threshold (Optional)
# Increase if background noise triggers transcription, decrease if quiet speech is cut off.
SILENCE_THRESHOLD=0.004

# 8. Transcription Mode (Optional, Default: speed)
# Options: speed, accuracy
TRANSCRIPTION_MODE=speed

# 9. Whisper Language (Optional, Default: en)
# Options: en, zh, pl, fr
WHISPER_LANGUAGE=en

# 10. Agenda Similarity Threshold (Optional, Default: 0.35)
# Similarity score at which we trigger detailed LLM scoring for an agenda item.
AGENDA_SIMILARITY_THRESHOLD=0.35

# 11. Transcription Interval in seconds (Optional, Default: 5)
# How often to run the background transcription.
TRANSCRIPTION_INTERVAL_SECS=5

# 12. Agenda Check Cooldown in seconds (Optional, Default: 20)
# Minimum time between agenda updates to save CPU.
AGENDA_CHECK_COOLDOWN_SECS=20

# 13. Cache Freshness in seconds (Optional, Default: 12)
# How old the cached transcript can be before we re-transcribe.
CACHE_FRESHNESS_SECS=12

# 14. Ollama Base URL (Optional, Default: http://localhost:11434)
OLLAMA_BASE_URL=http://localhost:11434

# 15. Whisper Threads (Optional, Default: 8)
WHISPER_THREADS=8

# 16. Min Analysis Chars (Optional, Default: 25)
# Minimum length of transcript required to trigger Gemini analysis.
MIN_ANALYSIS_CHARS=25

# 17. Agenda Answered Threshold (Optional, Default: 0.95)
# Score at which an agenda item is considered "answered".
AGENDA_ANSWERED_THRESHOLD=0.95
"#;
            if let Err(e) = std::fs::write(&app_data_dir.join(".env"), default_env) {
                println!("Warning: Failed to create .env template: {}", e);
            }
        }

        if env_path.exists() {
            dotenvy::from_path(&env_path).ok();
            println!("Loaded configuration from: {:?}", env_path);
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
            env::var("GEMINI_MODEL").unwrap_or_else(|_| "gemini-2.5-flash".to_string());

        let ollama_model = env::var("OLLAMA_MODEL").ok();
        let ollama_min_chars = env::var("OLLAMA_MIN_CHARS")
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

        let silence_threshold = env::var("SILENCE_THRESHOLD")
            .unwrap_or_else(|_| "0.002".to_string())
            .parse::<f32>()
            .unwrap_or(0.002);

        let transcription_mode =
            env::var("TRANSCRIPTION_MODE").unwrap_or_else(|_| "speed".to_string());

        let whisper_language = env::var("WHISPER_LANGUAGE").unwrap_or_else(|_| "en".to_string());

        let agenda_similarity_threshold = env::var("AGENDA_SIMILARITY_THRESHOLD")
            .unwrap_or_else(|_| "0.35".to_string())
            .parse::<f32>()
            .unwrap_or(0.35);

        let transcription_interval_secs = env::var("TRANSCRIPTION_INTERVAL_SECS")
            .unwrap_or_else(|_| "5".to_string())
            .parse::<u64>()
            .unwrap_or(5);

        let agenda_check_cooldown_secs = env::var("AGENDA_CHECK_COOLDOWN_SECS")
            .unwrap_or_else(|_| "20".to_string())
            .parse::<u64>()
            .unwrap_or(20);

        let cache_freshness_secs = env::var("CACHE_FRESHNESS_SECS")
            .unwrap_or_else(|_| "12".to_string())
            .parse::<u64>()
            .unwrap_or(12);

        let ollama_base_url =
            env::var("OLLAMA_BASE_URL").unwrap_or_else(|_| "http://localhost:11434".to_string());

        let whisper_threads = env::var("WHISPER_THREADS")
            .unwrap_or_else(|_| "8".to_string())
            .parse::<usize>()
            .unwrap_or(8);

        let min_analysis_chars = env::var("MIN_ANALYSIS_CHARS")
            .unwrap_or_else(|_| "25".to_string())
            .parse::<usize>()
            .unwrap_or(25);

        let agenda_answered_threshold = env::var("AGENDA_ANSWERED_THRESHOLD")
            .unwrap_or_else(|_| "0.95".to_string())
            .parse::<f32>()
            .unwrap_or(0.95);

        // Load prompt from file in App Data dir
        let mut prompt = String::new();
        let prompt_path = app_data_dir.join("prompt.txt");

        if prompt_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&prompt_path) {
                prompt = content.trim().to_string();
            }
        }

        if prompt.is_empty() {
            prompt = "You are Kuroko, a live meeting assistant. Answer questions or verify claims from the transcript.".to_string();
            let _ = std::fs::write(&prompt_path, &prompt);
        }

        Ok(Config {
            gemini_api_key,
            gemini_model,
            global_hotkey,
            buffer_duration_secs,
            whisper_ggml_path,
            prompt,
            ollama_model,
            ollama_embedding_model: env::var("OLLAMA_EMBEDDING_MODEL").ok(),
            ollama_min_chars,
            min_confidence,
            silence_threshold,
            transcription_mode,
            whisper_language,
            agenda_similarity_threshold,
            transcription_interval_secs,
            agenda_check_cooldown_secs,
            cache_freshness_secs,
            ollama_base_url,
            whisper_threads,
            min_analysis_chars,
            agenda_answered_threshold,
            error,
        })
    }

    pub fn save(&self) -> Result<(), String> {
        let app_data_dir = Self::get_app_data_dir();
        let env_path = Self::get_env_path();
        let prompt_path = app_data_dir.join("prompt.txt");

        // Write prompt.txt
        std::fs::write(&prompt_path, &self.prompt).map_err(|e| e.to_string())?;

        // Write .env
        let env_content = format!(
            r#"# Kuroko Configuration
GEMINI_API_KEY={}
WHISPER_GGML_PATH={}
GEMINI_MODEL={}
GLOBAL_HOTKEY={}
BUFFER_DURATION_SECS={}
OLLAMA_MODEL={}
OLLAMA_EMBEDDING_MODEL={}
OLLAMA_MIN_CHARS={}
SILENCE_THRESHOLD={}
TRANSCRIPTION_MODE={}
MIN_CONFIDENCE={}
WHISPER_LANGUAGE={}
AGENDA_SIMILARITY_THRESHOLD={}
TRANSCRIPTION_INTERVAL_SECS={}
AGENDA_CHECK_COOLDOWN_SECS={}
CACHE_FRESHNESS_SECS={}
OLLAMA_BASE_URL={}
WHISPER_THREADS={}
MIN_ANALYSIS_CHARS={}
AGENDA_ANSWERED_THRESHOLD={}
"#,
            self.gemini_api_key,
            self.whisper_ggml_path,
            self.gemini_model,
            self.global_hotkey,
            self.buffer_duration_secs,
            self.ollama_model.as_deref().unwrap_or_default(),
            self.ollama_embedding_model.as_deref().unwrap_or_default(),
            self.ollama_min_chars,
            self.silence_threshold,
            self.transcription_mode,
            self.min_confidence,
            self.whisper_language,
            self.agenda_similarity_threshold,
            self.transcription_interval_secs,
            self.agenda_check_cooldown_secs,
            self.cache_freshness_secs,
            self.ollama_base_url,
            self.whisper_threads,
            self.min_analysis_chars,
            self.agenda_answered_threshold
        );

        std::fs::write(&env_path, env_content).map_err(|e| e.to_string())?;
        Ok(())
    }
}
