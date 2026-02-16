import { StructuredResponse } from "../utils/gemini";
import { AppConfig } from "./SettingsView";
import { invoke } from "@tauri-apps/api/core";

interface StealthViewProps {
    config: AppConfig | null;
    transcript: string;
    response: StructuredResponse | null;
    isLoading: boolean;
    error: string;
    onClose: () => void;
    onOpenSettings: () => void;
    onSwitchToNormal: () => void;
}

const MIN_CONFIDENCE = 0.5;

export function StealthView({
    config,
    transcript,
    response,
    isLoading,
    error,
    onClose,
    onOpenSettings,
    onSwitchToNormal,
}: StealthViewProps) {
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
