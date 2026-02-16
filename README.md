# 🎙️ Stealth Sidekick

A lightweight, non-intrusive macOS utility designed to provide real-time AI assistance during live meetings without the need for full-session recording or note-taking.

---

## ⚡ Core Concept: "The Glass HUD"

Stealth Sidekick works as a silent listener. It maintains a **45-second rolling buffer** of your system audio in RAM. When you're stuck, confused, or just need a quick fact-check, one global hotkey triggers an ultra-fast AI response via a translucent HUD.

### Key Logic:
1.  **Always Listening**: Starts capturing system audio immediately on launch (Mono 16kHz). Audio is stored in a circular buffer in memory—it is never saved permanently to disk and is purged every 45 seconds.
2.  **Pre-emptive Transcription**: To ensure sub-second response times, the app transcribes the audio buffer in the background every 5 seconds.
3.  **On-Demand Intelligence**: LLM reasoning and streaming happen when triggered via hotkey.
4.  **Screen-Share Stealth**: The UI is hidden from screen capture and stays "Always on Top" for your eyes only.
5.  **Draggable HUD**: The interface can be moved anywhere on your screen by dragging the HUD box.

---

## 🛠 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | Tauri v2 (Rust + React + Tailwind) |
| **Audio Capture** | `cpal` (Rust) tapping into BlackHole 2ch |
| **Transcription** | `whisper-rs` (Native Rust bindings to `whisper.cpp`) |
| **Intelligence** | Gemini 1.5 Flash |

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
just dev
```

In development (`just dev`), the app uses the local `.env` and `prompt.txt` in the project root.

---

## 🏗 Production Build & Release

### Compiling for Mac
To create a downloadable `.dmg` installer:

```bash
just build
```

This generates a production-ready installer at:  
`src-tauri/target/release/bundle/dmg/Stealth Sidekick_0.1.0_aarch64.dmg`

### Manual Release on GitHub
1.  Open your repository on GitHub.
2.  Go to **Releases** -> **Draft a new release**.
3.  Upload the `.dmg` from the path above as a binary asset.

---

## ⚙️ Configuration (User Settings)

In the production app, configuration is managed in the standard macOS Application Support folder to keep it separate from the app binary.

### Opening Settings
Hover over the HUD and click the **📁 Folder Icon**. This opens:  
`~/Library/Application Support/Stealth Sidekick/`

### Customizable Files
1.  **.env**: Add your credentials:
    -   `GEMINI_API_KEY`: Your key from [AI Studio](https://aistudio.google.com/).
    -   `WHISPER_GGML_PATH`: Path to your Whisper `.bin` model.
    -   `GLOBAL_HOTKEY`: Default is `Command+Shift+K`.
2.  **prompt.txt**: Edit this to change how the AI Sidekick responds.
3.  **logs/**: Every transcript/response pair is saved here automatically as a Markdown file.

---

## ⌨️ Usage

-   **`Cmd + Shift + K`**: Toggle the HUD visibility.
-   **🔴 Power Button**: Closes the application completely (useful for updating config).
-   **📁 Folder Button**: Opens the configuration directory in Finder.
-   **Handle**: Use the HUD body to drag the window around.

---

## 🛡 Privacy

-   **Zero Logs (Audio)**: Audio is kept in a volatile RAM buffer and purged every 45 seconds.
-   **Local First**: Transcription happens natively on your machine using Whisper. Only the resulting text snippet is sent to the Gemini API for analysis.
