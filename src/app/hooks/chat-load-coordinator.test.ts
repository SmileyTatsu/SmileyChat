import { expect, test } from "bun:test";

import {
    cancelChatLoad,
    completeChatLoad,
    setChatLoadTarget,
    type PendingChatLoad,
} from "./chat-load-coordinator";

const pending: PendingChatLoad = { requestId: 4 };

test("only the active request can set or complete its chat load target", () => {
    const targeted = setChatLoadTarget(pending, 4, "chat-a");

    expect(targeted).toEqual({ requestId: 4, chatId: "chat-a" });
    expect(setChatLoadTarget(targeted, 3, "chat-b")).toBe(targeted);
    expect(completeChatLoad(targeted, 3, "chat-a")).toBe(targeted);
    expect(completeChatLoad(targeted, 4, "chat-b")).toBe(targeted);
    expect(completeChatLoad(targeted, 4, "chat-a")).toBeUndefined();
});

test("only the active request can cancel its load", () => {
    expect(cancelChatLoad(pending, 3)).toBe(pending);
    expect(cancelChatLoad(pending, 4)).toBeUndefined();
});
