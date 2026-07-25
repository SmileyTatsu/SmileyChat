import { expect, test } from "bun:test";

import {
    clearStreamingMessageDraft,
    findStreamingMessageDraftSignal,
    flushStreamingMessageDraft,
    getStreamingMessageDraft,
    setStreamingMessageContent,
    startStreamingMessageDraft,
} from "./streaming-message-drafts";

test("reading an absent draft does not allocate a streaming signal", () => {
    const messageId = "historical-message";

    expect(getStreamingMessageDraft(messageId)).toBeUndefined();
    expect(findStreamingMessageDraftSignal(messageId)).toBeUndefined();

    const signal = startStreamingMessageDraft(messageId);
    expect(findStreamingMessageDraftSignal(messageId)).toBe(signal);

    clearStreamingMessageDraft(messageId);
});

test("batches streaming draft updates until the next display interval", () => {
    const messageId = "streaming-message";
    const draftSignal = startStreamingMessageDraft(messageId);

    setStreamingMessageContent(messageId, "Hel");
    setStreamingMessageContent(messageId, "Hello");

    expect(draftSignal.peek()).toBeUndefined();

    flushStreamingMessageDraft(messageId);

    expect(draftSignal.peek()?.content).toBe("Hello");
    clearStreamingMessageDraft(messageId);
});
