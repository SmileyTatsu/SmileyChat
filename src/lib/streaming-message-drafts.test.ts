import { expect, test } from "bun:test";

import {
    clearStreamingMessageDraft,
    findStreamingMessageDraftSignal,
    getStreamingMessageDraft,
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
