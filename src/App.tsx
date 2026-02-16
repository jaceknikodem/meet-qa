import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface AppConfig {
  api_key: string;
  model: string;
  global_hotkey: string;
  prompt: string;
}

function App() {
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    // Fetch initial config
    invoke<AppConfig>("get_config").then(setConfig).catch(console.error);

    // Listen for trigger
    const unlistenPromise = listen("trigger-process", async () => {
      const startTime = performance.now();
      setIsLoading(true);
      setError("");
      setTranscript("Listening...");
      setResponse("");

      try {
        console.log("Process triggered");
        // 1. Get Transcription (Single IPC jump)
        setTranscript("Transcribing...");
        const text = await invoke<string>("transcribe_latest");
        const transcriptionTime = performance.now();
        console.log(`[Latency] Transcription took: ${(transcriptionTime - startTime).toFixed(0)}ms`);
        console.log("Transcript:", text);
        setTranscript(text);

        if (!text || !text.trim()) {
          setResponse("No speech detected.");
          setIsLoading(false);
          return;
        }

        if (text.trim().length < 25) {
          setResponse("Transcript too short for meaningful analysis.");
          setIsLoading(false);
          return;
        }

        // 2. Gemini Streaming
        const activeConfig = config || await invoke<AppConfig>("get_config");
        if (!config) setConfig(activeConfig);

        setResponse("");
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${activeConfig.model}:streamGenerateContent?alt=sse&key=${activeConfig.api_key}`;

        const prompt = `${activeConfig.prompt}\n\nTranscript:\n${text}`;

        const response = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error?.message || "Gemini API error");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let fullAnswer = "";
        let buffer = "";
        let hasReceivedFirstChunk = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (!hasReceivedFirstChunk) {
            hasReceivedFirstChunk = true;
            const firstChunkTime = performance.now();
            console.log(`[Latency] Time to first Gemini chunk: ${(firstChunkTime - transcriptionTime).toFixed(0)}ms (Total: ${(firstChunkTime - startTime).toFixed(0)}ms)`);
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last (potentially incomplete) line in the buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || !trimmedLine.startsWith("data: ")) continue;

            try {
              const json = JSON.parse(trimmedLine.substring(6));
              const textPart = json.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textPart) {
                fullAnswer += textPart;
                setResponse(fullAnswer);
              }
            } catch (e) {
              // Not a full JSON or heartbeat
            }
          }
        }

        const endTime = performance.now();
        console.log(`[Latency] Full response took: ${(endTime - startTime).toFixed(0)}ms`);

        // 3. Log to file (in background)
        invoke("log_session", { transcript: text, answer: fullAnswer }).catch(console.error);

      } catch (err: any) {
        console.error(err);
        setError(err.toString());
        setResponse("Error occurred.");
      } finally {
        setIsLoading(false);
      }
    });

    return () => {
      unlistenPromise.then(f => f());
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      {/* Main HUD Container */}
      <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 w-full max-w-2xl shadow-2xl transition-all duration-300">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div className="text-xs font-bold text-white/50 uppercase tracking-widest">
            STEALTH SIDEKICK
          </div>
          {isLoading && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-blue-400 font-bold">ACTIVE</span>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="space-y-4">
          {/* Transcript */}
          {transcript && (
            <div className="p-3 bg-white/5 rounded-lg border border-white/5">
              <div className="text-xs text-white/40 mb-1 uppercase tracking-wider">Transcript</div>
              <p className="text-sm text-gray-300 italic leading-relaxed max-h-32 overflow-y-auto">
                "{transcript}"
              </p>
            </div>
          )}

          {/* Response */}
          <div className="p-1">
            {!response && !isLoading && !transcript && (
              <div className="text-center text-gray-500 py-8 text-sm">
                Press <kbd className="bg-white/10 px-2 py-1 rounded text-white font-mono">{config?.global_hotkey || "Cmd+Shift+K"}</kbd> to activate
              </div>
            )}

            {(response || isLoading) && (
              <p className={`text-lg font-medium leading-relaxed ${response ? 'text-white' : 'text-gray-400'}`}>
                {response || "Processing..."}
              </p>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span className="text-red-200 text-xs font-mono break-all">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
