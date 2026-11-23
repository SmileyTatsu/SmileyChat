import { useEffect, useState } from "preact/hooks";

import { estimateMessage } from "#frontend/lib/prompt/token-estimator";
import { activeTokenCountContext } from "#frontend/lib/tokenizer";
import type { Message } from "#frontend/types";

const tokenCache = new WeakMap<Message, { key: string; tokens: number }>();
const batchSize = 40;
const debounceMs = 400;

/**
 * Estimates how many tokens the visible chat history occupies. Long chats are
 * counted in small batches so opening one never blocks the first paint, and
 * per-message results are cached by object identity, so streaming a reply only
 * recounts the message that changed.
 */
export function useContextUsage(messages: Message[], contextKey: string) {
    const [usedTokens, setUsedTokens] = useState(0);

    useEffect(() => {
        const context = activeTokenCountContext.value;
        let cancelled = false;
        let timer: number | undefined;
        let index = 0;
        let total = 0;

        function step() {
            if (cancelled) {
                return;
            }

            const end = Math.min(index + batchSize, messages.length);

            for (; index < end; index += 1) {
                const message = messages[index];

                if (!message) {
                    continue;
                }

                const key = `${contextKey}:${message.activeSwipeIndex}`;
                const cached = tokenCache.get(message);

                if (cached?.key === key) {
                    total += cached.tokens;
                    continue;
                }

                const tokens = estimateMessage(message, context);
                tokenCache.set(message, { key, tokens });
                total += tokens;
            }

            setUsedTokens(total);

            if (index < messages.length) {
                timer = window.setTimeout(step, 0);
            }
        }

        timer = window.setTimeout(step, debounceMs);

        return () => {
            cancelled = true;

            if (timer !== undefined) {
                window.clearTimeout(timer);
            }
        };
    }, [messages, contextKey]);

    return usedTokens;
}
