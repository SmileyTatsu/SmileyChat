import { describe, expect, it } from "bun:test";

import { hasMessageBubbles, parseDelayMs, parseMessageBubbles } from "./message-bubbles";

describe("message-bubbles", () => {
    describe("parseDelayMs", () => {
        it("parses seconds with 's' suffix", () => {
            expect(parseDelayMs("1s")).toBe(1000);
            expect(parseDelayMs("1.5s")).toBe(1500);
            expect(parseDelayMs("0.2s")).toBe(200);
        });

        it("parses milliseconds with 'ms' suffix", () => {
            expect(parseDelayMs("500ms")).toBe(500);
            expect(parseDelayMs("1200ms")).toBe(1200);
        });

        it("parses numeric values as seconds", () => {
            expect(parseDelayMs("2")).toBe(2000);
            expect(parseDelayMs("0.5")).toBe(500);
        });

        it("caps delay at 60 seconds", () => {
            expect(parseDelayMs("120s")).toBe(60000);
            expect(parseDelayMs("999999ms")).toBe(60000);
        });

        it("returns undefined for invalid or non-positive delays", () => {
            expect(parseDelayMs(undefined)).toBeUndefined();
            expect(parseDelayMs("")).toBeUndefined();
            expect(parseDelayMs("   ")).toBeUndefined();
            expect(parseDelayMs("0")).toBeUndefined();
            expect(parseDelayMs("0s")).toBeUndefined();
            expect(parseDelayMs("-5s")).toBeUndefined();
            expect(parseDelayMs("abc")).toBeUndefined();
        });
    });

    describe("hasMessageBubbles", () => {
        it("detects <msg> tags", () => {
            expect(hasMessageBubbles("<msg>Hello</msg>")).toBe(true);
            expect(hasMessageBubbles("<MSG delay='1s'>Hello</MSG>")).toBe(true);
            expect(hasMessageBubbles('Unclosed <msg delay="500ms">')).toBe(true);
            expect(hasMessageBubbles("Just closing </msg>")).toBe(true);
        });

        it("returns false when no <msg> tags exist", () => {
            expect(hasMessageBubbles("Hello world")).toBe(false);
            expect(hasMessageBubbles("<div>Hello</div>")).toBe(false);
            expect(hasMessageBubbles("<message>Hello</message>")).toBe(false);
        });
    });

    describe("parseMessageBubbles", () => {
        it("returns single segment for plain text without tags", () => {
            const result = parseMessageBubbles("Hello world! How are you?");
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                id: "bubble-0",
                content: "Hello world! How are you?",
            });
        });

        it("parses simple <msg> tags into distinct bubbles", () => {
            const raw = "<msg>Hey!</msg><msg>Did you hear the news?</msg>";
            const result = parseMessageBubbles(raw);

            expect(result).toHaveLength(2);
            expect(result[0].content).toBe("Hey!");
            expect(result[0].delayMs).toBeUndefined();
            expect(result[1].content).toBe("Did you hear the news?");
            expect(result[1].delayMs).toBeUndefined();
        });

        it("parses delay attributes on bubbles", () => {
            const raw =
                '<msg>First message</msg><msg delay="1.5s">Second message</msg><msg delay="500ms">Third message</msg>';
            const result = parseMessageBubbles(raw);

            expect(result).toHaveLength(3);
            expect(result[0].content).toBe("First message");
            expect(result[0].delayMs).toBeUndefined();

            expect(result[1].content).toBe("Second message");
            expect(result[1].delayMs).toBe(1500);

            expect(result[2].content).toBe("Third message");
            expect(result[2].delayMs).toBe(500);
        });

        it("ignores whitespace between <msg> tags", () => {
            const raw = '<msg>First</msg>\n\n   \n\n<msg delay="1s">Second</msg>';
            const result = parseMessageBubbles(raw);

            expect(result).toHaveLength(2);
            expect(result[0].content).toBe("First");
            expect(result[1].content).toBe("Second");
            expect(result[1].delayMs).toBe(1000);
        });

        it("handles text outside and between <msg> tags without losing content", () => {
            const raw =
                "Greeting! <msg>First bubble</msg> Middle commentary <msg>Second bubble</msg> Farewell!";
            const result = parseMessageBubbles(raw);

            expect(result).toHaveLength(5);
            expect(result[0].content).toBe("Greeting!");
            expect(result[1].content).toBe("First bubble");
            expect(result[2].content).toBe("Middle commentary");
            expect(result[3].content).toBe("Second bubble");
            expect(result[4].content).toBe("Farewell!");
        });

        it("tolerates unclosed trailing tags during live streaming", () => {
            const raw =
                '<msg>Completed first bubble</msg><msg delay="2s">Currently streaming text without closing tag';
            const result = parseMessageBubbles(raw);

            expect(result).toHaveLength(2);
            expect(result[0].content).toBe("Completed first bubble");
            expect(result[1].content).toBe(
                "Currently streaming text without closing tag",
            );
            expect(result[1].delayMs).toBe(2000);
        });

        it("handles unclosed consecutive opening tags safely", () => {
            const raw = '<msg>First unclosed<msg delay="1s">Second';
            const result = parseMessageBubbles(raw);

            expect(result).toHaveLength(2);
            expect(result[0].content).toBe("First unclosed");
            expect(result[1].content).toBe("Second");
            expect(result[1].delayMs).toBe(1000);
        });
    });
});
