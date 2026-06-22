import { useEffect, useMemo, useState } from "preact/hooks";

import type { SmileyPluginApi, PluginAppSnapshot } from "#frontend/lib/plugins/types";

import {
    clearChatSummaryState,
    getChatSummaryState,
    getSummarizerSettings,
    runSummarization,
    saveChatSummaryState,
    subscribeToSummaryCache,
    unsummarizedMessageCount,
} from "./daemon";
import { defaultSummaryState, type ChatSummaryState } from "./settings";

type SummarizerModalProps = {
    api: SmileyPluginApi;
    close: () => void;
    snapshot: PluginAppSnapshot | undefined;
};

export function SummarizerModal({ api, close, snapshot }: SummarizerModalProps) {
    const chatId = snapshot?.activeChat?.id ?? "";
    const [state, setState] = useState<ChatSummaryState>(
        chatId ? defaultSummaryState(chatId) : defaultSummaryState(""),
    );
    const [draft, setDraft] = useState("");
    const [status, setStatus] = useState("");

    useEffect(() => {
        let cancelled = false;

        async function load() {
            if (!chatId) {
                return;
            }

            const nextState = await getChatSummaryState(api, chatId);

            if (!cancelled) {
                setState(nextState);
                setDraft(nextState.summaryText);
            }
        }

        void load();
        const unsubscribe = subscribeToSummaryCache(() => void load());

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [api, chatId]);

    const unsummarized = useMemo(() => {
        if (!snapshot) {
            return 0;
        }

        return unsummarizedMessageCount(
            snapshot.messages,
            state,
            getSummarizerSettings(),
        );
    }, [snapshot, state]);

    async function saveDraft() {
        if (!chatId) {
            return;
        }

        const nextState = await saveChatSummaryState(api, chatId, {
            ...state,
            summaryText: draft,
            status: "idle",
            error: undefined,
        });
        setState(nextState);
        setStatus("Saved.");
    }

    async function regenerate(mode: "unsummarized" | "full") {
        if (!snapshot?.activeChat) {
            return;
        }

        setStatus(mode === "full" ? "Regenerating full summary..." : "Summarizing...");
        const nextState = await runSummarization(api, { mode, snapshot });
        setState(nextState);
        setDraft(nextState.summaryText);
        setStatus(nextState.status === "error" ? "Generation failed." : "Updated.");
    }

    async function clear() {
        if (!chatId) {
            return;
        }

        const nextState = await clearChatSummaryState(api, chatId);
        setState(nextState);
        setDraft("");
        setStatus("Cleared.");
    }

    const isGenerating = state.status === "generating";

    if (!chatId) {
        return (
            <section className="chs-modal">
                <div className="chs-empty">No active chat is available.</div>
            </section>
        );
    }

    return (
        <section className="chs-modal">
            <aside className="chs-summary-meta">
                <div>
                    <span>Status</span>
                    <strong className={state.status === "error" ? "error" : ""}>
                        {state.status}
                    </strong>
                </div>
                <div>
                    <span>Unsummarized</span>
                    <strong>{unsummarized}</strong>
                </div>
                <div>
                    <span>Characters</span>
                    <strong>{draft.length.toLocaleString()}</strong>
                </div>
                <div>
                    <span>Last run</span>
                    <strong>{state.lastSummarizedAt ?? "Never"}</strong>
                </div>
            </aside>

            {state.error && <div className="chs-error">{state.error}</div>}

            <label className="chs-modal-editor">
                <span>Summary</span>
                <textarea
                    value={draft}
                    disabled={isGenerating}
                    onInput={(event) => setDraft(event.currentTarget.value)}
                />
            </label>

            <footer className="chs-modal-actions">
                <button
                    type="button"
                    disabled={isGenerating}
                    title="Save your edits to this chat's stored summary."
                    onClick={saveDraft}
                >
                    Save
                </button>
                <button
                    type="button"
                    disabled={isGenerating || unsummarized === 0}
                    title="Update the summary using only messages after the last summarized message."
                    onClick={() => void regenerate("unsummarized")}
                >
                    Regenerate New
                </button>
                <button
                    type="button"
                    disabled={isGenerating}
                    title="Rebuild the summary from the current prompt-eligible chat messages."
                    onClick={() => void regenerate("full")}
                >
                    Regenerate Full
                </button>
                <button
                    type="button"
                    disabled={isGenerating}
                    title="Delete this chat's stored summary."
                    onClick={clear}
                >
                    Clear
                </button>
                <button
                    type="button"
                    title="Close this window without changing unsaved text."
                    onClick={close}
                >
                    Done
                </button>
            </footer>

            <p className="chs-status">{status}</p>
        </section>
    );
}
