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
const pendingStreamingDraftUpdates = new Map<
    string,
    {
        patch: StreamingMessageDraft;
        timeout: ReturnType<typeof setTimeout>;
    }
>();

// Keep streamed text responsive without repeatedly parsing a growing response for
// every SSE chunk. Thirty updates per second remains visually smooth while giving
// lower-powered devices time to paint and handle input.
const STREAMING_DRAFT_UPDATE_INTERVAL_MS = 33;

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

export function setStreamingMessageTimeline(
    messageId: string,
    timeline: SwipeTimelineEntry[],
) {
    setStreamingMessageDraft(messageId, { timeline });
}

export function setStreamingGeneratedImageCount(messageId: string, count: number) {
    setStreamingMessageDraft(messageId, { generatedImageCount: Math.max(0, count) });
}

export function getStreamingMessageDraft(messageId: string) {
    return streamingMessageDraftSignals.get(messageId)?.peek();
}

export function flushStreamingMessageDraft(messageId: string) {
    const pendingUpdate = pendingStreamingDraftUpdates.get(messageId);

    if (!pendingUpdate) {
        return;
    }

    clearTimeout(pendingUpdate.timeout);
    pendingStreamingDraftUpdates.delete(messageId);
    commitStreamingMessageDraft(messageId, pendingUpdate.patch);
}

export function findStreamingMessageDraftSignal(messageId: string) {
    return streamingMessageDraftSignals.get(messageId);
}

// Create the signal before rendering a new streaming message so its view can
// subscribe without creating signals for every historical message.
export function startStreamingMessageDraft(messageId: string) {
    return getStreamingMessageDraftSignal(messageId);
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
    const pendingUpdate = pendingStreamingDraftUpdates.get(messageId);

    if (pendingUpdate) {
        clearTimeout(pendingUpdate.timeout);
        pendingStreamingDraftUpdates.delete(messageId);
    }

    const draftSignal = streamingMessageDraftSignals.get(messageId);

    if (!draftSignal) {
        return;
    }

    draftSignal.value = undefined;
    streamingMessageDraftSignals.delete(messageId);
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
    const pendingUpdate = pendingStreamingDraftUpdates.get(messageId);

    if (pendingUpdate) {
        pendingUpdate.patch = {
            ...pendingUpdate.patch,
            ...patch,
        };
        return;
    }

    const timeout = setTimeout(() => {
        const scheduledUpdate = pendingStreamingDraftUpdates.get(messageId);

        if (!scheduledUpdate) {
            return;
        }

        pendingStreamingDraftUpdates.delete(messageId);
        commitStreamingMessageDraft(messageId, scheduledUpdate.patch);
    }, STREAMING_DRAFT_UPDATE_INTERVAL_MS);

    pendingStreamingDraftUpdates.set(messageId, { patch, timeout });
}

function commitStreamingMessageDraft(messageId: string, patch: StreamingMessageDraft) {
    const draftSignal = getStreamingMessageDraftSignal(messageId);

    draftSignal.value = {
        ...draftSignal.peek(),
        ...patch,
    };
}
