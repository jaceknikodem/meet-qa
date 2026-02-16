use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tauri::State;

const SAMPLE_RATE: u32 = 16000;

pub struct AudioState {
    pub buffer: Arc<Mutex<VecDeque<f32>>>,
    pub max_samples: usize,
    // We keep the stream around so it doesn't get dropped and stop recording
    pub _stream: Mutex<cpal::Stream>,
}

impl AudioState {
    pub fn new() -> Result<Self, anyhow::Error> {
        let host = cpal::default_host();

        // Try to find the default input device
        // Ideally this would be "BlackHole 2ch" per design, but we fall back to default
        let device = host
            .default_input_device()
            .ok_or_else(|| anyhow::anyhow!("No input device found"))?;

        println!(
            "Input device: {}",
            device.name().unwrap_or("unknown".to_string())
        );

        let config = device.default_input_config()?;
        let input_sample_rate = config.sample_rate().0;
        println!("Input Sample Rate: {}", input_sample_rate);

        // Read duration from config
        let duration_secs = std::env::var("BUFFER_DURATION_SECS")
            .unwrap_or_else(|_| "45".to_string())
            .parse::<usize>()
            .unwrap_or(45);

        let max_samples = (SAMPLE_RATE as usize) * duration_secs;

        // Buffer to store 16kHz samples
        let buffer = Arc::new(Mutex::new(VecDeque::with_capacity(max_samples)));
        let buffer_clone = buffer.clone();

        // We need a way to pass max_samples to the callback
        // Since max_samples is used inside the closures below, it will be captured.

        let err_fn = move |err| {
            eprintln!("an error occurred on stream: {}", err);
        };

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &config.into(),
                move |data: &[f32], _: &_| {
                    write_input_data(data, &buffer_clone, input_sample_rate, max_samples)
                },
                err_fn,
                None,
            )?,
            cpal::SampleFormat::I16 => device.build_input_stream(
                &config.into(),
                move |data: &[i16], _: &_| {
                    write_input_data_i16(data, &buffer_clone, input_sample_rate, max_samples)
                },
                err_fn,
                None,
            )?,
            // Handle other formats if necessary, simplified for now
            _ => return Err(anyhow::anyhow!("Unsupported sample format")),
        };

        stream.play()?;

        Ok(AudioState {
            buffer,
            max_samples,
            _stream: Mutex::new(stream),
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
    // Resample to 16kHz
    // This is a naive resamplers. In production use a proper crate like `rubato`.
    // We treat it as a ratio.

    let ratio = input_rate as f32 / SAMPLE_RATE as f32;
    let mut index = 0.0;

    // Process input
    // This is very simplified: we just pick samples nearest to the target index
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
    // Convert i16 to f32
    let float_input: Vec<f32> = input.iter().map(|&x| x as f32 / i16::MAX as f32).collect();
    write_input_data(&float_input, buffer, input_rate, max_samples);
}

#[tauri::command]
pub fn get_latest_audio(state: State<AudioState>) -> Result<String, String> {
    let guard = state.buffer.lock().map_err(|e| e.to_string())?;

    // Convert to Vec
    let samples: Vec<f32> = guard.iter().cloned().collect();

    // Save to temp file
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: SAMPLE_RATE,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };

    let temp_path = std::env::temp_dir().join("recording.wav");
    let mut writer = hound::WavWriter::create(&temp_path, spec).map_err(|e| e.to_string())?;

    for sample in samples {
        writer.write_sample(sample).map_err(|e| e.to_string())?;
    }

    writer.finalize().map_err(|e| e.to_string())?;

    Ok(temp_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn transcribe_audio(wav_path: String) -> Result<String, String> {
    let model_path = std::env::var("WHISPER_GGML_PATH")
        .map_err(|_| "WHISPER_GGML_PATH not set environment variable".to_string())?;

    // Execute whisper-cli
    // We assume it prints to stdout by default or we use -otxt?
    // Let's capture stdout.
    let output = std::process::Command::new("whisper-cli")
        .arg("-f")
        .arg(&wav_path)
        .arg("-m")
        .arg(&model_path)
        .arg("-nt") // No timestamps, usually common flag
        .output()
        .map_err(|e| format!("Failed to execute whisper-cli: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Whisper execution failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout)
}
