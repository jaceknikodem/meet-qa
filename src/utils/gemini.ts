export function parseGeminiStreamChunk(line: string): string | null {
    const trimmedLine = line.trim();
    if (!trimmedLine || !trimmedLine.startsWith("data: ")) return null;

    try {
        const json = JSON.parse(trimmedLine.substring(6));
        return json.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (e) {
        return null;
    }
}
