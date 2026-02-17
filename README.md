# 🎙️ Kuroko

A lightweight, non-intrusive macOS utility designed to provide real-time AI assistance during live meetings without the need for full-session recording or note-taking.

---

## ⚡ Core Concept: "The Glass HUD"

Kuroko works as a silent listener. It maintains a **rolling buffer** of your system audio in RAM. When you're stuck, confused, or just need a quick fact-check, one global hotkey triggers an ultra-fast AI response via a translucent HUD.

### Key Logic:
1.  **Always Listening**: Starts capturing system audio immediately on launch (Mono 16kHz) via `cpal`. Audio is kept in RAM and purged every 45 seconds.
2.  **Pre-emptive Transcription**: To ensure sub-second response times, the app transcribes the audio buffer in the background every 5 seconds using `whisper-rs`.
3.  **Controlled Intelligence**: Uses Gemini 2.5 Flash with **Controlled Generation (Strict JSON)**. The AI is forced to return a structured confidence score alongside its answer.
4.  **Confidence Filtering**: Responses with a confidence score below **0.5** are automatically rejected ("Nothing interesting here") to prevent AI hallucinations from conversational noise.
5.  **Screen-Share Stealth**: The UI is hidden from screen capture using native macOS APIs.

---

## 🛠 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | Tauri v2 (Rust + React + Tailwind) |
| **Audio Capture** | `cpal` (Rust) tapping into BlackHole 2ch |
| **Transcription** | `whisper-rs` (Native Rust bindings to `whisper.cpp`) |
| **Intelligence** | Gemini 2.5 Flash (via Structured JSON Schema) |

---

## 🚀 Development

### Prerequisites

1.  **Audio Routing**: Install [BlackHole 2ch](https://github.com/ExistentialAudio/BlackHole) and set it as your system output.
2.  **Build Tools**: Install `cmake` (`brew install cmake`).
3.  **Rust**: Ensure `cargo` is installed.

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

In development (`npm run dev`), the app uses the local `.env` and `prompt.txt` in the project root.

---

## 🏗 Production Build & Release

### Compiling for Mac
To create a downloadable `.dmg` installer:

```bash
npm run tauri build
```

The installer will be generated at:  
`src-tauri/target/release/bundle/dmg/Kuroko_X.X.X_aarch64.dmg`

### Manual Release on GitHub
1.  Open your repository on GitHub.
2.  Go to **Releases** -> **Draft a new release**.
3.  Upload the `.dmg` from the path above as a binary asset.

---

## ⚙️ Configuration & Storage

Kuroko stores its settings and logs in a dedicated data directory. The location depends on whether you are running in Development or Production mode.

| Mode | Location |
| :--- | :--- |
| **Development** (`npm run dev`) | The project root folder. |
| **Production** (Installed App) | `~/Library/Application Support/com.kuroko.app/` |

### Settings Management
You can manage settings directly in the app via the **Settings View** (accessible from either Normal or Stealth mode).

1.  **`.env`**: Stores core configuration:
    -   `GEMINI_API_KEY`: API key from [Google AI Studio](https://aistudio.google.com/).
    -   `GEMINI_MODEL`: Choose between `gemini-2.5-flash-lite`, `gemini-2.5-flash`, etc.
    -   `WHISPER_GGML_PATH`: Absolute path to a Whisper GGML model `.bin` file.
    -   `GLOBAL_HOTKEY`: The shortcut to trigger analysis (e.g., `Command+Shift+K`).
    -   `BUFFER_DURATION_SECS`: How many seconds of audio to keep in memory (default: 45).
    -   `OLLAMA_MODEL`: (Optional) Ollama model name for automatic agenda detection.
    -   `OLLAMA_MIN_CHARS`: (Optional) Min text length before auto-triggering agenda check.
2.  **`prompt.txt`**: The system instructions provided to Gemini.
3.  **`logs/`**: A folder containing timestamped Markdown files of every meeting session.

---

## ⌨️ Modes & Usage

### 🪟 Normal Mode (Default)
A standard window interface for regular meeting backup. 
-   **Live Transcript**: Shows a scrolling preview of the meeting in real-time.
-   **Manual Controls**: Buttons to Start/Stop listening or manually "Ask".
-   **Settings Access**: Easy access to the internal config editor.

### 👻 Stealth Mode
A transparent, non-intrusive HUD designed to overlay existing windows.
-   **Draggable**: Grab the HUD to reposition it anywhere on your screen.
-   **Hidden from Screen Capture**: Native macOS APIs ensure this window is invisible to Zoom/Meet participants when you share your screen.

### Controls
-   **`Cmd + Shift + K`**: Global hotkey to trigger a process / toggle visibility.
-   **🔴 Quit Button**: Fully exits the application.
-   **Folder Icon**: Opens the configuration directory in Finder.
-   **Mode Toggle**: Seamlessly switch between Normal and Stealth views.

---

## 🛡 Privacy

-   **Zero Audio Logs**: Audio is kept strictly in RAM and purged every few seconds. No audio files are ever written to disk.
-   **Local Transcription**: Speech-to-text happens entirely on your local machine via Whisper.
-   **Minimal Data Out**: Only the transcribed text of the recent 45s buffer is sent to the Gemini API for analysis.
-   **Structured Outputs**: Uses Controlled Generation to ensure the AI only answers specific questions or verifies claims, preventing general conversational monitoring.
