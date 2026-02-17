import { StructuredResponse } from "../utils/gemini";
import { AppConfig } from "./SettingsView";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { AgendaList, AgendaItem } from "./AgendaList";
import { TranscriptionDisplay } from "./TranscriptionDisplay";
import { InsightView } from "./InsightView";

interface NormalViewProps {
    config: AppConfig | null;
    transcript: string;
    meetingContext: string;
    onMeetingContextChange: (val: string) => void;
    response: StructuredResponse | null;
    isLoading: boolean;
    isRecording: boolean;
    onToggleRecording: () => void;
    onTriggerAI: (mode: "validate" | "answer" | "followup") => void;
    lastMode: "validate" | "answer" | "followup";
    onOpenSettings: () => void;
    onSwitchToStealth: () => void;
}

export function NormalView({
    config,
    transcript,
    meetingContext,
    onMeetingContextChange,
    response,
    isLoading,
    isRecording,
    onToggleRecording,
    onTriggerAI,
    lastMode,
    onOpenSettings,
    onSwitchToStealth,
}: NormalViewProps) {
    const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
    const [agendaStatus, setAgendaStatus] = useState<string>("");

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
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/20 backdrop-blur-md sticky top-0 z-10">
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
                            {config?.model && (
                                <>
                                    <span className="text-white/10 mx-1">•</span>
                                    <span className="text-[10px] uppercase tracking-wider font-mono text-white/30 truncate max-w-[120px]">
                                        {config.model}
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
                <div className="flex-1 flex flex-col p-6 min-w-0 border-r border-white/5">
                    <div className="flex flex-col mb-4">
                        <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-2">Meeting Goals (Tracked Context)</label>
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

                    <InsightView
                        response={response}
                        isLoading={isLoading}
                        lastMode={lastMode}
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
