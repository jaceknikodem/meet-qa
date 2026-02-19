use crate::agenda::{score_agenda_items, AgendaItem};
use crate::config::Config;
use crate::transcription::run_transcription;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use whisper_rs::{WhisperContext, WhisperContextParameters};

const SAMPLE_RATE: u32 = 16000;

// Wrapper to make cpal::Stream Send/Sync for storage in Mutex
pub struct SafeStream(#[allow(dead_code)] pub cpal::Stream);
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
    pub max_samples: usize,
    pub transcription_interval_secs: Arc<std::sync::atomic::AtomicU64>,
    pub agenda_check_cooldown_secs: Arc<std::sync::atomic::AtomicU64>,
    pub cache_freshness_secs: Arc<std::sync::atomic::AtomicU64>,
    pub ollama_base_url: Arc<Mutex<String>>,
    pub whisper_threads: Arc<std::sync::atomic::AtomicUsize>,
    pub agenda_answered_threshold: f32,
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
            max_samples,
            transcription_interval_secs: Arc::new(std::sync::atomic::AtomicU64::new(
                config.transcription_interval_secs,
            )),
            agenda_check_cooldown_secs: Arc::new(std::sync::atomic::AtomicU64::new(
                config.agenda_check_cooldown_secs,
            )),
            cache_freshness_secs: Arc::new(std::sync::atomic::AtomicU64::new(
                config.cache_freshness_secs,
            )),
            ollama_base_url: Arc::new(Mutex::new(config.ollama_base_url.clone())),
            whisper_threads: Arc::new(std::sync::atomic::AtomicUsize::new(config.whisper_threads)),
            agenda_answered_threshold: config.agenda_answered_threshold,
        };

        audio_state.spawn_worker(config, app_handle.clone());
        audio_state.spawn_buffer_monitor(app_handle);

        Ok(audio_state)
    }

    fn spawn_buffer_monitor(&self, app_handle: AppHandle) {
        let buffer_bg = self.buffer.clone();
        let is_recording_bg = self.is_recording.clone();
        let max_samples = self.max_samples;

        std::thread::spawn(move || {
            loop {
                std::thread::sleep(std::time::Duration::from_millis(250));

                if !is_recording_bg.load(std::sync::atomic::Ordering::Relaxed) {
                    continue;
                }

                let samples: Vec<f32> = {
                    let guard = match buffer_bg.lock() {
                        Ok(g) => g,
                        Err(_) => continue,
                    };
                    guard.iter().cloned().collect()
                };

                // Fixed 100 buckets spread across the TOTAL possible buffer duration
                let num_buckets = 100;
                let bucket_size = max_samples / num_buckets;

                if bucket_size == 0 {
                    continue;
                }

                let mut levels = Vec::with_capacity(num_buckets);
                let current_len = samples.len();

                for i in 0..num_buckets {
                    let start_idx = i * bucket_size;
                    let end_idx = (i + 1) * bucket_size;

                    // The 'samples' we have always represent the TAIL of the 45s window
                    // Calculate where this bucket falls relative to the current live tail
                    let virtual_start = if max_samples > current_len {
                        max_samples - current_len
                    } else {
                        0
                    };

                    let level = if end_idx <= virtual_start {
                        // This bucket is in the "future" (unfilled part of the history)
                        0.0
                    } else {
                        let actual_start = if start_idx < virtual_start {
                            0
                        } else {
                            start_idx - virtual_start
                        };
                        let actual_end = end_idx - virtual_start;

                        // Safety check for indices
                        if actual_start < current_len && actual_end <= current_len {
                            let chunk = &samples[actual_start..actual_end];
                            if chunk.is_empty() {
                                0.0
                            } else {
                                (chunk.iter().map(|&s| s * s).sum::<f32>() / chunk.len() as f32)
                                    .sqrt()
                            }
                        } else {
                            0.0
                        }
                    };

                    levels.push(level);
                }

                let _ = app_handle.emit("buffer-activity", levels);
            }
        });
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

    pub fn clear_buffer(&self) {
        let mut guard = self.buffer.lock().unwrap();
        guard.clear();
    }

    fn spawn_worker(&self, config: &Config, app_handle: AppHandle) {
        let buffer_bg = self.buffer.clone();
        let ctx_bg = self.context.clone();
        let transcript_bg = self.last_transcript.clone();
        let updated_bg = self.last_updated.clone();
        let detect_model = config.ollama_model.clone();
        let embedding_model = config.ollama_embedding_model.clone();
        let min_chars = config.ollama_min_chars;
        let is_recording_bg = self.is_recording.clone();
        let silence_threshold = config.silence_threshold;
        let transcription_mode_bg = self.transcription_mode.clone();
        let whisper_language_bg = self.whisper_language.clone();
        let agenda_bg = self.agenda.clone();
        let similarity_threshold = config.agenda_similarity_threshold;
        let transcription_interval_secs_bg = self.transcription_interval_secs.clone();
        let agenda_check_cooldown_secs_bg = self.agenda_check_cooldown_secs.clone();
        let ollama_base_url_bg = self.ollama_base_url.clone();
        let whisper_threads_bg = self.whisper_threads.clone();
        let agenda_answered_threshold = self.agenda_answered_threshold;

        std::thread::spawn(move || {
            let mut last_detected_text = String::new();
            let mut last_agenda_check = std::time::Instant::now();

            loop {
                let interval =
                    transcription_interval_secs_bg.load(std::sync::atomic::Ordering::Relaxed);
                std::thread::sleep(std::time::Duration::from_secs(interval));

                if !is_recording_bg.load(std::sync::atomic::Ordering::Relaxed) {
                    continue;
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
                    whisper_threads_bg.load(std::sync::atomic::Ordering::Relaxed),
                ) {
                    let mut t_guard = transcript_bg.lock().unwrap();
                    let mut u_guard = updated_bg.lock().unwrap();
                    *t_guard = text.clone();
                    *u_guard = std::time::Instant::now();

                    // Emit live transcript for UI
                    let _ = app_handle.emit("live-transcript", text.clone());

                    // From here on, logic depends on Ollama and Agenda
                    // Cooldown: avoid spamming Ollama
                    let cooldown =
                        agenda_check_cooldown_secs_bg.load(std::sync::atomic::Ordering::Relaxed);
                    if detect_model.is_none() || last_agenda_check.elapsed().as_secs() < cooldown {
                        continue;
                    }
                    last_agenda_check = std::time::Instant::now();

                    // Skip if agenda is empty
                    {
                        let agenda = agenda_bg.lock().unwrap();
                        if agenda.is_empty() {
                            let _ = app_handle.emit("agenda-status", "Empty agenda");
                            continue;
                        }
                    }

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
                            println!(
                                "[Agenda] Text unchanged ({} chars), skipping Ollama.",
                                text.len()
                            );
                            let status = format!("Listening... ({} chars, no change)", text.len());
                            let _ = app_handle.emit("agenda-status", status);
                            continue;
                        }

                        if text.len() >= min_chars {
                            println!(
                                "[Agenda] Sufficient text ({} chars), checking agenda...",
                                text.len()
                            );
                            let _ = app_handle.emit("agenda-status", "Scanning agenda...");
                            let mut agenda_updates = Vec::new();
                            {
                                let mut agenda_items = agenda_bg.lock().unwrap();
                                // We need to update items in place now, so we pass mutable reference
                                if !agenda_items.is_empty() {
                                    let updates = score_agenda_items(
                                        model,
                                        &text,
                                        &mut agenda_items,
                                        embedding_model.as_deref(),
                                        similarity_threshold,
                                        &ollama_base_url_bg.lock().unwrap(),
                                        agenda_answered_threshold,
                                    );
                                    if !updates.is_empty() {
                                        agenda_updates = updates;
                                    }
                                }
                            }

                            if !agenda_updates.is_empty() {
                                let _ = app_handle
                                    .emit("agenda-update", agenda_bg.lock().unwrap().clone());

                                let status = format!(
                                    "{} goals updated ({} chars)",
                                    agenda_updates.len(),
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

// Transcription and agenda logic completed.

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
