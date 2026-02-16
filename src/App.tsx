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

type AIMode = "validate" | "answer" | "followup";

const PROMPTS: Record<AIMode, string> = {
  validate: "Your task: Identify the most recent significant claim in the transcript and validate it for accuracy and logical consistency. If it is a fact, check it. If it is an opinion, note that.",
  answer: "Your task: Identify the most recent question in the transcript and answer it directly and concisely.",
  followup: "Your task: Generate a single, insightful follow-up question based on the transcript context."
};

// Polling interval for Normal Mode live transcript
const LIVE_TRANSCRIPT_INTERVAL_MS = 1000;

function App() {
  const [viewMode, setViewMode] = useState<"stealth" | "normal" | "settings">("normal");

  const [transcript, setTranscript] = useState("");
  const [meetingContext, setMeetingContext] = useState("");
  const [response, setResponse] = useState<StructuredResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<AppConfig | null>(null);

  const [isRecording, setIsRecording] = useState(true);
  const [lastMode, setLastMode] = useState<AIMode>("answer");
  const [defaultMode, setDefaultMode] = useState<AIMode>(() => {
    return (localStorage.getItem("default_mode") as AIMode) || "answer";
  });

  // Use refs to access latest state in callbacks/effects without causing re-renders loops
  const configRef = useRef(config);
  configRef.current = config;

  const defaultModeRef = useRef(defaultMode);
  defaultModeRef.current = defaultMode;

  const isRecordingRef = useRef(isRecording);
  isRecordingRef.current = isRecording;

  // Load initial config
  useEffect(() => {
    invoke<AppConfig>("get_config").then(setConfig).catch(console.error);
  }, []);

  const handleDefaultModeChange = (mode: AIMode) => {
    setDefaultMode(mode);
    localStorage.setItem("default_mode", mode);
  };

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

  const runGeminiFlow = async (mode: AIMode = "answer") => {
    if (isLoading) return; // Prevent double trigger
    setLastMode(mode);

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

      const promptInstruction = PROMPTS[mode];
      const basePrompt = activeConfig.prompt || "";

      const prompt = meetingContext.trim()
        ? `${basePrompt}\n\n${promptInstruction}\n\nMeeting Context:\n${meetingContext}\n\nTranscript:\n${text}`
        : `${basePrompt}\n\n${promptInstruction}\n\nTranscript:\n${text}`;

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
      const minConfidence = activeConfig.min_confidence ?? 0.5;

      if (finalStructured.confidence < minConfidence) {
        logText = `[REJECTED] Confidence ${finalStructured.confidence.toFixed(2)} < ${minConfidence}\nQ: ${finalStructured.cleaned_question}\nA: ${finalStructured.answer}`;
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
      // Don't trigger if recording is paused
      if (!isRecordingRef.current) {
        console.log("Ignored hotkey: Recording is paused");
        return;
      }

      // If we found a question, user likely wants to see the Stealth view if hidden,
      // OR just run the flow if already visible.
      // Backend handles showing the window.
      await runGeminiFlow(defaultModeRef.current);
    });

    return () => {
      unlistenPromise.then(f => f());
    };
  }, []); // Empty dep array, uses ref for config

  // Render Logic
  if (viewMode === "settings") {
    if (!config) return <div className="text-white">Loading config...</div>;
    return (
      <SettingsView
        config={config}
        defaultMode={defaultMode}
        onDefaultModeChange={handleDefaultModeChange}
        onSave={(newConfig) => {
          setConfig(newConfig);
        }}
        onClose={() => setViewMode("normal")}
      />
    );
  }

  if (viewMode === "normal") {
    return (
      <NormalView
        config={config}
        transcript={transcript}
        meetingContext={meetingContext}
        onMeetingContextChange={setMeetingContext}
        response={response}
        isLoading={isLoading}
        isRecording={isRecording}
        onToggleRecording={handleToggleRecording}
        onTriggerAI={(mode) => runGeminiFlow(mode)}
        lastMode={lastMode}
        onOpenSettings={() => setViewMode("settings")}
        onSwitchToStealth={() => setViewMode("stealth")}
      />
    );
  }

  return (
    <StealthView
      config={config}
      transcript={transcript}
      meetingContext={meetingContext}
      response={response}
      isLoading={isLoading}
      isRecording={isRecording}
      error={error}
      onClose={handleClose}
      onTriggerAI={(mode) => runGeminiFlow(mode)}
      lastMode={lastMode}
      onOpenSettings={() => setViewMode("settings")}
      onSwitchToNormal={() => setViewMode("normal")}
    />
  );
}

export default App;
