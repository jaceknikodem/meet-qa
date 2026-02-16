This product specification outlines a lightweight, stealthy macOS application designed to provide real-time AI assistance during live meetings.

---

## 1. Product Vision: "Stealth Sidekick"

A non-intrusive macOS utility that "listens" to system audio in a rolling 45-second window. Upon a global hotkey trigger, it transcribes the latest snippet and provides a concise, fact-checked answer or response suggestion via a translucent overlay.

**Core Value:** Be clever in the moment without needing to record or re-watch entire meetings.

---

## 2. Technical Stack

| Layer | Technology | Role |
| --- | --- | --- |
| **Framework** | **Tauri v2 (Rust + TS)** | Native performance, small footprint, macOS window control. |
| **Audio** | **BlackHole 2ch + Rust (cpal)** | Captures system audio; Rust handles 16kHz resampling. |
| **Transcription** | **whisper.cpp (Installed CLI)** | System-installed `whisper-cli` used as a subprocess. |
| **Intelligence** | **Gemini 1.5 Flash (SDK)** | Low-latency LLM for reasoning. |
| **Frontend** | **React / Tailwind** | Movable, focus-capturing HUD with session persistence. |

---

## 3. System Architecture & Data Flow

1. **Audio Capture (Rust):** A background thread monitors the **BlackHole 2ch** virtual device. It maintains a 45-second circular buffer in RAM and resamples/downscales to 16kHz on the fly.
2. **Trigger (Global Hotkey):** User presses `Cmd + Shift + K`.
3. **Transcription (Local):** Rust pipes the buffer to the system-installed `whisper-cli`. Transcription completes in **<500ms**.
4. **Inference (TypeScript):** The full transcript text is sent to the Gemini API.
5. **Display (UI):** A focus-capturing, translucent window fades in. It is draggable and remembers its position. Explicit 'X' to close.

---

## 4. Key Features & Requirements

### A. The "Rolling Buffer"

* **Capacity:** 45 seconds (configurable).
* **Storage:** 16kHz Mono (optimized for Whisper).
* **Privacy:** Buffer is purged every 45 seconds; no long-term audio logs are kept.

### B. Stealth UI

* **Floating Level:** Set to `NSWindow.Level.floating` to stay above Zoom.
* **Focus & Drag:** The window captures focus (allowing interaction/scrolling) and is draggable. It persists its window position between sessions.
* **Dismissal:** Features an explicit 'X' button for closure.
* **Screen-Share Stealth:** Use native macOS flags to hide the window from screen capture.
* **UX:** The window is invisible/0% opacity until the hotkey is pressed.

### C. LLM Prompting Strategy

The system prompt is optimized for "meeting survival":

> "You are a live meeting sidekick. Use the provided transcript to answer the most recent question or comment on the most recent claim. Make the answer 2-3 sentences long.

---

## 5. Implementation Roadmap (Vibe-Coding Guide)

### Phase 1: The "Ear" (Rust Backend)

* Install `cpal` crate in Rust.
* Implement a `RingBuffer` struct to store `f32` audio samples.
* Expose a Tauri Command `get_latest_snippet()` to return the buffer as a `Wav` encoded byte array.

### Phase 2: The "Voice" (Whisper Sidecar)

* Bundle `whisper.cpp` as a Tauri **Sidecar** binary.
* Write a TypeScript wrapper to call the sidecar and return a string.

### Phase 3: The "Brain" (Gemini Integration)

* Set up the `@google/generativeai` SDK.
* Implement **Streaming Responses** so the first word appears instantly.

### Phase 4: The "Ghost" (HUD UI)

* Configure `tauri.conf.json` for a frameless, transparent window.
* Use CSS `backdrop-filter: blur(10px)` for a native macOS feel.

---

## 6. Performance Targets

* **Hotkey to First Word:** < 1.5 seconds.
* **RAM Usage:** < 100 MB.
* **CPU Impact:** < 5% during idle buffering.
