import type { ComponentChildren } from "preact";

import { DeferredNumberInput } from "./deferred-number-input";

export function SettingField({
    children,
    description,
    label,
}: {
    children: ComponentChildren;
    description?: string;
    label: string;
}) {
    return (
        <div className="settings-field">
            <span>
                <strong>{label}</strong>
                {description && <small>{description}</small>}
            </span>
            {children}
        </div>
    );
}

export function ToggleRow({
    checked,
    className = "",
    description,
    label,
    labelClassName = "",
    onChange,
}: {
    checked: boolean;
    className?: string;
    description?: string;
    label: string;
    labelClassName?: string;
    onChange: (checked: boolean) => void;
}) {
    return (
        <label className={`setting-row preference-toggle-row ${className}`.trim()}>
            <span className={labelClassName || undefined}>
                <strong>{label}</strong>
                {description && <small>{description}</small>}
            </span>
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                    onChange((event.currentTarget as HTMLInputElement).checked)
                }
            />
        </label>
    );
}

export function NumberInput({
    max,
    min,
    step,
    value,
    onChange,
}: {
    max: number;
    min: number;
    step: number;
    value: number;
    onChange: (value: number) => void;
}) {
    return (
        <DeferredNumberInput
            className="settings-number-input"
            min={min}
            max={max}
            step={step}
            value={value}
            integer
            onCommit={(nextValue) => onChange(nextValue ?? value)}
        />
    );
}

export function SegmentedControl<T extends string>({
    ariaLabel,
    options,
    value,
    onChange,
}: {
    ariaLabel?: string;
    options: Array<{ value: T; label: string }>;
    value: T;
    onChange: (value: T) => void;
}) {
    return (
        <div
            aria-label={ariaLabel}
            className="settings-segmented-control"
            role={ariaLabel ? "group" : undefined}
            style={{
                gridTemplateColumns: `repeat(${options.length}, minmax(0, auto))`,
            }}
        >
            {options.map((option) => (
                <button
                    className={option.value === value ? "active" : ""}
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                >
                    <span>{option.label}</span>
                </button>
            ))}
        </div>
    );
}
