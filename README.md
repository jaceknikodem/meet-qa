# 🎙️ Stealth Sidekick

A lightweight, non-intrusive macOS utility designed to provide real-time AI assistance during live meetings without the need for full-session recording or note-taking.

---

## ⚡ Core Concept: "The Glass HUD"

Stealth Sidekick works as a silent listener. It maintains a **45-second rolling buffer** of your system audio in RAM. When you're stuck, confused, or just need a quick fact-check, one global hotkey triggers an ultra-fast AI response via a translucent HUD.

### Key Logic:
1.  **Always Listening**: Starts capturing system audio immediately on launch (Mono 16kHz). Audio is stored in a circular buffer in memory—it is never saved permanently to disk and is purged every 45 seconds.
2.  **Pre-emptive Transcription**: To ensure sub-second response times, the app transcribes the audio buffer in the background every 5 seconds.
3.  **On-Demand Intelligence**: LLM reasoning and streaming *only* happen when triggered.
4.  **Screen-Share Stealth**: The UI is configured to be hidden from screen capture and stays "Always on Top" for your eyes only.

---

## 🛠 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | Tauri v2 (Rust + React + Tailwind) |
| **Audio Capture** | `cpal` (Rust) tapping into BlackHole 2ch |
| **Transcription** | `whisper-rs` (Native Rust bindings to `whisper.cpp`) |
| **Intelligence** | Google Gemini 1.5 Flash (**Streaming SSE**) |

---

## 🚀 Getting Started

### Prerequisites

1.  **Audio Routing**: Install [BlackHole 2ch](https://github.com/ExistentialAudio/BlackHole) and set it as your system output (or use a Multi-Output Device) so the app can "hear" the meeting.
2.  **Build Tools**: Ensure `cmake` is installed (required to compile the native Whisper bindings).
3.  **Rust**: Ensure `cargo` is installed and in your `$PATH`.

### Configuration

Create a `.env` file in the root directory:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-flash
WHISPER_GGML_PATH=/path/to/your/ggml-small-q5_1.bin
BUFFER_DURATION_SECS=45
GLOBAL_HOTKEY=Command+Shift+K
```

### Installation & Run

```bash
# Install frontend dependencies
npm install

# Run in development mode
npm run tauri dev
```

---

## ⌨️ Global Hotkey

-   **`Cmd + Shift + K`**:
    -   **Toggle Visibility**: Shows/Hides the transparent HUD.
    -   **Trigger Process**: When shown, it immediately pulls the latest transcription (often hitting a pre-emptive cache) and streams an AI suggestion in real-time.

---

## 🛡 Privacy

-   **Zero Logs (Audio)**: Audio is kept in a volatile RAM buffer. Once purged, it is gone forever.
-   **Local First**: Transcription happens natively on your machine using Whisper. Only the resulting text snippet is sent to the Gemini API for analysis.

---

## 📂 Session Logging

The app automatically saves every exchange (Transcript + AI Response) to timestamped Markdown files in the `logs/` directory. Files are named by date (e.g., `logs/2026-02-16_15-34.md`), providing a persistent searchable history of your meetings.
