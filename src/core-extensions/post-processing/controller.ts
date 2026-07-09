import type { SmileyPluginApi } from "#frontend/lib/plugins/types";

import { buildBudgetedPassMessages, type PipelineEngineContext } from "./engine";
import { PostProcessingModal } from "./modal";
import {
    activePipeline,
    defaultPostProcessingSettings,
    normalizePostProcessingSettings,
    type PostProcessingSettings,
} from "./settings";

export type PipelineRunMode = "auto" | "manual";
export type PipelinePassSnapshot = {
    passId: string;
    passName: string;
    input: string;
    output: string;
    error?: string;
};

export type PipelineRunState =
    | {
          status: "idle";
      }
    | {
          status: "running";
          currentPassIndex: number;
          error?: string;
          mode: PipelineRunMode;
          originalText: string;
          passCount: number;
          passName: string;
          runId: string;
          snapshots: PipelinePassSnapshot[];
          streamedText: string;
      }
    | {
          status: "review";
          error?: string;
          finalText: string;
          mode: PipelineRunMode;
          originalText: string;
          runId: string;
          snapshots: PipelinePassSnapshot[];
      };

export type PipelineRunResult = {
    accepted: boolean;
    text: string;
};

type RunOptions = {
    context: PipelineEngineContext;
    mode: PipelineRunMode;
    originalText: string;
};

type ReviewResolver = (result: PipelineRunResult) => void;
type RunListener = () => void;

const listeners = new Set<RunListener>();
let settingsCache = defaultPostProcessingSettings();
let runState: PipelineRunState = { status: "idle" };
let activeAbortController: AbortController | undefined;
let activeReviewResolver: ReviewResolver | undefined;
let activeModalClose: (() => void) | undefined;
let latestAcceptedText = "";

export async function loadPostProcessingSettings(api: SmileyPluginApi) {
    settingsCache = normalizePostProcessingSettings(
        await api.storage.getJson("settings", settingsCache).catch(() => settingsCache),
    );
    notifyRunChanged();
    return settingsCache;
}

export function getPostProcessingSettings() {
    return settingsCache;
}

export async function savePostProcessingSettings(
    api: SmileyPluginApi,
    value: PostProcessingSettings,
) {
    settingsCache = normalizePostProcessingSettings(value);
    await api.storage.setJson("settings", settingsCache);
    notifyRunChanged();
    return settingsCache;
}

export function getPipelineRunState() {
    return runState;
}

