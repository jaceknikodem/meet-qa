use crate::config::Config;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const SAMPLE_RATE: u32 = 16000;

#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
}

#[derive(Deserialize)]
struct OllamaResponse {
    response: String,
}

// Wrapper to make cpal::Stream Send/Sync for storage in Mutex
// Wrapper to make cpal::Stream Send/Sync for storage in Mutex
pub struct SafeStream(pub cpal::Stream);
unsafe impl Send for SafeStream {}
unsafe impl Sync for SafeStream {}

pub struct AudioState {
    pub buffer: Arc<Mutex<VecDeque<f32>>>,
    pub context: Arc<WhisperContext>,
    pub last_transcript: Arc<Mutex<String>>,
    pub last_updated: Arc<Mutex<std::time::Instant>>,
    pub is_recording: Arc<std::sync::atomic::AtomicBool>,
    pub silence_threshold: f32,
    pub transcription_mode: Arc<Mutex<String>>,
    pub whisper_language: Arc<Mutex<String>>,
    pub agenda: Arc<Mutex<Vec<AgendaItem>>>,
    pub device_name: Arc<Mutex<String>>,
    pub stream_guard: Arc<Mutex<Option<SafeStream>>>,
}

impl AudioState {
    pub fn new(config: &Config, app_handle: AppHandle) -> Result<Self, anyhow::Error> {
        let host = cpal::default_host();

        let device = host
            .default_input_device()
            .ok_or_else(|| anyhow::anyhow!("No input device found"))?;

        let device_name_str = device.name().unwrap_or("unknown".to_string());
        println!("Input device: {}", device_name_str);

        let duration_secs = config.buffer_duration_secs;
        let max_samples = (SAMPLE_RATE as usize) * duration_secs;

        let buffer = Arc::new(Mutex::new(VecDeque::with_capacity(max_samples)));
        let is_recording = Arc::new(std::sync::atomic::AtomicBool::new(true));

        // Create initial stream
        let stream = create_stream(
            &device,
            &buffer,
            &is_recording,
            app_handle.clone(),
            max_samples,
        )?;
        let stream_guard = Arc::new(Mutex::new(Some(SafeStream(stream))));

        // Load Whisper model
        println!("Loading Whisper model from: {}", config.whisper_ggml_path);
        let ctx = WhisperContext::new_with_params(
            &config.whisper_ggml_path,
            WhisperContextParameters::default(),
        )
        .map_err(|e| anyhow::anyhow!("Failed to load whisper model: {}", e))?;

        let ctx = Arc::new(ctx);
        let last_transcript = Arc::new(Mutex::new(String::new()));
        let last_updated = Arc::new(Mutex::new(std::time::Instant::now()));
        let agenda = Arc::new(Mutex::new(Vec::new()));
        let transcription_mode = Arc::new(Mutex::new(config.transcription_mode.clone()));
        let whisper_language = Arc::new(Mutex::new(config.whisper_language.clone()));
        let device_name = Arc::new(Mutex::new(device_name_str));

        let audio_state = AudioState {
            buffer,
            context: ctx,
            last_transcript,
            last_updated,
            is_recording,
            silence_threshold: config.silence_threshold,
            transcription_mode,
            whisper_language,
            agenda,
            device_name,
            stream_guard,
        };

        audio_state.spawn_worker(config, app_handle);

        Ok(audio_state)
    }

    pub fn list_devices() -> Vec<String> {
        let host = cpal::default_host();
        match host.input_devices() {
            Ok(devices) => devices
                .map(|d| d.name().unwrap_or("unknown".to_string()))
                .collect(),
            Err(_) => vec![],
        }
    }

