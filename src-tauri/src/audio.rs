use crate::config::Config;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tauri::State;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const SAMPLE_RATE: u32 = 16000;

pub struct AudioState {
    pub buffer: Arc<Mutex<VecDeque<f32>>>,
    pub context: Arc<WhisperContext>,
    pub last_transcript: Arc<Mutex<String>>,
    pub last_updated: Arc<Mutex<std::time::Instant>>,
    // We keep the stream around so it doesn't get dropped and stop recording
    pub _stream: cpal::Stream,
}

// cpal::Stream is not Send/Sync on all platforms, but we just hold it here to keep it alive.
unsafe impl Send for AudioState {}
unsafe impl Sync for AudioState {}

impl AudioState {
    pub fn new(config: &Config) -> Result<Self, anyhow::Error> {
        let host = cpal::default_host();

        let device = host
            .default_input_device()
            .ok_or_else(|| anyhow::anyhow!("No input device found"))?;

        println!(
            "Input device: {}",
            device.name().unwrap_or("unknown".to_string())
        );

        let stream_config = device.default_input_config()?;
        let input_sample_rate = stream_config.sample_rate().0;
        println!("Input Sample Rate: {}", input_sample_rate);

        let duration_secs = config.buffer_duration_secs;
        let max_samples = (SAMPLE_RATE as usize) * duration_secs;

        let buffer = Arc::new(Mutex::new(VecDeque::with_capacity(max_samples)));
        let buffer_clone = buffer.clone();

        let err_fn = move |err| {
            eprintln!("an error occurred on stream: {}", err);
        };

        let stream = match stream_config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &stream_config.into(),
                move |data: &[f32], _: &_| {
                    write_input_data(data, &buffer_clone, input_sample_rate, max_samples)
                },
                err_fn,
                None,
            )?,
            cpal::SampleFormat::I16 => device.build_input_stream(
                &stream_config.into(),
                move |data: &[i16], _: &_| {
                    write_input_data_i16(data, &buffer_clone, input_sample_rate, max_samples)
                },
                err_fn,
                None,
            )?,
            _ => return Err(anyhow::anyhow!("Unsupported sample format")),
        };

        stream.play()?;

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

        // Start background pre-emptive transcription thread
        let buffer_bg = buffer.clone();
        let ctx_bg = ctx.clone();
        let transcript_bg = last_transcript.clone();
        let updated_bg = last_updated.clone();

        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_secs(5));

            let samples: Vec<f32> = {
                let guard = buffer_bg.lock().unwrap();
                guard.iter().cloned().collect()
            };

            if samples.is_empty() {
                continue;
            }

            if let Ok(text) = run_transcription(&ctx_bg, &samples) {
                if !text.is_empty() {
                    let mut t_guard = transcript_bg.lock().unwrap();
                    let mut u_guard = updated_bg.lock().unwrap();
                    *t_guard = text;
                    *u_guard = std::time::Instant::now();
                }
            }
        });

        Ok(AudioState {
            buffer,
            context: ctx,
            last_transcript,
            last_updated,
            _stream: stream,
        })
    }
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

fn run_transcription(ctx: &WhisperContext, samples: &[f32]) -> Result<String, String> {
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_n_threads(4);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    let mut state = ctx.create_state().map_err(|e| e.to_string())?;
    state.full(params, samples).map_err(|e| e.to_string())?;

    let num_segments = state.full_n_segments().map_err(|e| e.to_string())?;
    let mut result = String::new();
    for i in 0..num_segments {
        if let Ok(segment) = state.full_get_segment_text(i) {
            result.push_str(&segment);
        }
    }
    Ok(result.trim().to_string())
}

#[tauri::command]
pub fn transcribe_latest(audio_state: State<AudioState>) -> Result<String, String> {
    // Check if background transcription is fresh (less than 7 seconds old)
    {
        let updated = audio_state.last_updated.lock().unwrap();
        if updated.elapsed().as_secs() < 7 {
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

    let text = run_transcription(&audio_state.context, &samples)?;

    // Update cache
    let mut t_guard = audio_state.last_transcript.lock().unwrap();
    let mut u_guard = audio_state.last_updated.lock().unwrap();
    *t_guard = text.clone();
    *u_guard = std::time::Instant::now();

    Ok(text)
}

#[tauri::command]
pub fn get_latest_audio(_state: State<AudioState>) -> Result<String, String> {
    Err("Direct audio access disabled in favor of native transcription".to_string())
}

#[tauri::command]
pub fn transcribe_audio(_wav_path: String) -> Result<String, String> {
    Err("Legacy transcription disabled in favor of native transcription".to_string())
}
