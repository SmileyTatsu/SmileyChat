import { signal, type Signal } from "@preact/signals";

import type { Message, MessageToolActivity } from "#frontend/types";

export type StreamingMessageDraft = {
    content?: string;
    generatedImageCount?: number;
    reasoning?: string;
    reasoningDetails?: unknown;
    status?: Message["swipes"][number]["status"];
    toolActivities?: MessageToolActivity[];
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
        toolActivities?: MessageToolActivity[];
    } = {},
) {
    setStreamingMessageDraft(messageId, {
        content,
        ...(options.reasoning !== undefined ? { reasoning: options.reasoning } : {}),
        ...(options.reasoningDetails !== undefined
            ? { reasoningDetails: options.reasoningDetails }
            : {}),
        ...(options.status ? { status: options.status } : {}),
        ...(options.toolActivities ? { toolActivities: options.toolActivities } : {}),
    });
}

export function setStreamingToolActivities(
    messageId: string,
    toolActivities: MessageToolActivity[],
) {
    setStreamingMessageDraft(messageId, { toolActivities });
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

export function setStreamingGeneratedImageCount(messageId: string, count: number) {
    setStreamingMessageDraft(messageId, { generatedImageCount: Math.max(0, count) });
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
            (draft.generatedImageCount ?? 0) > 0 ||
            (draft.toolActivities?.length ?? 0) > 0 ||
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
