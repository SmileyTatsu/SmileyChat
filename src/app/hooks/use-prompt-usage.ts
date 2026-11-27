import { useEffect, useRef, useState } from "preact/hooks";

export type PromptUsage = {
    budget: number;
    usedTokens: number;
};

type UsePromptUsageOptions = {
    chatId: string;
    /** Objects the estimate depends on; any identity change re-runs the build. */
    deps: readonly unknown[];
    enabled: boolean;
    load: () => Promise<PromptUsage | undefined>;
};

/** Settle time so streaming replies do not trigger a build per token. */
const debounceMs = 400;

/**
 * Estimates the tokens the next request would send, using the same compile
 * path as the Prompt Inspector. Runs off the click path and after the chat
 * settles, so the composer meter and the inspector always agree.
 */
export function usePromptUsage({
    chatId,
    deps,
    enabled,
    load,
}: UsePromptUsageOptions): PromptUsage | undefined {
    const loadRef = useRef(load);
    loadRef.current = load;
    const [usage, setUsage] = useState<(PromptUsage & { chatId: string }) | null>(null);

    useEffect(() => {
        if (!enabled || !chatId) {
            return undefined;
        }

        let cancelled = false;
        const timer = window.setTimeout(() => {
            void loadRef
                .current()
                .then((next) => {
                    if (!cancelled && next) {
                        setUsage({ chatId, ...next });
                    }
                })
                .catch(() => {
                    // The next message change retries; the meter stays hidden.
                });
        }, debounceMs);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [chatId, enabled, ...deps]);

    return usage && usage.chatId === chatId ? usage : undefined;
}
