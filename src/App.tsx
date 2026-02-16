import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface GeminiConfig {
  api_key: string;
  model: string;
}

function App() {
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [_, setConfig] = useState<GeminiConfig | null>(null);

  useEffect(() => {
    // Listen for trigger
    const unlistenPromise = listen("trigger-process", async () => {
      setIsLoading(true);
      setError("");
      setTranscript("Listening...");
      setResponse("");

      try {
        console.log("Process triggered");
        // 1. Get Audio
        const wavPath = await invoke<string>("get_latest_audio");
        console.log("Audio captured at:", wavPath);

        // 2. Transcribe
        setTranscript("Transcribing...");
        const text = await invoke<string>("transcribe_audio", { wavPath });
        console.log("Transcript:", text);
        setTranscript(text);

        if (!text || !text.trim()) {
          setResponse("No speech detected.");
          setIsLoading(false);
          return;
        }

        // 3. Gemini
        const currentConfig = await invoke<GeminiConfig>("get_gemini_config");
        setConfig(currentConfig);

        // Call Gemini API via fetch (REST)
        setResponse("Thinking...");
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${currentConfig.model}:generateContent?key=${currentConfig.api_key}`;

        const prompt = `You are a live meeting sidekick. Use the provided transcript to answer the most recent question or comment on the most recent claim. Make the answer 2-3 sentences long.\n\nTranscript:\n${text}`;

        const apiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });

        const data = await apiRes.json();

        if (data.error) {
          throw new Error(data.error.message);
        }

        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
        setResponse(answer);

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
                Press <kbd className="bg-white/10 px-2 py-1 rounded text-white font-mono">Cmd+Shift+K</kbd> to activate
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
