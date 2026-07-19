import { describe, expect, test } from "bun:test";

import type { Message, MessageToolActivity } from "../types";
import { getMessageTimeline, getVisibleMessageTimeline } from "./messages";
import { applyStreamingMessageDraft } from "./streaming-message-drafts";

const completedTool: MessageToolActivity = {
    call: { id: "tool-1", name: "weather", argumentsText: "{}" },
    result: { toolCallId: "tool-1", name: "weather", content: "Sunny" },
};

describe("message thought timelines", () => {
    test("keeps thought and tool entries in their persisted order", () => {
        const message: Message = {
            id: "message-1",
            author: "Assistant",
            role: "character",
            createdAt: "2026-01-01T00:00:00.000Z",
            activeSwipeIndex: 0,
            swipes: [
                {
                    id: "swipe-1",
                    content: "Done.",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    timeline: [
                        { id: "tool-1", type: "tool", activity: completedTool },
                        { id: "thought-1", type: "thought", content: "Checking." },
                        { id: "tool-2", type: "tool", activity: completedTool },
                    ],
                },
            ],
        };

        expect(getMessageTimeline(message).map((entry) => entry.type)).toEqual([
            "tool",
            "thought",
            "tool",
        ]);
    });

    test("synthesizes legacy entries as tool activity followed by the final thought", () => {
        const message: Message = {
            id: "message-1",
            author: "Assistant",
            role: "character",
            createdAt: "2026-01-01T00:00:00.000Z",
            activeSwipeIndex: 0,
            swipes: [
                {
                    id: "swipe-1",
                    content: "Done.",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    reasoning: "Final thought.",
                    toolActivities: [completedTool],
                },
            ],
        };

        expect(getMessageTimeline(message).map((entry) => entry.type)).toEqual([
            "tool",
            "thought",
        ]);
    });

    test("hides tools with the thought process and honors the tool activity gate", () => {
        const timeline = [
            { id: "thought-1", type: "thought" as const, content: "Thinking." },
            { id: "tool-1", type: "tool" as const, activity: completedTool },
        ];

        expect(getVisibleMessageTimeline(timeline, false, true)).toEqual([]);
        expect(getVisibleMessageTimeline(timeline, true, false)).toEqual([timeline[0]]);
        expect(getVisibleMessageTimeline(timeline, true, true)).toEqual(timeline);
    });

    test("merges a live tool timeline into the rendered active swipe", () => {
        const message: Message = {
            id: "message-1",
            author: "Assistant",
            role: "character",
            createdAt: "2026-01-01T00:00:00.000Z",
            activeSwipeIndex: 0,
            swipes: [
                {
                    id: "swipe-1",
                    content: "",
                    createdAt: "2026-01-01T00:00:00.000Z",
                },
            ],
        };
        const rendered = applyStreamingMessageDraft(message, {
            timeline: [{ id: "tool-1", type: "tool", activity: completedTool }],
        });

        expect(getMessageTimeline(rendered)).toEqual([
            { id: "tool-1", type: "tool", activity: completedTool },
        ]);
    });
});
