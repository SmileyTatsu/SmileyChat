import type { JSX } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";

import {
    activeTokenCountContext,
    estimateTextForContext,
    preloadTokenizer,
} from "#frontend/lib/tokenizer";

type CountedTextareaProps = JSX.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function CountedTextarea({ value, ...props }: CountedTextareaProps) {
    const text = typeof value === "string" ? value : "";
    const tokenContext = activeTokenCountContext.value;
    const contextKey = tokenContext
        ? `${tokenContext.provider}:${tokenContext.modelId}:${tokenContext.selection.mode}:${tokenContext.selection.algorithm ?? ""}`
        : "none";
    const [deferredText, setDeferredText] = useState(text);
    const [loadedContextKey, setLoadedContextKey] = useState("");

    useEffect(() => {
        const timeout = window.setTimeout(() => setDeferredText(text), 125);
        return () => window.clearTimeout(timeout);
    }, [text]);

    useEffect(() => {
        let cancelled = false;
        setLoadedContextKey("");

        if (!tokenContext) return undefined;

        void preloadTokenizer(tokenContext).finally(() => {
            if (!cancelled) setLoadedContextKey(contextKey);
        });

        return () => {
            cancelled = true;
        };
    }, [contextKey]);

    const count = useMemo(
        () =>
            estimateTextForContext(
                deferredText,
                loadedContextKey === contextKey ? tokenContext : undefined,
            ),
        [contextKey, deferredText, loadedContextKey],
    );
    const isCurrent = deferredText === text;
    const isExact = count.exact && isCurrent;
    const displayCount = count.tokens;

    return (
        <div className="counted-textarea">
            <textarea value={value} {...props} />
            <output
                className="token-count"
                aria-label={`${isExact ? "Tokens" : "Estimated tokens"}: ${displayCount}`}
            >
                {displayCount
                    ? `${isExact ? "" : "~"}${displayCount} tokens`
                    : "0 tokens"}
            </output>
        </div>
    );
}
