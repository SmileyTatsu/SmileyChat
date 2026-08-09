import type { JSX } from "preact";

import { estimateText } from "#frontend/lib/prompt/token-estimator";

type CountedTextareaProps = JSX.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function CountedTextarea({ value, ...props }: CountedTextareaProps) {
    const text = typeof value === "string" ? value : "";
    const tokenCount = estimateText(text);

    return (
        <div className="counted-textarea">
            <textarea value={value} {...props} />
            <output
                className="token-count"
                aria-label={`Estimated tokens: ${tokenCount}`}
            >
                {tokenCount ? `~${tokenCount} tokens` : "0 tokens"}
            </output>
        </div>
    );
}
