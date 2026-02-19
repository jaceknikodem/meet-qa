use whisper_rs::{FullParams, SamplingStrategy, WhisperContext};

pub fn run_transcription(
    ctx: &WhisperContext,
    samples: &[f32],
    threshold: f32,
    mode: &str,
    language: &str,
    threads: usize,
) -> Result<String, String> {
    let mut params = if mode == "accuracy" {
        FullParams::new(SamplingStrategy::BeamSearch {
            beam_size: 5,
            patience: 1.0,
        })
    } else {
        FullParams::new(SamplingStrategy::Greedy { best_of: 1 })
    };

    // Performance: Use configured threads
    params.set_n_threads(threads as i32);

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

    let mut final_text = result.trim().to_string();

    // Robustly strip the initial prompt if Whisper hallucinates it into the output
    let prompt_fragment = "The following is a high-quality";
    if final_text.starts_with(prompt_fragment) {
        if let Some(period_idx) = final_text.find("uh'.") {
            final_text = final_text[period_idx + 4..].trim().to_string();
        } else if let Some(period_idx) = final_text.find("uh.") {
            final_text = final_text[period_idx + 3..].trim().to_string();
        }
    }

    Ok(final_text)
}

pub fn preprocess_audio(samples: &mut [f32]) {
    if samples.is_empty() {
        return;
    }

    // 1. Remove DC Offset (Center the waveform)
    let mean: f32 = samples.iter().sum::<f32>() / samples.len() as f32;
    for s in samples.iter_mut() {
        *s -= mean;
    }

    // 2. Normalize (Scale strictly to -1.0..1.0 range based on Max Peak)
    let max_peak = samples
        .iter()
        .map(|s| s.abs())
        .fold(0.0f32, |a, b| a.max(b));

    if max_peak > 0.0 {
        let gain = 0.95 / max_peak; // Target 95% full scale to avoid clipping
        for s in samples.iter_mut() {
            *s *= gain;
        }
    }
}
