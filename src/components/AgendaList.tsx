export interface AgendaItem {
    id: string;
    text: string;
    status: "pending" | "captured" | "answered";
    score: number; // 0.0 - 1.0
    evidence: string[];
    answer?: string;
}

interface AgendaListProps {
    items: AgendaItem[];
    status: string;
    onExpandItem: (id: string, text: string) => void;
}

export function AgendaList({ items, status, onExpandItem }: AgendaListProps) {
    const answeredCount = items.filter(i => i.status === 'answered').length;

    return (
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider flex items-center justify-between mb-2">
                <span>Tracked Agenda ({answeredCount}/{items.length})</span>
                {items.some(i => i.status !== 'answered') && (
                    <span className="flex items-center gap-1 text-white/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500/50 animate-pulse"></div>
                        Tracking
                    </span>
                )}
            </label>

            <div className="flex-1 flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-1">
                {items.map((item) => (
                    <div
                        key={item.id}
                        className={`p-3 rounded-lg border text-sm transition-all shrink-0 flex flex-col gap-2 ${item.status === 'answered'
                            ? "bg-green-500/10 border-green-500/20"
                            : item.status === 'captured'
                                ? "bg-blue-500/10 border-blue-500/20"
                                : "bg-white/5 border-white/5"
                            }`}
                    >
                        <div className="flex items-start gap-2">
                            <div className={`mt-0.5 min-w-[20px] h-5 flex items-center justify-center rounded-full text-[10px] font-bold ${item.status === 'answered'
                                    ? "bg-green-500 text-black"
                                    : item.status === 'captured'
                                        ? "bg-blue-500 text-white"
                                        : "bg-white/10 text-white/50"
                                }`}>
                                {item.status === 'answered' ? "✓" : item.id}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                    <p className={`leading-snug ${item.status === 'answered' ? "text-green-100" : "text-gray-300"}`}>
                                        {item.text}
                                    </p>
                                    {item.status === 'pending' && (
                                        <button
                                            onClick={() => onExpandItem(item.id, item.text)}
                                            className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white transition-colors"
                                            title="Use AI to break down into sub-tasks"
                                        >
                                            {/* Wand Icon */}
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></svg>
                                        </button>
                                    )}
                                </div>

                                {/* Progress Bar */}
                                {item.score > 0 && item.status !== 'answered' && (
                                    <div className="mt-2 w-full h-1 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500 transition-all duration-500"
                                            style={{ width: `${Math.min(100, item.score * 100)}%` }}
                                        />
                                    </div>
                                )}

                                {/* Evidence / Answer */}
                                {(item.answer || item.evidence.length > 0) && (
                                    <div className="mt-2 text-xs bg-black/20 rounded p-2 font-mono flex flex-col gap-1">
                                        {item.status === 'answered' && item.answer && (
                                            <div className="text-green-200/80 font-bold border-b border-white/5 pb-1 mb-1">
                                                {item.answer}
                                            </div>
                                        )}
                                        {item.evidence.map((ev, idx) => (
                                            <div key={idx} className="text-white/60 flex gap-2">
                                                <span className="text-blue-400">•</span>
                                                {ev}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {status && (
                <div className="mt-4 animate-in fade-in slide-in-from-bottom-2">
                    <span className="text-blue-400 font-mono text-[10px] uppercase tracking-wider flex items-center gap-2 bg-blue-500/5 px-3 py-1.5 rounded-lg border border-blue-500/10 w-fit">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                        {status}
                    </span>
                </div>
            )}
        </div>
    );
}
