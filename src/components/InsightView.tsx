import { StructuredResponse } from "../utils/gemini";
import { AppConfig } from "./SettingsView";

interface InsightViewProps {
    config: AppConfig | null;
    response: StructuredResponse | null;
    isLoading: boolean;
    lastMode: "validate" | "answer" | "followup";
    transcript: string;
}

export function InsightView({ config, response, isLoading, lastMode, transcript }: InsightViewProps) {
    const minConfidence = config?.min_confidence ?? 0.5;
    const isLowConfidence = response && response.confidence < minConfidence;

    return (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-white/50 font-bold uppercase tracking-wider text-[10px]">AI Insight</h2>
                {response?.confidence ? (
                    <span className={`text-[10px] px-2 py-1 rounded font-mono ${isLowConfidence ? "bg-red-500/10 text-red-400" : "bg-white/10 text-white/50"}`}>
                        MATCH: {(response.confidence * 100).toFixed(0)}%
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

                {isLoading && !response && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                )}

                {response && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        {isLowConfidence ? (
                            <div className="py-2 space-y-4">
                                <div className="text-center py-4 space-y-3 opacity-60">
                                    <div className="text-gray-400 font-medium text-sm">Nothing significant found in this segment.</div>
                                    <p className="text-[11px] text-gray-500 max-w-xs mx-auto">
                                        The AI didn't find any factual claims or questions with enough confidence ({(response.confidence * 100).toFixed(0)}% &lt; {(minConfidence * 100).toFixed(0)}%).
                                    </p>
                                </div>
                                <div className="w-full h-px bg-white/5"></div>
                                <div className="space-y-2">
                                    <div className="text-[9px] text-white/30 font-bold uppercase tracking-wider">Analyzed Transcript:</div>
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                                        <p className="text-xs text-gray-400 italic leading-relaxed font-mono">"{transcript}"</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div>
                                    <div className="text-[10px] text-blue-400 font-bold mb-1 uppercase tracking-wider">
                                        {lastMode === "validate" ? "Claim Identified" : lastMode === "followup" ? "Context" : "Question Identified"}
                                    </div>
                                    <p className="text-gray-300 italic">"{response.cleaned_question}"</p>
                                </div>
                                <div className="w-full h-px bg-white/10"></div>
                                <div>
                                    <div className="text-[10px] text-green-400 font-bold mb-1 uppercase tracking-wider">
                                        {lastMode === "validate" ? "Enrichment" : lastMode === "followup" ? "Suggested Question" : "Answer"}
                                    </div>
                                    <p className="text-white text-base leading-relaxed">{response.answer}</p>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
