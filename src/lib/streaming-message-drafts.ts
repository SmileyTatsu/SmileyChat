import { signal, type Signal } from "@preact/signals";

import type { ChatAttachment, Message } from "#frontend/types";

export type StreamingMessageDraft = {
    attachments?: ChatAttachment[];
    content?: string;
    reasoning?: string;
    reasoningDetails?: unknown;
    status?: Message["swipes"][number]["status"];
};

const streamingMessageDraftSignals = new Map<
    string,
    Signal<StreamingMessageDraft | undefined>
>();

export function setStreamingMessageContent(
    messageId: string,
    content: string,
    options: {
        reasoning?: string;
        reasoningDetails?: unknown;
        status?: Message["swipes"][number]["status"];
    } = {},
) {
    setStreamingMessageDraft(messageId, {
        content,
        ...(options.reasoning !== undefined ? { reasoning: options.reasoning } : {}),
        ...(options.reasoningDetails !== undefined
            ? { reasoningDetails: options.reasoningDetails }
            : {}),
        ...(options.status ? { status: options.status } : {}),
    });
}

export function setStreamingMessageReasoning(
    messageId: string,
    reasoning: string,
    reasoningDetails?: unknown,
) {
    setStreamingMessageDraft(messageId, {
        reasoning,
        ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
    });
}

export function setStreamingMessageAttachments(
    messageId: string,
    attachments: ChatAttachment[],
) {
    setStreamingMessageDraft(messageId, { attachments });
}

export function getStreamingMessageDraft(messageId: string) {
    return getStreamingMessageDraftSignal(messageId).peek();
}

export function getStreamingMessageDraftSignal(messageId: string) {
    let draftSignal = streamingMessageDraftSignals.get(messageId);

    if (!draftSignal) {
        draftSignal = signal<StreamingMessageDraft | undefined>(undefined);
        streamingMessageDraftSignals.set(messageId, draftSignal);
    }

    return draftSignal;
}

export function clearStreamingMessageDraft(messageId: string) {
    const draftSignal = streamingMessageDraftSignals.get(messageId);

    if (!draftSignal) {
        return;
    }

    draftSignal.value = undefined;
}

export function hasStreamingMessageDraftValue(draft: StreamingMessageDraft | undefined) {
    return Boolean(
        draft &&
        ((draft.content?.length ?? 0) > 0 ||
            (draft.reasoning?.length ?? 0) > 0 ||
            (draft.attachments?.length ?? 0) > 0 ||
            draft.status),
    );
}

function setStreamingMessageDraft(messageId: string, patch: StreamingMessageDraft) {
    const draftSignal = getStreamingMessageDraftSignal(messageId);

    draftSignal.value = {
        ...draftSignal.peek(),
        ...patch,
    };
}
