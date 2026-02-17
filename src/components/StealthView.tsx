import { useEffect } from "react";
import { StructuredResponse } from "../utils/gemini";
import { AppConfig } from "./SettingsView";
import { invoke } from "@tauri-apps/api/core";
import { BufferVisualizer } from "./BufferVisualizer";

interface StealthViewProps {
    config: AppConfig | null;
    transcript: string;
    meetingContext: string;
    supplementalContext: string;
    response: StructuredResponse | null;
    isLoading: boolean;
    isRecording: boolean;
    volume: number;
    error: string;
    onClose: () => void;

    onOpenSettings: () => void;
    onSwitchToNormal: () => void;
    onTriggerAI: (mode: "validate" | "answer" | "followup") => void;
    lastMode: "validate" | "answer" | "followup";
}



export function StealthView({
    config,
    transcript,
    meetingContext,
    supplementalContext,
    response,
    isLoading,
    isRecording,
    volume,
    error,
    onClose,
    onOpenSettings,
    onSwitchToNormal,
    onTriggerAI,
    lastMode,
}: StealthViewProps) {
    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input (though there are no inputs in this view yet, good practice)
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            switch (e.key.toLowerCase()) {
                case "escape":
                    onClose();
                    break;
                case "1":
                case "v":
                    onTriggerAI("validate");
                    break;
                case "2":
                case "a":
                    onTriggerAI("answer");
                    break;
                case "3":
                case "f":
                    onTriggerAI("followup");
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onTriggerAI, onClose]);

    return (
        <div
            className="w-screen h-screen flex flex-col items-center justify-center cursor-grab active:cursor-grabbing bg-black/[0.001]"
        >
            {/* Main HUD Container - Draggable */}
            <div
                data-tauri-drag-region
                className="bg-black/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-5 w-full max-w-xl shadow-2xl transition-all duration-300 relative group pointer-events-auto"
            >
                {/* Controls */}
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all z-20">
                    <button
                        onClick={onSwitchToNormal}
                        className="p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white transition-all"
                        aria-label="Normal Mode"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                    </button>
                    <button
                        onClick={onOpenSettings}
                        className="p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white transition-all"
                        aria-label="Open Settings"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    </button>
                    <button
                        onClick={onClose}
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
                <div
                    data-tauri-drag-region
                    className="flex justify-between items-center mb-3 pr-8 cursor-grab active:cursor-grabbing"
                >
                    <div className="flex items-center gap-3">
                        <div className="text-xs font-bold text-white/50 uppercase tracking-widest">
                            KUROKO
                        </div>
                        {isRecording && (
                            <div className="flex items-end gap-0.5 h-2.5">
                                {[1, 2, 3, 4, 5].map((i) => {
                                    const threshold = config?.silence_threshold || 0.005;
                                    const intensity = Math.min(1, Math.sqrt(volume) / 0.2); // 0.04 RMS => 1.0 intensity
                                    const isActive = intensity > (i / 5);
                                    const isReliable = volume > threshold;
                                    return (
                                        <div
                                            key={i}
                                            className={`w-0.5 rounded-full transition-all duration-150 ${isActive
                                                ? (isReliable ? "bg-green-400" : "bg-green-400/30")
                                                : "bg-white/10"
                                                }`}
                                            style={{
                                                height: `${20 + (i * 20)}%`,
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        )}
                        {meetingContext.trim() && (
                            <div className="px-1.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center gap-1.5">
                                <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                                <span className="text-[9px] text-blue-400 font-bold uppercase tracking-wider">Goals Active</span>
                            </div>
                        )}
                        {supplementalContext.trim() && (
                            <div className="px-1.5 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 flex items-center gap-1.5">
                                <div className="w-1 h-1 bg-purple-400 rounded-full"></div>
                                <span className="text-[9px] text-purple-400 font-bold uppercase tracking-wider">Ref Active</span>
                            </div>
                        )}
                        {!isRecording && (
                            <div className="px-1.5 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 flex items-center gap-1.5">
                                <div className="w-1 h-1 bg-red-500 rounded-full"></div>
                                <span className="text-[9px] text-red-400 font-bold uppercase tracking-wider">Paused</span>
                            </div>
                        )}
                    </div>
                    {isLoading && (
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-blue-400 font-bold">ACTIVE</span>
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div className="space-y-3">
                    {config?.error && (
                        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-3 font-mono text-xs">
                            <div className="text-blue-400 font-bold uppercase tracking-wider">Setup Required</div>
                            <p className="text-gray-300">Check .env in {config.error}</p>
                        </div>
                    )}

                    {transcript && !config?.error && (
                        <div className="space-y-2">
                            <div className="p-2 bg-white/5 rounded border border-white/5">
                                <p className="text-[10px] text-gray-400 italic truncate italic">"{transcript}"</p>
                            </div>
                            <BufferVisualizer
                                silenceThreshold={config?.silence_threshold ?? 0.005}
                                bufferDuration={config?.buffer_duration_secs ?? 45}
                                compact
                            />
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
                                    {response && response.confidence < (config?.min_confidence ?? 0.5) ? (
                                        <div className="py-4 font-mono">
                                            <div className="text-center space-y-2 opacity-50">
                                                <p className="text-gray-500 font-medium text-xs uppercase tracking-widest">Nothing significant found</p>
                                                <p className="text-[10px] text-gray-600">
                                                    Confidence: {(response.confidence * 100).toFixed(0)}% &lt; {(config?.min_confidence ?? 0.5) * 100}%
                                                </p>
                                            </div>
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

                {/* Quick Actions Footer */}
                <div className="flex gap-2 justify-center mt-4 pt-4 border-t border-white/5">
                    {[
                        { id: "validate", label: "Validate", key: "V", icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path> },
                        { id: "answer", label: "Answer", key: "A", icon: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path> },
                        { id: "followup", label: "Follow-up", key: "F", icon: <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path> },
                    ].map((mode) => (
                        <button
                            key={mode.id}
                            onClick={() => onTriggerAI(mode.id as any)}
                            disabled={isLoading || !isRecording}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] uppercase tracking-wider transition-all border group ${lastMode === mode.id
                                ? "bg-white/10 text-white border-white/20 shadow-[0_0_10px_rgba(255,255,255,0.1)] font-bold"
                                : "bg-transparent text-white/30 border-transparent hover:bg-white/5 hover:text-white/60 font-medium"
                                } disabled:opacity-30 disabled:cursor-not-allowed`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                {mode.icon}
                            </svg>
                            {mode.label}
                            <span className="ml-1 opacity-30 text-[8px] font-mono border border-white/20 px-1 rounded-sm group-hover:opacity-100 transition-opacity hidden sm:inline-block">
                                {mode.key}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
