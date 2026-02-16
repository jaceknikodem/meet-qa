import { describe, it, expect } from "vitest";
import { parseGeminiStreamChunk } from "./gemini";

describe("parseGeminiStreamChunk", () => {
    it("should parse a valid Gemini stream chunk", () => {
        const chunk = 'data: {"candidates": [{"content": {"parts": [{"text": "Hello world"}]}}]}';
        expect(parseGeminiStreamChunk(chunk)).toBe("Hello world");
    });

    it("should return null for invalid JSON", () => {
        const chunk = "data: { invalid json }";
        expect(parseGeminiStreamChunk(chunk)).toBeNull();
    });

    it("should return null for chunks not starting with data:", () => {
        const chunk = '{"candidates": []}';
        expect(parseGeminiStreamChunk(chunk)).toBeNull();
    });

    it("should return null for empty lines", () => {
        expect(parseGeminiStreamChunk("")).toBeNull();
        expect(parseGeminiStreamChunk("   ")).toBeNull();
    });
});
