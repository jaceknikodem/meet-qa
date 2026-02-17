interface TranscriptionDisplayProps {
    transcript: string;
}

export function TranscriptionDisplay({ transcript }: TranscriptionDisplayProps) {
    return (
        <div className="h-1/4 min-h-[100px] bg-black/40 rounded-2xl border border-white/5 p-4 overflow-y-auto custom-scrollbar relative">
            <div className="absolute top-2 right-2 text-[10px] text-white/20 uppercase font-mono tracking-widest">Transcript</div>
            <p className="whitespace-pre-wrap text-gray-300 font-mono text-xs leading-relaxed">
                {transcript || <span className="text-gray-600 italic">Waiting...</span>}
            </p>
        </div>
    );
}
