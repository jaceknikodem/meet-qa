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

export interface StructuredResponse {
    cleaned_question: string;
    answer: string;
    confidence: number;
}

/**
 * Best-effort extraction of fields from a partial JSON string for streaming UX.
 */
export function extractStructuredData(accumulatedText: string): StructuredResponse {
    const extractField = (field: string) => {
        // Look for "field": "value" (full match)
        const fullRegex = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`);
        const fullMatch = accumulatedText.match(fullRegex);
        if (fullMatch) return fullMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');

        // Look for "field": "partial value... (open ended)
        const partialRegex = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)$`);
        const partialMatch = accumulatedText.match(partialRegex);
        if (partialMatch) return partialMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');

        return "";
    };

    const extractNumber = (field: string) => {
        const regex = new RegExp(`"${field}"\\s*:\\s*([0-9.]+)`);
        const match = accumulatedText.match(regex);
        if (match) return parseFloat(match[1]);
        return 0;
    };

    return {
        cleaned_question: extractField("cleaned_question"),
        answer: extractField("answer"),
        confidence: extractNumber("confidence")
    };
}
