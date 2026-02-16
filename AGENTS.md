# AGENTS.md - Meet-QA Development Guide

You are assisting in building **Meet-QA**, a "Stealth Sidekick" macOS application. This app provides real-time AI assistance by listening to meeting audio in a rolling 45-second window without permanent recording.

## 🛠 Tech Stack Snapshot
- **Core:** Tauri v2 (Rust + TypeScript)
- **Audio:** `cpal` (Rust) capturing from **BlackHole 2ch**
- **Transcription:** `whisper.cpp` (Sidecar binary)
- **LLM:** Gemini 1.5 Flash (Google Generative AI SDK)
- **UI:** React + Tailwind CSS (Frameless, translucent HUD)

---

## 🧭 Agent Guidelines

### 1. Privacy & "Stealth" First
- **Zero Disk Policy:** Audio buffers MUST stay in RAM. Do not implement features that save raw audio to disk unless explicitly asked for debugging.
- **HUD Behavior:** The UI should remain invisible (`opacity-0`) or hidden until triggered by the global hotkey (`Cmd + Shift + K`).
- **Screen Capture:** Always use macOS-specific flags in Tauri/Rust to exclude the HUD window from screen sharing if possible.

### 2. Rust Backend (src-tauri)
- **Audio Thread:** Maintain the high-priority `cpal` stream in a dedicated thread or managed state.
- **Tauri Commands:** Use descriptive names for commands (e.g., `get_latest_snippet`, `update_settings`).
- **Error Handling:** Use `Result<T, String>` for commands to ensure error messages propagate to the frontend.

### 3. Frontend (React)
- **HUD Design:** Use `backdrop-filter: blur(10px)` and high-transparency backgrounds.
- **Streaming:** Prioritize streaming LLM responses to the UI for <1.5s "Time to First Word".
- **Tailwind:** Keep components modular. Use transition classes for "fade-in/out" effects.

### 4. Transcription (whisper.cpp)
- Assume `whisper-cli` is installed on the host system and available in the PATH.
- Rust will call this as a subprocess/command, piping audio data to it.
- Use the `base` model for an optimal balance of speed and accuracy.

---

## 🚀 Common Workflows

### Setup & Development
```bash
# Install dependencies
npm install

# Ensure whisper-cli is in your path
which whisper-cli

# Start development (monitors Rust and TS changes)
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
