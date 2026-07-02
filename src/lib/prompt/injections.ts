import type { ChatGenerationMessage } from "../connections/types";
import { promptInjectionToMessage, sortPromptInjections } from "./outlets";
import type { PromptAnchor, PromptInjection } from "./types";

type AnchoredPromptMessage = {
    anchor?: PromptAnchor;
    injectionId?: string;
    injectionOrder?: number;
    injectionPriority?: number;
    messageId?: string;
    message: ChatGenerationMessage;
    promptId?: string;
    source: "history" | "injection" | "preset";
    tokenBudgetBehavior?: PromptInjection["tokenBudgetBehavior"];
};

export function applyPromptInjections(
    messages: AnchoredPromptMessage[],
    injections: PromptInjection[],
) {
    return applyPromptInjectionsWithMetadata(messages, injections).map(
        (item) => item.message,
    );
}

export function applyPromptInjectionsWithMetadata(
    messages: AnchoredPromptMessage[],
    injections: PromptInjection[],
) {
    const output = [...messages];
    const automaticInjections = sortPromptInjections(
        injections.filter((injection) => injection.anchor !== "outlet"),
    );

    for (const injection of automaticInjections) {
        insertPromptInjection(output, injection);
    }

    return output;
}

function insertPromptInjection(
    messages: AnchoredPromptMessage[],
    injection: PromptInjection,
) {
    const message = {
        injectionId: injection.id,
        injectionOrder: injection.order,
        injectionPriority: injection.priority,
        message: promptInjectionToMessage(injection),
        source: "injection" as const,
        tokenBudgetBehavior: injection.tokenBudgetBehavior,
    };

    if (injection.anchor === "at-depth") {
        messages.splice(atDepthIndex(messages, injection.depth ?? 0), 0, message);
        return;
    }

    const targetIndex = anchorTargetIndex(messages, injection.anchor);

    if (targetIndex < 0) {
        messages.push(message);
        return;
    }

    if (isBeforeAnchor(injection.anchor)) {
        messages.splice(targetIndex, 0, message);
    } else {
        messages.splice(targetIndex + 1, 0, message);
    }
}

function anchorTargetIndex(messages: AnchoredPromptMessage[], anchor: PromptAnchor) {
    switch (anchor) {
        case "before-character":
        case "after-character":
            return messages.findIndex((item) => item.anchor === "after-character");
        case "before-examples":
        case "after-examples":
            return firstMatchingAnchorIndex(messages, [
                "before-examples",
                "after-examples",
            ]);
        case "before-scenario":
        case "after-scenario":
            return messages.findIndex((item) => item.anchor === "after-scenario");
        case "before-history":
            return firstHistoryIndex(messages);
        case "after-history":
            return lastHistoryIndex(messages);
        default:
            return -1;
    }
}

function firstMatchingAnchorIndex(
    messages: AnchoredPromptMessage[],
    anchors: PromptAnchor[],
) {
    const index = messages.findIndex(
        (item) => item.anchor !== undefined && anchors.includes(item.anchor),
    );

    if (index >= 0) {
        return index;
    }

    return messages.findIndex((item) => item.anchor === "after-character");
}

function firstHistoryIndex(messages: AnchoredPromptMessage[]) {
    const index = messages.findIndex((item) => item.source === "history");
    return index >= 0 ? index : messages.length;
}

function lastHistoryIndex(messages: AnchoredPromptMessage[]) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].source === "history") {
            return index;
        }
    }

    return messages.length - 1;
}

function atDepthIndex(messages: AnchoredPromptMessage[], depth: number) {
    const historyIndexes = messages
        .map((message, index) => (message.source === "history" ? index : -1))
        .filter((index) => index >= 0);

    if (historyIndexes.length === 0) {
        return messages.length;
    }

    const safeDepth = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0;

    if (safeDepth === 0) {
        return historyIndexes[historyIndexes.length - 1] + 1;
    }

    return historyIndexes[Math.max(0, historyIndexes.length - safeDepth)];
}

function isBeforeAnchor(anchor: PromptAnchor) {
    return (
        anchor === "before-character" ||
        anchor === "before-examples" ||
        anchor === "before-scenario" ||
        anchor === "before-history"
    );
}

export type { AnchoredPromptMessage };
