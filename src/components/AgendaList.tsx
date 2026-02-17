export interface AgendaItem {
    id: string;
    text: string;
    status: "pending" | "answered";
    answer?: string;
}

interface AgendaListProps {
    items: AgendaItem[];
    status: string;
}

export function AgendaList({ items, status }: AgendaListProps) {
    if (items.length === 0 && !status) return null;

    const answeredCount = items.filter(i => i.status === 'answered').length;

    return (
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <label className="text-[10px] text-white/40 uppercase font-bold tracking-wider flex items-center justify-between mb-2">
                <span>Tracked Agenda ({answeredCount}/{items.length})</span>
                {items.some(i => i.status === 'pending') && (
                    <span className="flex items-center gap-1 text-white/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
                        Listening
                    </span>
                )}
            </label>

            <div className="flex-1 flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-1">
                {items.map((item) => (
                    <div
                        key={item.id}
                        className={`p-3 rounded-lg border text-sm transition-all shrink-0 ${item.status === 'answered'
                            ? "bg-green-500/10 border-green-500/20"
                            : "bg-white/5 border-white/5"
                            }`}
                    >
                        <div className="flex items-start gap-2">
                            <div className={`mt-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold ${item.status === 'answered' ? "bg-green-500 text-black" : "bg-white/10 text-white/50"
                                }`}>
                                {item.status === 'answered' ? "✓" : item.id}
                            </div>
                            <div className="flex-1">
                                <p className={`leading-snug ${item.status === 'answered' ? "text-green-100" : "text-gray-300"}`}>
                                    {item.text}
                                </p>
                                {item.answer && (
                                    <div className="mt-2 text-xs bg-black/20 rounded p-2 text-green-200/80 font-mono">
                                        {item.answer}
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