export function subscribeToPipelineRun(listener: RunListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getLatestAcceptedText() {
    return latestAcceptedText;
}

export function isPipelineRunning() {
    return runState.status === "running" || runState.status === "review";
}

export async function runPipeline(
    api: SmileyPluginApi,
    options: RunOptions,
): Promise<PipelineRunResult> {
    if (isPipelineRunning()) {
        return { accepted: false, text: options.originalText };
    }

    const pipeline = activePipeline(settingsCache);
    const passes = (pipeline?.passes ?? []).filter((pass) => pass.enabled);

    if (passes.length === 0) {
        return { accepted: true, text: options.originalText };
    }

    const runId = `post-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const snapshots: PipelinePassSnapshot[] = [];
    let currentText = options.originalText;
    let fallbackText = options.originalText;
    let runError = "";

    activeAbortController = new AbortController();
    openPipelineModal(api);

    try {
        for (let index = 0; index < passes.length; index += 1) {
            const pass = passes[index];
            let streamedText = "";

            setRunState({
                status: "running",
                currentPassIndex: index,
                mode: options.mode,
                originalText: options.originalText,
                passCount: passes.length,
                passName: pass.name,
                runId,
                snapshots,
                streamedText,
            });

            const profileRequest = pass.profileId ? { profileId: pass.profileId } : {};
            const messages = buildBudgetedPassMessages(
                api,
                pass,
                currentText,
                options.context,
                api.model.getContextBudget(profileRequest),
            );
            const result = await api.model.generate({
                messages,
                ...(pass.modelId.trim() ? { modelId: pass.modelId } : {}),
                ...(pass.presetId ? { presetId: pass.presetId } : {}),
                ...(pass.profileId ? { profileId: pass.profileId } : {}),
                signal: activeAbortController.signal,
                stream: pass.stream,
                onToken: pass.stream
                    ? (token) => {
                          streamedText += token;
                          setRunState({
                              status: "running",
                              currentPassIndex: index,
                              mode: options.mode,
                              originalText: options.originalText,
                              passCount: passes.length,
                              passName: pass.name,
                              runId,
                              snapshots,
                              streamedText,
                          });
                      }
                    : undefined,
            });
            const output = result.message.trim();

            snapshots.push({
                passId: pass.id,
                passName: pass.name,
                input: currentText,
                output,
            });
            currentText = output || currentText;
            fallbackText = currentText;
        }
    } catch (error) {
        if (isAbortError(error)) {
            return finishRun({ accepted: false, text: options.originalText });
        }

        runError =
            error instanceof Error ? error.message : "Post-processing pass failed.";
        snapshots.push({
            passId: "error",
            passName: "Pipeline stopped",
            input: currentText,
            output: fallbackText,
            error: runError,
        });
    }

    if (!settingsCache.showDiff) {
        return finishRun({ accepted: true, text: fallbackText });
    }

    setRunState({
        status: "review",
        error: runError || undefined,
        finalText: fallbackText,
        mode: options.mode,
        originalText: options.originalText,
        runId,
        snapshots,
    });

    return new Promise((resolve) => {
        activeReviewResolver = (result) => {
            resolve(finishRun(result));
        };
    });
}

export function acceptPipelineReview(text: string) {
    const resolver = activeReviewResolver;

    if (!resolver) {
        return;
    }

    activeReviewResolver = undefined;
    resolver({ accepted: true, text });
}

export function rejectPipelineReview() {
    const resolver = activeReviewResolver;
    const originalText =
        runState.status === "review" ? runState.originalText : latestAcceptedText;

    if (!resolver) {
        return;
    }

    activeReviewResolver = undefined;
    resolver({ accepted: false, text: originalText });
}

export function truncatePipelineReviewFrom(snapshotIndex: number) {
    if (runState.status !== "review") {
        return;
    }

    if (
        !Number.isInteger(snapshotIndex) ||
        snapshotIndex < 0 ||
        snapshotIndex >= runState.snapshots.length
    ) {
        return;
    }

    const nextSnapshots = runState.snapshots.slice(0, snapshotIndex);
    const finalText =
        nextSnapshots[nextSnapshots.length - 1]?.output ?? runState.originalText;

    setRunState({
        ...runState,
        error: undefined,
        finalText,
        snapshots: nextSnapshots,
    });
}

export function cancelPipelineRun() {
    activeAbortController?.abort();

    if (activeReviewResolver) {
        rejectPipelineReview();
        return;
    }

    finishRun({ accepted: false, text: "" });
}

function openPipelineModal(api: SmileyPluginApi) {
    if (activeModalClose) {
        return;
    }

    activeModalClose = api.ui.openModal({
        id: "post-processing",
        title: "Post Processing",
        onClose: () => {
            activeModalClose = undefined;
            cancelPipelineRun();
        },
        render: ({ close }) => {
            return api.ui.h(PostProcessingModal, { close });
        },
    });
}

function finishRun(result: PipelineRunResult) {
    if (result.accepted) {
        latestAcceptedText = result.text;
    }

    const close = activeModalClose;
    activeAbortController = undefined;
    activeReviewResolver = undefined;
    activeModalClose = undefined;
    setRunState({ status: "idle" });
    close?.();

    return result;
}

function setRunState(nextState: PipelineRunState) {
    runState = nextState;
    notifyRunChanged();
}

function notifyRunChanged() {
    for (const listener of listeners) {
        listener();
    }
}

function isAbortError(error: unknown) {
    return (
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError")
    );
}
