import { StructuredResponse } from "../utils/gemini";

interface InsightViewProps {
    response: StructuredResponse | null;
    isLoading: boolean;
    lastMode: "validate" | "answer" | "followup";
}

export function InsightView({ response, isLoading, lastMode }: InsightViewProps) {
    return (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-white/50 font-bold uppercase tracking-wider text-[10px]">AI Insight</h2>
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

                {isLoading && !response && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                )}

                {response && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div>
                            <div className="text-[10px] text-blue-400 font-bold mb-1 uppercase tracking-wider">
                                {lastMode === "validate" ? "Claim Verified" : lastMode === "followup" ? "Context" : "Identified Question"}
                            </div>
                            <p className="text-gray-300 italic">"{response.cleaned_question}"</p>
                        </div>
                        <div className="w-full h-px bg-white/10"></div>
                        <div>
                            <div className="text-[10px] text-green-400 font-bold mb-1 uppercase tracking-wider">
                                {lastMode === "validate" ? "Analysis" : lastMode === "followup" ? "Suggested Question" : "Answer"}
                            </div>
                            <p className="text-white text-lg leading-relaxed">{response.answer}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
