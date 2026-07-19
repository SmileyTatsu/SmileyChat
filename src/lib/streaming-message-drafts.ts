import { signal, type Signal } from "@preact/signals";

import type { Message, MessageToolActivity, SwipeTimelineEntry } from "#frontend/types";

export type StreamingMessageDraft = {
    content?: string;
    generatedImageCount?: number;
    reasoning?: string;
    reasoningDetails?: unknown;
    status?: Message["swipes"][number]["status"];
    toolActivities?: MessageToolActivity[];
    timeline?: SwipeTimelineEntry[];
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

export function setStreamingMessageTimeline(
    messageId: string,
    timeline: SwipeTimelineEntry[],
) {
    setStreamingMessageDraft(messageId, { timeline });
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
            (draft.timeline?.length ?? 0) > 0 ||
            draft.status),
    );
}

export function applyStreamingMessageDraft(
    message: Message,
    draft: StreamingMessageDraft | undefined,
) {
    if (!draft) return message;

    const activeSwipe = message.swipes[message.activeSwipeIndex] ?? message.swipes[0];
    if (!activeSwipe) return message;

    return {
        ...message,
        swipes: message.swipes.map((swipe, index) =>
            index === message.activeSwipeIndex
                ? {
                      ...swipe,
                      ...(draft.content !== undefined ? { content: draft.content } : {}),
                      ...(draft.reasoning !== undefined
                          ? { reasoning: draft.reasoning }
                          : {}),
                      ...(draft.reasoningDetails !== undefined
                          ? { reasoningDetails: draft.reasoningDetails }
                          : {}),
                      ...(draft.status ? { status: draft.status } : {}),
                      ...(draft.toolActivities
                          ? { toolActivities: draft.toolActivities }
                          : {}),
                      ...(draft.timeline ? { timeline: draft.timeline } : {}),
                  }
                : swipe,
        ),
    };
}

function setStreamingMessageDraft(messageId: string, patch: StreamingMessageDraft) {
    const draftSignal = getStreamingMessageDraftSignal(messageId);

    draftSignal.value = {
        ...draftSignal.peek(),
        ...patch,
    };
}
