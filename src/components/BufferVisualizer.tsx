import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

interface BufferVisualizerProps {
    silenceThreshold: number;
    bufferDuration: number;
    compact?: boolean;
}

export function BufferVisualizer({ silenceThreshold, bufferDuration, compact }: BufferVisualizerProps) {
    const [activity, setActivity] = useState<number[]>([]);

    useEffect(() => {
        const unlisten = listen<number[]>("buffer-activity", (event) => {
            setActivity(event.payload);
        });

        return () => {
            unlisten.then(f => f());
        };
    }, []);

    if (activity.length === 0) return null;

    return (
        <div className={`flex flex-col ${compact ? "gap-1" : "gap-1.5"}`}>
            {!compact && (
                <div className="flex items-center justify-between text-[9px] uppercase font-bold tracking-widest text-white/30">
                    <span>Buffer History ({bufferDuration}s)</span>
                    <span>Now</span>
                </div>
            )}
            <div className={`${compact ? "h-3" : "h-8"} bg-black/40 rounded-lg border border-white/5 flex items-end gap-[1px] p-0.5 overflow-hidden`}>
                {activity.map((level, i) => {
                    const isActive = level > silenceThreshold;
                    // Amplify for visualization
                    const height = Math.min(100, Math.sqrt(level) * 400);

                    return (
                        <div
                            key={i}
                            className={`flex-1 rounded-full transition-all duration-300 ${isActive ? (compact ? "bg-blue-500/80" : "bg-blue-500/60") : "bg-white/5"
                                }`}
                            style={{
                                height: `${Math.max(compact ? 30 : 15, height)}%`,
                                minWidth: compact ? '1px' : '2px'
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
}
