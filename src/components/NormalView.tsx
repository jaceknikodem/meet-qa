import { StructuredResponse } from "../utils/gemini";
import { AppConfig } from "./SettingsView";

interface NormalViewProps {
    config: AppConfig | null;
    transcript: string;
    response: StructuredResponse | null;
    isLoading: boolean;
    isRecording: boolean;
    onToggleRecording: () => void;
    onTriggerAI: () => void;
    onOpenSettings: () => void;
    onSwitchToStealth: () => void;
}

export function NormalView({
    config,
    transcript,
    response,
    isLoading,
    isRecording,
    onToggleRecording,
    onTriggerAI,
    onOpenSettings,
    onSwitchToStealth,
}: NormalViewProps) {
    return (
        <div className="w-full h-full flex flex-col bg-gray-900 text-white font-sans overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/20 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        </svg>
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-tight">Stealth Sidekick</h1>
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isRecording ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></span>
                            <span className="text-[10px] uppercase tracking-wider font-medium text-white/50">
                                {isRecording ? "Listening" : "Paused"}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onSwitchToStealth}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-white/60 hover:text-white transition-all text-sm flex items-center gap-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                        Stealth Mode
                    </button>
                    <button
                        onClick={onOpenSettings}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-white/60 hover:text-white transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    </button>
                </div>
            </div>

            {/* Main Content Split */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Transcript & Controls */}
                <div className="flex-1 flex flex-col p-6 min-w-0 border-r border-white/5">
                    <div className="flex-1 bg-black/40 rounded-2xl border border-white/5 p-4 overflow-y-auto mb-4 custom-scrollbar relative">
                        <div className="absolute top-2 right-2 text-[10px] text-white/20 uppercase font-mono tracking-widest">Live Transcript (Buffered)</div>
                        <p className="whitespace-pre-wrap text-gray-300 font-mono text-sm leading-relaxed">
                            {transcript || <span className="text-gray-600 italic">Waiting for audio...</span>}
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={onToggleRecording}
                            className={`flex-1 py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${isRecording
                                ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                                : "bg-green-500 text-white hover:bg-green-400 border border-green-500/50 shadow-green-500/20"
                                }`}
                        >
                            {isRecording ? (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                                    Stop
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                    Start
                                </>
                            )}
                        </button>

                        <button
                            onClick={onTriggerAI}
                            disabled={isLoading || !isRecording}
                            className="flex-[2] py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-white/20 to-blue-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                            {isLoading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>
                            )}
                            {isLoading ? "Analyzing..." : "Ask"}
                        </button>
                    </div>
                </div>

                {/* Right: AI Response */}
                <div className="w-[400px] flex flex-col p-6 pl-0 bg-black/10">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-white/50 font-bold uppercase tracking-wider text-xs">AI Insight</h2>
                        {response?.confidence ? (
                            <span className="text-[10px] bg-white/10 px-2 py-1 rounded text-white/50 font-mono">
                                CONFIDENCE: {response.confidence.toFixed(2)}
                            </span>
                        ) : null}
                    </div>

                    <div className="flex-1 bg-white/5 border border-white/5 rounded-2xl p-6 relative overflow-y-auto custom-scrollbar">
                        {!response && !isLoading && (
                            <div className="absolute inset-0 flex items-center justify-center text-center p-6 opacity-30">
                                <div>
                                    <svg className="w-12 h-12 mx-auto mb-4 text-white" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                    <p className="text-sm">Contextual insights will appear here.</p>
                                </div>
                            </div>
                        )}

                        {response && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <div>
                                    <div className="text-[10px] text-blue-400 font-bold mb-1 uppercase tracking-wider">Identified Question</div>
                                    <p className="text-gray-300 italic">"{response.cleaned_question}"</p>
                                </div>
                                <div className="w-full h-px bg-white/10"></div>
                                <div>
                                    <div className="text-[10px] text-green-400 font-bold mb-1 uppercase tracking-wider">Answer</div>
                                    <p className="text-white text-lg leading-relaxed">{response.answer}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
