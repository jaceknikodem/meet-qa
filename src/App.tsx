import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { parseGeminiStreamChunk, extractStructuredData, StructuredResponse } from "./utils/gemini";
import { StealthView } from "./components/StealthView";
import { NormalView } from "./components/NormalView";
import { SettingsView, AppConfig } from "./components/SettingsView";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    cleaned_question: {
      type: "string",
      description: "The core question or claim extracted from the transcript, cleaned of filler words."
    },
    answer: {
      type: "string",
      description: "A concise, direct answer or verification."
    },
    confidence: {
      type: "number",
      description: "How confident you are that there is a meaningful question or claim worth answering (0.0 to 1.0)."
    }
  },
  required: ["cleaned_question", "answer", "confidence"]
};

// Polling interval for Normal Mode live transcript
const LIVE_TRANSCRIPT_INTERVAL_MS = 1000;

function App() {
  const [viewMode, setViewMode] = useState<"stealth" | "normal" | "settings">("normal");

  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState<StructuredResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isRecording, setIsRecording] = useState(true);

  // Use refs to access latest state in callbacks/effects without causing re-renders loops
  const configRef = useRef(config);
  configRef.current = config;

  // Load initial config
  useEffect(() => {
    invoke<AppConfig>("get_config").then(setConfig).catch(console.error);
  }, []);

  const handleClose = async () => {
    if (viewMode === 'settings') {
      setViewMode('stealth');
      return;
    }
    try {
      await invoke("hide_window");
    } catch (err) {
      console.error("Failed to hide window:", err);
    }
  };

  const handleToggleRecording = useCallback(async () => {
    const newState = !isRecording;
    await invoke("set_recording_state", { active: newState });
    setIsRecording(newState);
  }, [isRecording]);

  const runGeminiFlow = async () => {
    if (isLoading) return; // Prevent double trigger

    const startTime = performance.now();
    setIsLoading(true);
    setError("");
    setResponse(null);
    // Only clear transcript if empty or old? Nah, keep it visible or show "Listening..." equivalent
    // Ideally we append "Listening..." or just update status. 
    // For now we follow old behavior but less disruptive to existing text if possible.
    if (viewMode === "stealth") {
      setTranscript("Transcribing...");
    }

    try {
      console.log("Process triggered");
      // 1. Get Transcription
      const text = await invoke<string>("transcribe_latest");
      const transcriptionTime = performance.now();
      console.log(`[Latency] Transcription took: ${(transcriptionTime - startTime).toFixed(0)}ms`);
      console.log("Transcript:", text);
      setTranscript(text);

      if (!text || !text.trim()) {
        setResponse({ cleaned_question: "", answer: "No speech detected.", confidence: 0 });
        setIsLoading(false);
        return;
      }

      if (text.trim().length < 25) {
        setResponse({ cleaned_question: "", answer: "Transcript too short for meaningful analysis.", confidence: 0 });
        setIsLoading(false);
        return;
      }

      // 2. Gemini Streaming
      const activeConfig = configRef.current || await invoke<AppConfig>("get_config");
      if (!configRef.current) setConfig(activeConfig);

      setResponse(null);
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${activeConfig.model}:streamGenerateContent?alt=sse&key=${activeConfig.api_key}`;

      const prompt = `${activeConfig.prompt}\n\nTranscript:\n${text}`;

      const geminiResponse = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            response_mime_type: "application/json",
            response_schema: RESPONSE_SCHEMA,
          }
        })
      });

      if (!geminiResponse.ok) {
        const errData = await geminiResponse.json();
        throw new Error(errData.error?.message || "Gemini API error");
      }

      const reader = geminiResponse.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullRawResponse = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const textPart = parseGeminiStreamChunk(line);
          if (textPart) {
            fullRawResponse += textPart;
            const structured = extractStructuredData(fullRawResponse);
            setResponse(structured);
          }
        }
      }

      const endTime = performance.now();
      console.log(`[Latency] Full response took: ${(endTime - startTime).toFixed(0)}ms`);

      // Final UI and Log processing
      const finalStructured = extractStructuredData(fullRawResponse);
      let logText = "";
      const MIN_CONFIDENCE = 0.5;

      if (finalStructured.confidence < MIN_CONFIDENCE) {
        logText = `[REJECTED] Confidence ${finalStructured.confidence.toFixed(2)} < ${MIN_CONFIDENCE}\nQ: ${finalStructured.cleaned_question}\nA: ${finalStructured.answer}`;
      } else {
        logText = `Q: ${finalStructured.cleaned_question}\nA: ${finalStructured.answer}\nConfidence: ${finalStructured.confidence.toFixed(2)}`;
      }

      invoke("log_session", { transcript: text, answer: logText }).catch(console.error);

    } catch (err: any) {
      console.error(err);
      setError(err.toString());
      setResponse({ cleaned_question: "", answer: "Error occurred.", confidence: 0 });
    } finally {
      setIsLoading(false);
    }
  };

  // Event Listener for Hotkey / Background Triggers
  useEffect(() => {
    const unlistenPromise = listen("trigger-process", async () => {
      // If we found a question, user likely wants to see the Stealth view if hidden,
      // OR just run the flow if already visible.
      // Backend handles showing the window.
      await runGeminiFlow();
    });

    return () => {
      unlistenPromise.then(f => f());
    };
  }, []); // Empty dep array, uses ref for config

  // Live Transcript Polling for Normal Mode
  useEffect(() => {
    let interval: number;

    if (viewMode === "normal" && isRecording && !isLoading) {
      interval = setInterval(async () => {
        try {
          // Just get transcript, don't trigger AI
          // But only if we aren't currently waiting for AI result (handled by !isLoading check)
          const text = await invoke<string>("transcribe_latest");
          if (text && text.length > 5 && text !== transcript) {
            setTranscript(text);
          }
        } catch (e) {
          console.error("Polling error", e);
        }
      }, 3000) as unknown as number;
    }

    return () => clearInterval(interval);
  }, [viewMode, isRecording, isLoading, transcript]);

  // Render Logic
  if (viewMode === "settings") {
    if (!config) return <div className="text-white">Loading config...</div>;
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-2xl h-[85vh]">
          <SettingsView
            config={config}
            onSave={(newConfig) => {
              setConfig(newConfig);
              // Optionally go back to previous view?
            }}
            onClose={() => setViewMode("normal")}
          />
        </div>
      </div>
    );
  }

  if (viewMode === "normal") {
    return (
      <NormalView
        config={config}
        transcript={transcript}
        response={response}
        isLoading={isLoading}
        isRecording={isRecording}
        onToggleRecording={handleToggleRecording}
        onTriggerAI={runGeminiFlow}
        onOpenSettings={() => setViewMode("settings")}
        onSwitchToStealth={() => setViewMode("stealth")}
      />
    );
  }

  return (
    <StealthView
      config={config}
      transcript={transcript}
      response={response}
      isLoading={isLoading}
      error={error}
      onClose={handleClose}
      onOpenSettings={() => setViewMode("settings")}
      onSwitchToNormal={() => setViewMode("normal")}
    />
  );
}

export default App;
