use crate::agenda::AgendaItem;
use crate::audio::AudioState;
use crate::config::Config;
use crate::transcription::run_transcription;
use crate::SessionState;
use chrono::Local;
use std::fs::OpenOptions;
use std::io::Write;
use tauri::{AppHandle, Manager, State, Window};
use tauri_plugin_global_shortcut::Shortcut;

#[tauri::command]
pub fn transcribe_latest(audio_state: State<AudioState>) -> Result<String, String> {
    // Check if background transcription is fresh
    {
        let freshness = audio_state
            .cache_freshness_secs
            .load(std::sync::atomic::Ordering::Relaxed);
        let updated = audio_state.last_updated.lock().unwrap();
        if updated.elapsed().as_secs() < freshness {
            let cached = audio_state.last_transcript.lock().unwrap();
            if !cached.is_empty() {
                println!(
                    "Returning pre-emptive cached transcript ({}s old)",
                    updated.elapsed().as_secs()
                );
                return Ok(cached.clone());
            }
        }
    }

    let samples: Vec<f32> = {
        let guard = audio_state.buffer.lock().map_err(|e| e.to_string())?;
        guard.iter().cloned().collect()
    };

    if samples.is_empty() {
        return Ok("".to_string());
    }

    let text = run_transcription(
        &audio_state.context,
        &samples,
        audio_state.silence_threshold,
        &audio_state.transcription_mode.lock().unwrap(),
        &audio_state.whisper_language.lock().unwrap(),
        audio_state
            .whisper_threads
            .load(std::sync::atomic::Ordering::Relaxed),
    )?;

    // Update cache
    let mut t_guard = audio_state.last_transcript.lock().unwrap();
    let mut u_guard = audio_state.last_updated.lock().unwrap();
    *t_guard = text.clone();
    *u_guard = std::time::Instant::now();

    Ok(text)
}

#[tauri::command]
pub fn get_audio_device(app: tauri::AppHandle) -> String {
    match app.try_state::<AudioState>() {
        Some(state) => {
            let guard = state.device_name.lock().unwrap();
            guard.clone()
        }
        None => "No device detected".to_string(),
    }
}

#[tauri::command]
pub fn list_audio_devices() -> Result<Vec<String>, String> {
    Ok(AudioState::list_devices())
}

#[tauri::command]
pub fn set_audio_device(
    app: AppHandle,
    state: State<AudioState>,
    config: State<Config>,
    name: String,
) -> Result<(), String> {
    state.switch_device(name, app, &config)
}

#[tauri::command]
pub fn get_latest_audio(_state: State<AudioState>) -> Result<String, String> {
    Err("Direct audio access disabled in favor of native transcription".to_string())
}

#[tauri::command]
pub fn transcribe_audio(_wav_path: String) -> Result<String, String> {
    Err("Legacy transcription disabled in favor of native transcription".to_string())
}

#[tauri::command]
pub fn update_agenda(
    audio_state: State<AudioState>,
    config: State<Config>,
    mut items: Vec<AgendaItem>,
) -> Result<(), String> {
    // Generate embeddings for items that don't have them
    if let Some(model) = &config.ollama_embedding_model {
        for item in items.iter_mut() {
            if item.embedding.is_none() {
                if let Ok(emb) =
                    crate::agenda::get_embedding(model, &item.text, &config.ollama_base_url)
                {
                    item.embedding = Some(emb);
                } else {
                    eprintln!(
                        "Failed to generate embedding for agenda item: {}",
                        item.text
                    );
                }
            }
        }
    }

    let mut guard = audio_state.agenda.lock().unwrap();
    *guard = items;
    println!("Updated agenda with {} items", guard.len());
    Ok(())
}

#[tauri::command]
pub fn hide_window(window: Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn quit_app(app_handle: AppHandle) {
    app_handle.exit(0);
}

#[tauri::command]
pub fn log_session(
    transcript: String,
    answer: String,
    state: State<SessionState>,
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
        "## [{}]\n\n**Transcript:**\n{}\n\n**Kuroko:**\n{}\n\n---\n\n",
        timestamp, transcript, answer
    );

    file.write_all(log_entry.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_config_dir() -> Result<(), String> {
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
pub fn clear_audio_buffer(state: State<AudioState>) {
    state.clear_buffer();
}

#[tauri::command]
pub fn get_config(config: State<Config>) -> Config {
    config.inner().clone()
}

#[tauri::command]
pub fn set_recording_state(state: State<AudioState>, active: bool) {
    state
        .is_recording
        .store(active, std::sync::atomic::Ordering::Relaxed);
}

#[tauri::command]
pub fn update_config(new_config: Config, audio_state: State<AudioState>) -> Result<(), String> {
    // Update runtime state
    {
        let mut mode = audio_state.transcription_mode.lock().unwrap();
        *mode = new_config.transcription_mode.clone();
        let mut lang = audio_state.whisper_language.lock().unwrap();
        *lang = new_config.whisper_language.clone();
        audio_state.transcription_interval_secs.store(
            new_config.transcription_interval_secs,
            std::sync::atomic::Ordering::Relaxed,
        );
        audio_state.agenda_check_cooldown_secs.store(
            new_config.agenda_check_cooldown_secs,
            std::sync::atomic::Ordering::Relaxed,
        );
        audio_state.cache_freshness_secs.store(
            new_config.cache_freshness_secs,
            std::sync::atomic::Ordering::Relaxed,
        );
    }

    new_config.save().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn validate_file_path(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub fn validate_hotkey(hotkey: String) -> bool {
    hotkey.parse::<Shortcut>().is_ok()
}

#[tauri::command]
pub async fn list_ollama_models() -> Result<Vec<String>, String> {
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

    #[derive(serde::Deserialize)]
    struct OllamaModel {
        name: String,
    }

    #[derive(serde::Deserialize)]
    struct OllamaTagsResponse {
        models: Vec<OllamaModel>,
    }

    let tags: OllamaTagsResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(tags.models.into_iter().map(|m| m.name).collect())
}

#[tauri::command]
pub async fn validate_gemini_key(api_key: String) -> Result<bool, String> {
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

#[tauri::command]
pub async fn expand_agenda_item(
    config: State<'_, Config>,
    item_text: String,
) -> Result<Vec<String>, String> {
    if config.gemini_api_key.is_empty() {
        return Err("Gemini API Key is required".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let prompt = format!(
        "You are a meeting assistant. The user has a vague agenda item: \"{}\".
        Break this down into 3-5 specific, actionable sub-items or questions that can be tracked in a meeting.
        Return ONLY a JSON array of strings.
        Example: [\"Discuss Q1 revenue\", \"Review marketing budget\", \"Plan Q2 hiring\"]",
        item_text
    );

    let json_body = serde_json::json!({
        "contents": [{
            "parts": [{
                "text": prompt
            }]
        }]
    });

    let resp = client
        .post(&format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            config.gemini_model, config.gemini_api_key
        ))
        .json(&json_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Gemini API Error: {}", resp.status()));
    }

    let json_resp: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    // Extract text from Gemini response structure
    let text = json_resp["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or("Failed to parse Gemini response")?
        .trim();

    // Parse JSON array from text
    let start = text.find('[').ok_or("No JSON array found")?;
    let end = text.rfind(']').ok_or("No JSON array found")?;
    let json_str = &text[start..=end];

    let sub_items: Vec<String> =
        serde_json::from_str(json_str).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    Ok(sub_items)
}
