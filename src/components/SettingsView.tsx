import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface AppConfig {
  api_key: string;
  model: string;
  global_hotkey: string;
  prompt: string;
  buffer_duration_secs: number;
  whisper_ggml_path: string;
  ollama_model?: string;
  ollama_min_chars: number;
  min_confidence: number;
  transcription_mode: "speed" | "accuracy";
  whisper_language: string;
  error?: string;
}

interface SettingsViewProps {
  config: AppConfig;
  defaultMode: "validate" | "answer" | "followup";
  onDefaultModeChange: (mode: "validate" | "answer" | "followup") => void;
  onSave: (newConfig: AppConfig) => void;
  onClose: () => void;
}

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

export function SettingsView({ config, defaultMode, onDefaultModeChange, onSave, onClose }: SettingsViewProps) {
  const [formData, setFormData] = useState<AppConfig>(config);
  const debouncedFormData = useDebounce(formData, 1000);

  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedConfig, setLastSavedConfig] = useState<AppConfig>(config);

  // Validation States
  const [geminiValidation, setGeminiValidation] = useState<"idle" | "validating" | "valid" | "invalid">("idle");
  const [pathValidation, setPathValidation] = useState<"idle" | "valid" | "invalid">("idle");
  const [hotkeyValidation, setHotkeyValidation] = useState<"idle" | "valid" | "invalid">("idle");

  const [ollamaStatus, setOllamaStatus] = useState<"checking" | "present" | "absent">("checking");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);

  // Initial Checks
  useEffect(() => {
    invoke<string[]>("list_ollama_models")
      .then((models) => {
        setOllamaModels(models);
        setOllamaStatus("present");
      })
      .catch(() => {
        setOllamaStatus("absent");
      });

    // Initial validation of path and hotkey
    invoke<boolean>("validate_file_path", { path: config.whisper_ggml_path }).then(valid => setPathValidation(valid ? "valid" : "invalid"));
    invoke<boolean>("validate_hotkey", { hotkey: config.global_hotkey }).then(valid => setHotkeyValidation(valid ? "valid" : "invalid"));
  }, []);

  // Auto-Save Effect
  useEffect(() => {
    const save = async () => {
      // Skip if nothing changed
      if (JSON.stringify(debouncedFormData) === JSON.stringify(lastSavedConfig)) return;

      setIsSaving(true);

      // Validate GGML Path
      const isPathValid = await invoke<boolean>("validate_file_path", { path: debouncedFormData.whisper_ggml_path });
      setPathValidation(isPathValid ? "valid" : "invalid");

      // Validate Hotkey
      const isHotkeyValid = await invoke<boolean>("validate_hotkey", { hotkey: debouncedFormData.global_hotkey });
      setHotkeyValidation(isHotkeyValid ? "valid" : "invalid");

      // Validate API Key (Only if it looks like a key and changed)
      if (debouncedFormData.api_key !== lastSavedConfig.api_key && debouncedFormData.api_key.length > 10) {
        setGeminiValidation("validating");
        try {
          await invoke("validate_gemini_key", { apiKey: debouncedFormData.api_key });
          setGeminiValidation("valid");
        } catch {
          setGeminiValidation("invalid");
          setIsSaving(false);
          return;
        }
      }

      if (!isPathValid || !isHotkeyValid) {
        setIsSaving(false);
        return;
      }

      // Perform Save
      try {
        await invoke("update_config", { newConfig: debouncedFormData });
        setLastSavedConfig(debouncedFormData);
        onSave(debouncedFormData); // Update parent state without closing
      } catch (err) {
        console.error("Auto-save failed:", err);
      } finally {
        setIsSaving(false);
      }
    };

    save();
  }, [debouncedFormData]);

  const handleChange = (field: keyof AppConfig, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === 'api_key') setGeminiValidation("idle");
    if (field === 'whisper_ggml_path') setPathValidation("idle");
    if (field === 'global_hotkey') setHotkeyValidation("idle");
  };

  const manualValidateKey = async () => {
    if (!formData.api_key) return;
    setGeminiValidation("validating");
    try {
      await invoke("validate_gemini_key", { apiKey: formData.api_key });
      setGeminiValidation("valid");
    } catch (e) {
      setGeminiValidation("invalid");
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-900 text-sm text-gray-300 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">Settings</h2>
              {isSaving ? (
                <span className="text-xs text-blue-400 animate-pulse font-mono">Saving...</span>
              ) : (
                <span className="text-xs text-gray-500 font-mono">All changes saved</span>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {/* API Key */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Gemini API Key
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={formData.api_key || ""}
                  onChange={(e) => handleChange("api_key", e.target.value)}
                  className={`flex-1 bg-black/40 border rounded px-3 py-2 focus:outline-none transition-colors text-white font-mono ${geminiValidation === 'invalid' ? 'border-red-500/50 focus:border-red-500' :
                    geminiValidation === 'valid' ? 'border-green-500/50 focus:border-green-500' :
                      'border-white/10 focus:border-blue-500'
                    }`}
                  placeholder="AIza..."
                />
                <button
                  onClick={manualValidateKey}
                  disabled={!formData.api_key || geminiValidation === "validating"}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {geminiValidation === "validating" ? "Checking..." : "Check"}
                </button>
              </div>
              {geminiValidation === 'valid' && <p className="text-[10px] text-green-400">✓ API Key confirmed</p>}
              {geminiValidation === 'invalid' && <p className="text-[10px] text-red-400">✗ Invalid API Key - Not Saved</p>}
            </div>

            {/* System Prompt */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                System Prompt
              </label>
              <textarea
                value={formData.prompt || ""}
                onChange={(e) => handleChange("prompt", e.target.value)}
                className="w-full h-32 bg-black/40 border border-white/10 rounded px-3 py-2 focus:outline-none focus:border-blue-500 transition-colors text-white font-mono text-xs leading-relaxed resize-none"
                placeholder="You are a helpful assistant..."
              />
            </div>

            {/* Model Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Gemini Model
                </label>
                <div className="relative">
                  <select
                    value={formData.model || "gemini-2.5-flash-lite"}
                    onChange={(e) => handleChange("model", e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 focus:outline-none focus:border-blue-500 transition-colors text-white appearance-none pr-8 cursor-pointer"
                  >
                    {GEMINI_MODELS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Buffer (Secs)
                </label>
                <input
                  type="number"
                  step="5"
                  value={formData.buffer_duration_secs || 45}
                  onChange={(e) =>
                    handleChange("buffer_duration_secs", parseInt(e.target.value) || 45)
                  }
                  className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 focus:outline-none focus:border-blue-500 transition-colors text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Min Confidence (0-1)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={formData.min_confidence || 0.5}
                  onChange={(e) =>
                    handleChange("min_confidence", parseFloat(e.target.value) || 0.5)
                  }
                  className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 focus:outline-none focus:border-blue-500 transition-colors text-white"
                />
              </div>
            </div>

            {/* Transcription Mode */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Transcription Mode
              </label>
              <div className="flex bg-black/40 p-1 rounded border border-white/10 w-fit">
                <button
                  onClick={() => handleChange("transcription_mode", "speed")}
                  className={`px-4 py-1.5 rounded text-xs font-medium transition-all ${formData.transcription_mode === "speed"
                    ? "bg-blue-600 text-white shadow-lg font-bold"
                    : "text-gray-400 hover:text-white"
                    }`}
                >
                  Speed
                </button>
                <button
                  onClick={() => handleChange("transcription_mode", "accuracy")}
                  className={`px-4 py-1.5 rounded text-xs font-medium transition-all ${formData.transcription_mode === "accuracy"
                    ? "bg-blue-600 text-white shadow-lg font-bold"
                    : "text-gray-400 hover:text-white"
                    }`}
                >
                  Accuracy
                </button>
              </div>
              <p className="text-[10px] text-gray-500">
                {formData.transcription_mode === "accuracy"
                  ? "Uses beam search (5 beams). Highly accurate but slower and uses more CPU."
                  : "Uses greedy decoding. Maximum performance and low latency."}
              </p>
            </div>

            {/* Whisper Language */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Whisper Language
              </label>
              <div className="relative w-fit min-w-[200px]">
                <select
                  value={formData.whisper_language || "en"}
                  onChange={(e) => handleChange("whisper_language", e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 focus:outline-none focus:border-blue-500 transition-colors text-white appearance-none pr-8 cursor-pointer"
                >
                  <option value="en">English</option>
                  <option value="zh">Chinese (Mandarin)</option>
                  <option value="pl">Polish</option>
                  <option value="fr">French</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/50">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </div>
              </div>
              <p className="text-[10px] text-gray-500">
                The language model will prioritize this language for transcription.
              </p>
            </div>

            {/* Detection Settings */}
            <div className="space-y-4 border-t border-white/5 pt-4">
              <h3 className="text-xs font-bold text-white/70 uppercase flex items-center gap-2">
                Auto-Detection (Ollama)
                {ollamaStatus === "checking" && <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>}
                {ollamaStatus === "present" && <span className="w-2 h-2 rounded-full bg-green-500"></span>}
                {ollamaStatus === "absent" && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Ollama Model
                  </label>
                  {ollamaStatus === "absent" ? (
                    <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-red-300 text-xs mt-1">
                      Ollama not detected
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        value={formData.ollama_model || ""}
                        onChange={(e) => handleChange("ollama_model", e.target.value)}
                        disabled={ollamaStatus !== "present"}
                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 focus:outline-none focus:border-blue-500 transition-colors text-white appearance-none pr-8 disabled:opacity-50"
                      >
                        <option value="">Disabled</option>
                        {ollamaModels.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/50">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Min Chars
                  </label>
                  <input
                    type="number"
                    step="5"
                    value={formData.ollama_min_chars || 50}
                    onChange={(e) =>
                      handleChange("ollama_min_chars", parseInt(e.target.value) || 50)
                    }
                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 focus:outline-none focus:border-blue-500 transition-colors text-white"
                  />
                </div>
              </div>
            </div>

            {/* Global Hotkey */}
            <div className="space-y-2 border-t border-white/5 pt-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Global Hotkey
              </label>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <input
                    type="text"
                    value={formData.global_hotkey || "Command+Shift+K"}
                    onChange={(e) => handleChange("global_hotkey", e.target.value)}
                    className={`w-full bg-black/40 border rounded px-3 py-2 focus:outline-none transition-colors text-white ${hotkeyValidation === 'invalid' ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-blue-500'
                      }`}
                  />
                  {hotkeyValidation === 'invalid' ? (
                    <p className="text-[10px] text-red-500 mt-1">Invalid hotkey format</p>
                  ) : (
                    <p className="text-[10px] text-gray-600 mt-1">Requires restart to apply.</p>
                  )}
                </div>
                <div>
                  <select
                    value={defaultMode}
                    onChange={(e) => onDefaultModeChange(e.target.value as any)}
                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-2 focus:outline-none focus:border-blue-500 transition-colors text-white text-sm"
                  >
                    <option value="answer">Answer</option>
                    <option value="validate">Validate</option>
                    <option value="followup">Follow-up</option>
                  </select>
                  <p className="text-[10px] text-gray-600 mt-1">Action on trigger</p>
                </div>
              </div>
            </div>

            {/* Whisper Path */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Whisper GGML Path
              </label>
              <input
                type="text"
                value={formData.whisper_ggml_path || ""}
                onChange={(e) => handleChange("whisper_ggml_path", e.target.value)}
                className={`w-full bg-black/40 border rounded px-3 py-2 focus:outline-none transition-colors text-white/50 text-xs truncate ${pathValidation === 'invalid' ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-blue-500'
                  }`}
              />
              {pathValidation === 'invalid' && <p className="text-[10px] text-red-500">File not found - Not Saved</p>}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
