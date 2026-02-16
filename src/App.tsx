import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { parseGeminiStreamChunk, extractStructuredData, StructuredResponse } from "./utils/gemini";

const MIN_CONFIDENCE = 0.5;

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

interface AppConfig {
  api_key: string;
  model: string;
  global_hotkey: string;
  prompt: string;
  error?: string;
}

function App() {
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState<StructuredResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<AppConfig | null>(null);

  const handleClose = async () => {
    try {
      await invoke("hide_window");
    } catch (err) {
      console.error("Failed to hide window:", err);
    }
  };

  useEffect(() => {
    // Fetch initial config
    invoke<AppConfig>("get_config").then(setConfig).catch(console.error);

    // Listen for trigger
    const unlistenPromise = listen("trigger-process", async () => {
      const startTime = performance.now();
      setIsLoading(true);
      setError("");
      setTranscript("Listening...");
      setResponse(null);

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
        const activeConfig = config || await invoke<AppConfig>("get_config");
        if (!config) setConfig(activeConfig);

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
    });

    return () => {
      unlistenPromise.then(f => f());
    };
  }, [config, response]);

  return (
    <div
      data-tauri-drag-region
      className="w-screen h-screen flex flex-col items-center justify-center p-4 cursor-grab active:cursor-grabbing bg-black/[0.001]"
    >
      {/* Main HUD Container - Draggable */}
      <div
        data-tauri-drag-region
        className="bg-black/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 w-full max-w-2xl shadow-2xl transition-all duration-300 relative group pointer-events-auto"
      >
        {/* Controls */}
        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
          <button
            onClick={() => invoke("open_config_dir").catch(console.error)}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white transition-all"
            aria-label="Open Config Folder"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          </button>
          <button
            onClick={handleClose}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white transition-all"
            aria-label="Hide"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          <button
            onClick={() => invoke("quit_app")}
            className="p-2 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 transition-all"
            aria-label="Quit"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
          </button>
        </div>

        {/* Header */}
        <div className="flex justify-between items-center mb-4 pr-8">
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
          {config?.error && (
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-3 font-mono text-xs">
              <div className="text-blue-400 font-bold uppercase tracking-wider">Setup Required</div>
              <p className="text-gray-300">Check .env in {config.error}</p>
            </div>
          )}

          {/* Transcript Snippet */}
          {transcript && !config?.error && (
            <div className="p-2 bg-white/5 rounded border border-white/5">
              <p className="text-[10px] text-gray-400 italic truncate italic">"{transcript}"</p>
            </div>
          )}

          {/* Structured Response with Confidence Logic */}
          {!config?.error && (
            <div className="p-1">
              {!response && !isLoading && !transcript && (
                <div className="text-center text-gray-500 py-8 text-sm">
                  Press <kbd className="bg-white/10 px-2 py-1 rounded text-white font-mono">{config?.global_hotkey || "Cmd+Shift+K"}</kbd>
                </div>
              )}

              {(response || isLoading) && (
                <div className="space-y-3">
                  {response && response.confidence < MIN_CONFIDENCE ? (
                    <div className="py-4 text-center space-y-2">
                      <p className="text-gray-500 font-medium">Acked, but no triggers found</p>
                      <p className="text-[10px] text-gray-600 font-mono">
                        Confidence: {response.confidence.toFixed(2)} / Threshold: {MIN_CONFIDENCE}
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className={`text-lg font-medium leading-relaxed ${response?.answer ? 'text-white' : 'text-gray-400'}`}>
                        {response?.answer || "Processing..."}
                      </p>
                      {response?.confidence ? (
                        <div className="flex justify-end pt-1">
                          <span className="text-[9px] text-white/20 font-mono uppercase tracking-widest">
                            Match: {(response.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-2 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-300 font-mono break-all">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
