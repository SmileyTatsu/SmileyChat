import { useEffect, useState } from "preact/hooks";

import type { ChatSaveState } from "#frontend/lib/chats/types";

type ComposerStatusProps = {
    saveState?: ChatSaveState;
};

export function ComposerStatus({ saveState }: ComposerStatusProps) {
    const [, setTick] = useState(0);

    useEffect(() => {
        if (saveState?.status !== "saved") {
            return undefined;
        }

        const timer = window.setInterval(() => setTick((value) => value + 1), 10_000);
        return () => window.clearInterval(timer);
    }, [saveState?.status, saveState?.savedAt]);

    if (!saveState || saveState.status === "idle") {
        return null;
    }

    if (saveState.status === "error") {
        return (
            <span
                className="composer-save-state"
                data-state="error"
                title={saveState.error}
                role="status"
            >
                Not saved
            </span>
        );
    }

    return (
        <span
            className="composer-save-state"
            data-state={saveState.status}
            aria-live="polite"
            role="status"
        >
            {saveState.status === "saved" ? formatSavedAt(saveState.savedAt) : "Saving…"}
        </span>
    );
}

function formatSavedAt(savedAt?: number) {
    if (!savedAt) {
        return "Saved";
    }

    const seconds = Math.max(0, Math.round((Date.now() - savedAt) / 1000));

    if (seconds < 5) {
        return "Saved";
    }

    if (seconds < 60) {
        return `Saved ${seconds}s ago`;
    }

    const minutes = Math.round(seconds / 60);

    if (minutes < 60) {
        return `Saved ${minutes}m ago`;
    }

    return `Saved ${Math.round(minutes / 60)}h ago`;
}
