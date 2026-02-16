# AGENTS.md - Meet-QA Development Guide

You are assisting in building **Meet-QA**, a "Stealth Sidekick" macOS application. This app provides real-time AI assistance by listening to meeting audio in a rolling window without permanent recording.

## 🛠 Tech Stack Snapshot
- **Core:** Tauri v2 (Rust + TypeScript)
- **Audio:** `cpal` (Rust) capturing from **BlackHole 2ch**
- **Transcription:** `whisper-rs` (Native Rust bindings)
- **LLM:** Gemini 2.5 Flash (SSE Streaming)
- **UI:** React + Tailwind CSS (Frameless, translucent HUD)

---

## 🧭 Agent Guidelines

### 1. Privacy & "Stealth" First
- **Zero Disk Policy:** Audio buffers MUST stay in RAM. Do not implement features that save raw audio to disk unless explicitly asked for debugging.
- **HUD Behavior:** The UI should remain invisible (`opacity-0`) or hidden until triggered by the global hotkey (`Cmd + Shift + K`).
- **Screen Capture:** Always use macOS-specific flags in Tauri/Rust to exclude the HUD window from screen sharing.

### 2. Rust Backend (src-tauri)
- **Audio Thread:** Maintain the high-priority `cpal` stream in a dedicated state.
- **Transcription Management:** Manage `WhisperContext` and background threads for pre-emptive transcription in `src-tauri/src/audio.rs`.
- **Error Handling:** Use `Result<T, String>` for commands to ensure errors propagate to the React layer.

### 3. Frontend (React)
- **HUD Design:** Use `backdrop-filter: blur(10px)` and high-transparency backgrounds.
- **SSE Streaming:** Handle Server-Sent Events from Gemini to ensure <500ms perceived latency.
- **Latency Benchmarking:** Use `performance.now()` in `App.tsx` to log performance metrics.

### 4. Transcription (whisper-rs)
- Use native Rust bindings for `whisper.cpp`. The model is loaded into memory at startup.
- **Pre-emptive Cache:** A background thread wakes up every 5s to transcribe the rolling buffer, ensuring a "hot cache" for instant trigger response.

---

## 🚀 Common Workflows

### Setup & Development
```bash
# Install Homebrew dependencies (CMake is required for whisper-rs)
brew install cmake

# Install dependencies
npm install

# Start development
npm run tauri dev
```

### Adding New Features
1. **New Audio Logic:** Check `src-tauri/src/audio_manager.rs`.
2. **New LLM Prompt:** Update the system prompt in `src/hooks/useGemini.ts` (or similar).
3. **New HUD Element:** Add to `src/components/Overlay.tsx`.

---

## 📝 Coding Standards
- **Naming:** PascalCase for React components, snake_case for Rust functions, camelCase for TS variables.
- **Documentation:** Brief JSDoc for complex TS logic; doc comments (`///`) for Rust modules.
- **Safety:** Leverage Rust's ownership model for the audio ring buffer to prevent race conditions.