    pub fn switch_device(
        &self,
        new_device_name: String,
        app_handle: AppHandle,
        config: &Config,
    ) -> Result<(), String> {
        let host = cpal::default_host();
        let devices = host.input_devices().map_err(|e| e.to_string())?;

        let device = devices
            .into_iter()
            .find(|d| d.name().unwrap_or("unknown".to_string()) == new_device_name)
            .ok_or_else(|| "Device not found".to_string())?;

        // Calculate max_samples from config
        let duration_secs = config.buffer_duration_secs;
        let max_samples = (SAMPLE_RATE as usize) * duration_secs;

        // Clear buffer when switching devices? Maybe strictly not necessary but safer.
        {
            let mut buf_guard = self.buffer.lock().unwrap();
            buf_guard.clear();
        }

        let new_stream = create_stream(
            &device,
            &self.buffer,
            &self.is_recording,
            app_handle,
            max_samples,
        )
        .map_err(|e| e.to_string())?;

        // Swap the stream
        {
            let mut stream_guard = self.stream_guard.lock().unwrap();
            *stream_guard = Some(SafeStream(new_stream));
        }

        // Update device name
        {
            let mut name_guard = self.device_name.lock().unwrap();
            *name_guard = new_device_name;
        }

        Ok(())
    }

    fn spawn_worker(&self, config: &Config, app_handle: AppHandle) {
        let buffer_bg = self.buffer.clone();
        let ctx_bg = self.context.clone();
        let transcript_bg = self.last_transcript.clone();
        let updated_bg = self.last_updated.clone();
        let detect_model = config.ollama_model.clone();
        let min_chars = config.ollama_min_chars;
        let is_recording_bg = self.is_recording.clone();
        let silence_threshold = config.silence_threshold;
        let transcription_mode_bg = self.transcription_mode.clone();
        let whisper_language_bg = self.whisper_language.clone();
        let agenda_bg = self.agenda.clone();

        std::thread::spawn(move || {
            let mut last_detected_text = String::new();

            loop {
                std::thread::sleep(std::time::Duration::from_secs(10));

                if detect_model.is_none()
                    || !is_recording_bg.load(std::sync::atomic::Ordering::Relaxed)
                {
                    continue;
                }

                // Skip if agenda is empty
                {
                    let agenda = agenda_bg.lock().unwrap();
                    if agenda.is_empty() {
                        let _ = app_handle.emit("agenda-status", "Empty agenda");
                        continue;
                    }
                }

                let samples: Vec<f32> = {
                    let guard = buffer_bg.lock().unwrap();
                    guard.iter().cloned().collect()
                };

                if samples.is_empty() {
                    continue;
                }

                if let Ok(text) = run_transcription(
                    &ctx_bg,
                    &samples,
                    silence_threshold,
                    &transcription_mode_bg.lock().unwrap(),
                    &whisper_language_bg.lock().unwrap(),
                ) {
                    let mut t_guard = transcript_bg.lock().unwrap();
                    let mut u_guard = updated_bg.lock().unwrap();
                    *t_guard = text.clone();
                    *u_guard = std::time::Instant::now();

                    if let Some(model) = &detect_model {
                        if text.is_empty() {
                            let rms: f32 = (samples.iter().map(|s| s * s).sum::<f32>()
                                / samples.len() as f32)
                                .sqrt();
                            let status = format!("Listening... (silence, rms: {:.6})", rms);
                            let _ = app_handle.emit("agenda-status", status);
                            continue;
                        }

                        if text == last_detected_text {
                            let status = format!("Listening... ({} chars, no change)", text.len());
                            let _ = app_handle.emit("agenda-status", status);
                            continue;
                        }

                        if text.len() >= min_chars {
                            let _ = app_handle.emit("agenda-status", "Scanning agenda...");
                            let mut agenda_updates = Vec::new();
                            {
                                let agenda_items = agenda_bg.lock().unwrap();
                                let items_clone = agenda_items.clone();
                                if !items_clone.is_empty() {
                                    let updates = check_agenda(model, &text, &items_clone);
                                    if !updates.is_empty() {
                                        agenda_updates = updates;
                                    }
                                }
                            }

                            if !agenda_updates.is_empty() {
                                println!("Agenda updates found: {:?}", agenda_updates);
                                let mut update_msgs = Vec::new();
                                {
                                    let mut agenda_items = agenda_bg.lock().unwrap();
                                    for (id, answer) in &agenda_updates {
                                        if let Some(item) =
                                            agenda_items.iter_mut().find(|i| &i.id == id)
                                        {
                                            item.status = "answered".to_string();
                                            item.answer = Some(answer.clone());
                                            update_msgs.push(format!("Goal {}", id));
                                        }
                                    }
                                    let _ = app_handle.emit("agenda-update", agenda_items.clone());
                                }
                                let status = format!(
                                    "{} updated ({} chars, ollama run)",
                                    update_msgs.join(", "),
                                    text.len()
                                );
                                let _ = app_handle.emit("agenda-status", status);
                                last_detected_text = text.clone();
                            } else {
                                let status =
                                    format!("No updates ({} chars, ollama run)", text.len());
                                let _ = app_handle.emit("agenda-status", status);
                                last_detected_text = text;
                            }
                        } else {
                            let status = format!("Insufficient text ({} chars)", text.len());
                            let _ = app_handle.emit("agenda-status", status);
                        }
                    }
                }
            }
        });
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct AgendaItem {
    pub id: String,
    pub text: String,
    pub status: String, // "pending", "answered"
    pub answer: Option<String>,
}

fn check_agenda(model: &str, text: &str, items: &[AgendaItem]) -> Vec<(String, String)> {
    // Returns list of (id, answer) tuples
    let pending_items: Vec<&AgendaItem> = items.iter().filter(|i| i.status == "pending").collect();
    if pending_items.is_empty() {
        return Vec::new();
    }

    let questions_block = pending_items
        .iter()
        .enumerate()
        .map(|(i, item)| format!("{}. {}", i + 1, item.text))
        .collect::<Vec<String>>()
        .join("\n");

    let prompt = format!(
        "You are a meeting assistant. 
        Context: The following questions are on the agenda:
        {}
        
        Transcript Excerpt:
        \"{}\"
        
        Task: For each question, determine if it has been answered in the transcript.
        Return a JSON object where keys are the Question Indices (1, 2, etc.) and values are the answer text found.
        If not answered, do not include the key.
        Example JSON: {{ \"1\": \"The budget is $50k\" }}
        output ONLY JSON.",
        questions_block, text
    );

    let client = reqwest::blocking::Client::new();
    let req = OllamaRequest {
        model: model.to_string(),
        prompt,
        stream: false,
    };

    let mut updates = Vec::new();

    if let Ok(resp) = client
        .post("http://localhost:11434/api/generate")
        .json(&req)
        .send()
    {
        if let Ok(ollama_resp) = resp.json::<OllamaResponse>() {
            let json_str = ollama_resp.response.trim();
            // Try to find JSON block
            if let Some(start) = json_str.find('{') {
                if let Some(end) = json_str.rfind('}') {
                    let clean_json = &json_str[start..=end];
                    if let Ok(parsed) = serde_json::from_str::<
                        std::collections::HashMap<String, String>,
                    >(clean_json)
                    {
                        for (key, answer) in parsed {
                            if let Ok(idx) = key.parse::<usize>() {
                                if idx > 0 && idx <= pending_items.len() {
                                    let item = pending_items[idx - 1];
                                    updates.push((item.id.clone(), answer));
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    updates
}

fn create_stream(
    device: &cpal::Device,
    buffer: &Arc<Mutex<VecDeque<f32>>>,
    is_recording: &Arc<std::sync::atomic::AtomicBool>,
    app_handle: AppHandle,
    max_samples: usize,
) -> Result<cpal::Stream, anyhow::Error> {
    let stream_config = device.default_input_config()?;
    let input_sample_rate = stream_config.sample_rate().0;
    println!("Stream Sample Rate: {}", input_sample_rate);

    let buffer_clone = buffer.clone();
    let is_recording_data = is_recording.clone();
    let err_fn = move |err| {
        eprintln!("an error occurred on stream: {}", err);
    };

    let last_volume_emit = Arc::new(Mutex::new(std::time::Instant::now()));

    let stream = match stream_config.sample_format() {
        cpal::SampleFormat::F32 => {
            let last_emit = last_volume_emit.clone();
            let app = app_handle.clone();
            device.build_input_stream(
                &stream_config.into(),
                move |data: &[f32], _: &_| {
                    if is_recording_data.load(std::sync::atomic::Ordering::Relaxed) {
                        write_input_data(data, &buffer_clone, input_sample_rate, max_samples);

                        if let Ok(mut last_emit_guard) = last_emit.try_lock() {
                            if last_emit_guard.elapsed().as_millis() >= 100 {
                                let rms = if data.is_empty() {
                                    0.0
                                } else {
                                    (data.iter().map(|&s| s * s).sum::<f32>() / data.len() as f32)
                                        .sqrt()
                                };
                                let _ = app.emit("volume-level", rms);
                                *last_emit_guard = std::time::Instant::now();
                            }
                        }
                    }
                },
                err_fn,
                None,
            )?
        }
        cpal::SampleFormat::I16 => {
            let buffer_clone_i16 = buffer_clone.clone();
            let last_emit = last_volume_emit.clone();
            let app = app_handle.clone();
            device.build_input_stream(
                &stream_config.into(),
                move |data: &[i16], _: &_| {
                    if is_recording_data.load(std::sync::atomic::Ordering::Relaxed) {
                        write_input_data_i16(
                            data,
                            &buffer_clone_i16,
                            input_sample_rate,
                            max_samples,
                        );

                        if let Ok(mut last_emit_guard) = last_emit.try_lock() {
                            if last_emit_guard.elapsed().as_millis() >= 100 {
                                let rms = if data.is_empty() {
                                    0.0
                                } else {
                                    (data
                                        .iter()
                                        .map(|&s| {
                                            let f = s as f32 / i16::MAX as f32;
                                            f * f
                                        })
                                        .sum::<f32>()
                                        / data.len() as f32)
                                        .sqrt()
                                };
                                let _ = app.emit("volume-level", rms);
                                *last_emit_guard = std::time::Instant::now();
                            }
                        }
                    }
                },
                err_fn,
                None,
            )?
        }
        _ => return Err(anyhow::anyhow!("Unsupported sample format")),
    };

    stream.play()?;
    Ok(stream)
}

fn write_input_data(
    input: &[f32],
    buffer: &Arc<Mutex<VecDeque<f32>>>,
    input_rate: u32,
    max_samples: usize,
) {
    let mut guard = buffer.lock().unwrap();
    let ratio = input_rate as f32 / SAMPLE_RATE as f32;
    let mut index = 0.0;

    while (index as usize) < input.len() {
        let val = input[index as usize];
        guard.push_back(val);
        if guard.len() > max_samples {
            guard.pop_front();
        }
        index += ratio;
    }
}

fn write_input_data_i16(
    input: &[i16],
    buffer: &Arc<Mutex<VecDeque<f32>>>,
    input_rate: u32,
    max_samples: usize,
) {
    let float_input: Vec<f32> = input.iter().map(|&x| x as f32 / i16::MAX as f32).collect();
    write_input_data(&float_input, buffer, input_rate, max_samples);
}

pub fn run_transcription(
    ctx: &WhisperContext,
    samples: &[f32],
    threshold: f32,
    mode: &str,
    language: &str,
) -> Result<String, String> {
    let mut params = if mode == "accuracy" {
        FullParams::new(SamplingStrategy::BeamSearch {
            beam_size: 5,
            patience: 1.0,
        })
    } else {
        FullParams::new(SamplingStrategy::Greedy { best_of: 1 })
    };

    // Performance: Use more threads for Mac (8 is usually safe for M-series)
    params.set_n_threads(8);

    // Language setting
    params.set_language(Some(language));

    // Quality: Provide an initial prompt to guide the model towards better punctuation and formatting.
    // This trick is heavily used by apps like Wisprflow to get "magical" results.
    params.set_initial_prompt("The following is a high-quality, punctuated transcript of a professional conversation. It includes proper capitalization and ignores filler words like 'um' or 'uh'.");

    // Stability: No context prevents "hallucination loops" in rolling buffers
    params.set_no_context(true);

    // Cleanliness: Suppress non-speech tokens and empty segments
    params.set_suppress_non_speech_tokens(true);
    params.set_suppress_blank(true);

    // Formality: Force single segment (often faster for short clips)
    params.set_single_segment(true);

    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    if samples.is_empty() {
        return Ok(String::new());
    }

    // Silence detection
    let rms: f32 = (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt();
    if rms < threshold {
        return Ok(String::new());
    }

    // Pre-process audio: DC offset removal and Peak Normalization
    let mut processed_samples = samples.to_vec();
    preprocess_audio(&mut processed_samples);

    let mut state = ctx.create_state().map_err(|e| e.to_string())?;
    state
        .full(params, &processed_samples)
        .map_err(|e| e.to_string())?;

    let num_segments = state.full_n_segments().map_err(|e| e.to_string())?;
    let mut result = String::new();
    for i in 0..num_segments {
        if let Ok(segment) = state.full_get_segment_text(i) {
            result.push_str(&segment);
        }
    }
    Ok(result.trim().to_string())
}

fn preprocess_audio(samples: &mut [f32]) {
    if samples.is_empty() {
        return;
    }

    // 1. DC Offset Removal (Centering the waveform at 0)
    let mean: f32 = samples.iter().sum::<f32>() / samples.len() as f32;
    for sample in samples.iter_mut() {
        *sample -= mean;
    }

    // 2. Peak Normalization (Boosting volume to a consistent level)
    let mut max_amplitude: f32 = 0.0;
    for &sample in samples.iter() {
        let abs_sample = sample.abs();
        if abs_sample > max_amplitude {
            max_amplitude = abs_sample;
        }
    }

    // Only normalize if there's actually a signal to avoid blowing up floor noise
    if max_amplitude > 1e-6 {
        let scale = 0.9 / max_amplitude;
        for sample in samples.iter_mut() {
            *sample *= scale;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::sync::{Arc, Mutex};

    #[test]
    fn test_write_input_data_push() {
        let buffer = Arc::new(Mutex::new(VecDeque::new()));
        let input = vec![1.0, 2.0, 3.0];
        let input_rate = 16000;
        let max_samples = 10;

        write_input_data(&input, &buffer, input_rate, max_samples);

        let guard = buffer.lock().unwrap();
        assert_eq!(guard.len(), 3);
        assert_eq!(guard[0], 1.0);
        assert_eq!(guard[2], 3.0);
    }

    #[test]
    fn test_write_input_data_max_samples() {
        let buffer = Arc::new(Mutex::new(VecDeque::new()));
        let input = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let input_rate = 16000;
        let max_samples = 3;

        write_input_data(&input, &buffer, input_rate, max_samples);

        let guard = buffer.lock().unwrap();
        assert_eq!(guard.len(), 3);
        // Should keep the last 3 samples
        assert_eq!(guard[0], 3.0);
        assert_eq!(guard[2], 5.0);
    }

    #[test]
    fn test_write_input_data_resampling() {
        let buffer = Arc::new(Mutex::new(VecDeque::new()));
        let input = vec![1.0, 2.0, 3.0, 4.0];
        let input_rate = 32000; // 2x the standard rate
        let max_samples = 10;

        write_input_data(&input, &buffer, input_rate, max_samples);

        let guard = buffer.lock().unwrap();
        // At 32k -> 16k, we should skip every other sample
        // index += 2.0
        // index 0: 1.0
        // index 2: 3.0
        assert_eq!(guard.len(), 2);
        assert_eq!(guard[0], 1.0);
        assert_eq!(guard[1], 3.0);
    }
}
