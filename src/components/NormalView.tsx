import { StructuredResponse } from "../utils/gemini";
import { AppConfig } from "./SettingsView";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { AgendaList, AgendaItem } from "./AgendaList";
import { TranscriptionDisplay } from "./TranscriptionDisplay";
import { InsightView } from "./InsightView";
import { BufferVisualizer } from "./BufferVisualizer";

interface NormalViewProps {
    config: AppConfig | null;
    transcript: string;
    meetingContext: string;
    onMeetingContextChange: (val: string) => void;
    supplementalContext: string;
    onSupplementalContextChange: (val: string) => void;
    response: StructuredResponse | null;
    isLoading: boolean;
    isRecording: boolean;
    volume: number;
    onToggleRecording: () => void;
    onTriggerAI: (mode: "validate" | "answer" | "followup") => void;
    lastMode: "validate" | "answer" | "followup";
    onOpenSettings: () => void;
    onSwitchToStealth: () => void;
    onClose: () => void;
}

export function NormalView({
    config,
    transcript,
    meetingContext,
    onMeetingContextChange,
    supplementalContext,
    onSupplementalContextChange,
    response,
    isLoading,
    isRecording,
    volume,
    onToggleRecording,
    onTriggerAI,
    lastMode,
    onOpenSettings,
    onSwitchToStealth,
    onClose,
}: NormalViewProps) {
    const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
    const [agendaStatus, setAgendaStatus] = useState<string>("");
    const [audioDevice, setAudioDevice] = useState<string>("");
    const [isContextExpanded, setIsContextExpanded] = useState(true);

    // 0. Fetch Audio Device
    useEffect(() => {
        invoke<string>("get_audio_device").then(setAudioDevice).catch(console.error);
    }, []);

    // 1. Listen for Backend Updates
    useEffect(() => {
        const unlistenPromise = listen<AgendaItem[]>("agenda-update", (event) => {
            setAgendaItems(event.payload);
        });

        const unlistenStatus = listen<string>("agenda-status", (event) => {
            setAgendaStatus(event.payload);
            setTimeout(() => setAgendaStatus(""), 12000);
        });

        return () => {
            unlistenPromise.then(f => f());
            unlistenStatus.then(f => f());
        };
    }, []);

    // 2. Sync Meeting Context to Backend Agenda
    useEffect(() => {
        const parseAgendaAndSync = async () => {
            const lines = meetingContext.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const items: AgendaItem[] = lines.map((line, idx) => ({
                id: (idx + 1).toString(),
                text: line.replace(/^\d+\.\s*/, ''),
                status: "pending"
            }));

            const mergedItems = items.map(newItem => {
                const existing = agendaItems.find(old => old.text === newItem.text);
                if (existing && existing.status === 'answered') {
                    return { ...newItem, status: existing.status, answer: existing.answer };
                }
                return newItem;
            });

            if (JSON.stringify(mergedItems) !== JSON.stringify(agendaItems)) {
                setAgendaItems(mergedItems);
                await invoke("update_agenda", { items: mergedItems });
            }
        };

        const timeout = setTimeout(parseAgendaAndSync, 1000);
        return () => clearTimeout(timeout);
    }, [meetingContext]);

    return (
        <div className="w-full h-full flex flex-col bg-gray-900 text-white font-sans overflow-hidden">
            {/* Header */}
            <div
                data-tauri-drag-region
                className="flex items-center justify-between p-4 border-b border-white/10 bg-black/20 backdrop-blur-md sticky top-0 z-10"
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        </svg>
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-tight">Kuroko</h1>
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isRecording ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></span>
                            <span className="text-[10px] uppercase tracking-wider font-medium text-white/50">
                                {isRecording ? "Listening" : "Paused"}
                            </span>

                            {/* Volume Indicator */}
                            {isRecording && (
                                <div className="flex items-center gap-1 h-3 ml-1">
                                    {[1, 2, 3, 4, 5].map((i) => {
                                        // Normalize volume to 0-1 range for the bars, but amplify for visibility
                                        // Using sqrt to make quieter sounds more visible
                                        const threshold = config?.silence_threshold || 0.005;
                                        const intensity = Math.min(1, Math.sqrt(volume) / 0.2); // 0.04 RMS => 1.0 intensity
                                        const isActive = intensity > (i / 5);
                                        const isReliable = volume > threshold;

                                        return (
                                            <div
                                                key={i}
                                                className={`w-1 rounded-full transition-all duration-150 ${isActive
                                                    ? (isReliable ? "bg-green-400" : "bg-green-400/30")
                                                    : "bg-white/10"
                                                    }`}
                                                style={{
                                                    height: `${20 + (i * 15)}%`,
                                                    boxShadow: isActive && isReliable ? '0 0 4px rgba(74, 222, 128, 0.5)' : 'none'
                                                }}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                            {config?.model && (
                                <>
                                    <span className="text-white/10 mx-1">•</span>
                                    <span className="text-[10px] uppercase tracking-wider font-mono text-white/30 truncate max-w-[120px]">
                                        {config.model}
                                    </span>
                                </>
                            )}
                            {audioDevice && (
                                <>
                                    <span className="text-white/10 mx-1">•</span>
                                    <span className="text-[10px] uppercase tracking-wider font-mono text-white/30 truncate max-w-[150px]" title={audioDevice}>
                                        {audioDevice}
                                    </span>
                                </>
                            )}
                            {config?.whisper_language && (
                                <>
                                    <span className="text-white/10 mx-1">•</span>
                                    <span className="text-[10px] uppercase tracking-wider font-mono text-white/30">
                                        {config.whisper_language}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onSwitchToStealth}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-white/60 hover:text-white transition-all text-sm flex items-center gap-2"
                        title="Minimalistic Mode"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                    </button>
                    <button
                        onClick={onOpenSettings}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-white/60 hover:text-white transition-all"
                        title="Settings"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-white/60 hover:text-white transition-all"
                        title="Hide Window"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                    <button
                        onClick={() => invoke("quit_app")}
                        className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 transition-all ml-2"
                        aria-label="Quit"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
                    </button>
                </div>
            </div>

            {/* Main Content Split */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Agenda & Context */}
                <div className="flex-1 flex flex-col p-6 min-w-0 border-r border-white/5 gap-4">
                    {/* Supplemental Context (Collapsible) */}
                    <div className="flex flex-col">
                        <button
                            onClick={() => setIsContextExpanded(!isContextExpanded)}
                            className="flex items-center gap-2 text-[10px] text-white/40 uppercase font-bold tracking-wider mb-2 hover:text-white/60 transition-colors w-full"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`transition-transform duration-200 ${isContextExpanded ? "rotate-90" : ""}`}
                            >
                                <path d="m9 18 6-6-6-6" />
                            </svg>
                            Reference Context
                            {supplementalContext.trim() && !isContextExpanded && (
                                <span className="ml-auto lowercase font-normal italic opacity-50 px-2 py-0.5 bg-white/5 rounded text-[9px]">
                                    {supplementalContext.split('\n').length} lines content
                                </span>
                            )}
                        </button>
                        {isContextExpanded && (
                            <textarea
                                value={supplementalContext}
                                onChange={(e) => onSupplementalContextChange(e.target.value)}
                                placeholder="Paste relevant background, PR descriptions, or previous transcripts here..."
                                className="w-full h-48 bg-black/40 rounded-xl border border-white/10 p-3 text-sm text-gray-300 focus:outline-none focus:border-blue-500/50 transition-colors resize-none custom-scrollbar animate-in slide-in-from-top-2 duration-200"
                            />
                        )}
                    </div>

                    <div className="flex flex-col">
                        <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-2">Meeting Goals</label>
                        <textarea
                            value={meetingContext}
                            onChange={(e) => onMeetingContextChange(e.target.value)}
                            placeholder="List meeting goals here (one per line)..."
                            className="w-full h-32 bg-black/40 rounded-xl border border-white/10 p-3 text-sm text-gray-300 focus:outline-none focus:border-blue-500/50 transition-colors resize-none custom-scrollbar"
                        />
                    </div>

                    <AgendaList items={agendaItems} status={agendaStatus} />
                </div>

                {/* Right: Transcript & AI Insights */}
                <div className="w-[450px] flex flex-col p-6 bg-black/10 gap-4">
                    <TranscriptionDisplay transcript={transcript} />

                    <BufferVisualizer
                        silenceThreshold={config?.silence_threshold ?? 0.005}
                        bufferDuration={config?.buffer_duration_secs ?? 45}
                    />

                    <InsightView
                        config={config}
                        response={response}
                        isLoading={isLoading}
                        lastMode={lastMode}
                        transcript={transcript}
                    />

                    {/* Quick AI Actions */}
                    <div className="grid grid-cols-4 gap-2 mt-2">
                        <button
                            onClick={onToggleRecording}
                            className={`flex flex-col items-center justify-center p-1.5 rounded-lg transition-all ${isRecording
                                ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/10"
                                : "bg-green-600 text-white hover:bg-green-500 shadow-lg shadow-green-500/10"
                                }`}
                            title={isRecording ? "Stop Recording" : "Start Recording"}
                        >
                            {isRecording ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            )}
                            <span className="text-[9px] font-bold mt-0.5 uppercase tracking-wider">{isRecording ? "Stop" : "Rec"}</span>
                        </button>

                        <button
                            onClick={() => onTriggerAI("validate")}
                            disabled={isLoading || !isRecording}
                            className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-lg shadow-indigo-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Validate the most recent claim"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                            <span className="text-[9px] font-bold mt-0.5 uppercase tracking-wider">Check</span>
                        </button>

                        <button
                            onClick={() => onTriggerAI("answer")}
                            disabled={isLoading || !isRecording}
                            className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg shadow-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Answer the most recent question"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                            <span className="text-[9px] font-bold mt-0.5 uppercase tracking-wider">Answer</span>
                        </button>

                        <button
                            onClick={() => onTriggerAI("followup")}
                            disabled={isLoading || !isRecording}
                            className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-all shadow-lg shadow-purple-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Generate a follow-up question"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 21h5v-5"></path></svg>
                            <span className="text-[9px] font-bold mt-0.5 uppercase tracking-wider">Follow-up</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
