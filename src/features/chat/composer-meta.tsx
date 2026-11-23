import { useEffect, useState } from "preact/hooks";

import type { ChatSaveState } from "#frontend/lib/chats/types";

import { ContextMeter } from "./context-meter";

type ComposerMetaProps = {
    contextUsage?: { budget: number; usedTokens: number };
    saveState?: ChatSaveState;
};

/** How long "Saved" keeps the slot before the context meter takes it back. */
const SAVED_VISIBLE_MS = 5_000;

/**
 * One slot, one message. While a save is pending, running, or just finished it
 * owns the space; the rest of the time the context meter does. Keeping a single
 * inline slot avoids a second composer row that is empty almost always.
 */
export function ComposerMeta({ contextUsage, saveState }: ComposerMetaProps) {
    const [, setTick] = useState(0);
    const status = saveState?.status ?? "idle";
    const savedAt = saveState?.savedAt ?? 0;

    useEffect(() => {
        if (status !== "saved") {
            return undefined;
        }

        // Re-render once the "Saved" window closes so the meter returns.
        const timer = window.setTimeout(
            () => setTick((value) => value + 1),
            SAVED_VISIBLE_MS,
        );
        return () => window.clearTimeout(timer);
    }, [status, savedAt]);

    if (status === "error") {
        return (
            <span
                className="composer-save-state"
                data-state="error"
                title={saveState?.error}
                role="status"
            >
                Not saved
            </span>
        );
    }

    if (status === "saving" || status === "pending") {
        return (
            <span
                className="composer-save-state"
                data-state={status}
                aria-live="polite"
                role="status"
            >
                Saving…
            </span>
        );
    }

    if (status === "saved" && Date.now() - savedAt < SAVED_VISIBLE_MS) {
        return (
            <span
                className="composer-save-state"
                data-state="saved"
                aria-live="polite"
                role="status"
            >
                Saved
            </span>
        );
    }

    if (!contextUsage || contextUsage.usedTokens <= 0) {
        return null;
    }

    return (
        <ContextMeter budget={contextUsage.budget} usedTokens={contextUsage.usedTokens} />
    );
}
