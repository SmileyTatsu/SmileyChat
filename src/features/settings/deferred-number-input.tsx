import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { cn } from "#frontend/lib/common/style";

type DeferredNumberInputProps = Omit<
    JSX.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onInput" | "onChange" | "onBlur" | "onKeyDown" | "type"
> & {
    value: number | undefined;
    onCommit: (value: number | undefined) => void;
    integer?: boolean;
    optional?: boolean;
};

/** Keeps temporary numeric edits out of persisted settings until the field is committed. */
export function DeferredNumberInput({
    value,
    onCommit,
    integer = false,
    optional = false,
    min,
    max,
    className,
    title,
    ...props
}: DeferredNumberInputProps) {
    const canonical = value === undefined ? "" : String(value);
    const [draft, setDraft] = useState(canonical);
    const [focused, setFocused] = useState(false);
    const [badInput, setBadInput] = useState(false);

    useEffect(() => {
        if (!focused) {
            setDraft(canonical);
            setBadInput(false);
        }
    }, [canonical, focused]);

    const parsed = Number(draft);
    const isInvalid = badInput || (draft.trim() !== "" && !Number.isFinite(parsed));

    function commit() {
        setFocused(false);
        if (badInput) {
            setDraft(canonical);
            return;
        }

        if (!draft.trim()) {
            if (optional) {
                onCommit(undefined);
            } else {
                setDraft(canonical);
            }
            return;
        }

        if (!Number.isFinite(parsed)) {
            setDraft(canonical);
            return;
        }

        const lower = typeof min === "number" ? min : -Infinity;
        const upper = typeof max === "number" ? max : Infinity;
        const next = Math.min(
            upper,
            Math.max(lower, integer ? Math.round(parsed) : parsed),
        );
        onCommit(next);
        setDraft(String(next));
    }

    return (
        <span className="deferred-number-wrap">
            <input
                {...props}
                type="number"
                min={min}
                max={max}
                value={draft}
                aria-invalid={isInvalid ? "true" : undefined}
                title={isInvalid ? "Please enter a valid number" : title}
                className={cn(className, isInvalid && "invalid-input")}
                onFocus={() => setFocused(true)}
                onInput={(event) => {
                    setDraft(event.currentTarget.value);
                    setBadInput(event.currentTarget.validity.badInput);
                }}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                    }
                }}
            />
            {isInvalid && (
                <span className="deferred-number-error" role="alert">
                    Invalid number
                </span>
            )}
        </span>
    );
}
