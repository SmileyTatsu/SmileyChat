import type { PluginSettingField } from "#frontend/lib/plugins/types";
import {
    NumberInput,
    SettingField,
    ToggleRow,
} from "#frontend/features/settings/settings-controls";

export type DeclarativeSettingsFieldsProps = {
    fields: PluginSettingField[];
    values: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
    disabled?: boolean;
};

export function DeclarativeSettingsFields({
    fields,
    values,
    onChange,
    disabled = false,
}: DeclarativeSettingsFieldsProps) {
    return (
        <div className="declarative-plugin-settings">
            {fields.map((field) => {
                const isFieldDisabled = disabled || field.disabled === true;
                const value = values[field.key];

                switch (field.type) {
                    case "toggle":
                    case "checkbox":
                        return (
                            <ToggleRow
                                key={field.key}
                                checked={Boolean(value)}
                                label={field.label}
                                description={field.description}
                                disabled={isFieldDisabled}
                                onChange={(checked) => onChange(field.key, checked)}
                            />
                        );

                    case "number":
                        return (
                            <SettingField
                                key={field.key}
                                label={field.label}
                                description={field.description}
                            >
                                <NumberInput
                                    disabled={isFieldDisabled}
                                    integer={field.integer ?? false}
                                    min={field.min ?? 0}
                                    max={field.max ?? 10000}
                                    step={field.step ?? 1}
                                    value={Number(value ?? 0)}
                                    onChange={(num) => onChange(field.key, num)}
                                />
                            </SettingField>
                        );

                    case "textarea":
                        return (
                            <SettingField
                                key={field.key}
                                label={field.label}
                                description={field.description}
                            >
                                <textarea
                                    className="settings-textarea"
                                    rows={field.rows ?? 4}
                                    placeholder={field.placeholder}
                                    disabled={isFieldDisabled}
                                    value={String(value ?? "")}
                                    onInput={(event) =>
                                        onChange(
                                            field.key,
                                            (event.currentTarget as HTMLTextAreaElement)
                                                .value,
                                        )
                                    }
                                />
                            </SettingField>
                        );

                    case "select":
                        return (
                            <SettingField
                                key={field.key}
                                label={field.label}
                                description={field.description}
                            >
                                <select
                                    className="settings-select"
                                    disabled={isFieldDisabled}
                                    value={String(value ?? "")}
                                    onChange={(event) =>
                                        onChange(
                                            field.key,
                                            (event.currentTarget as HTMLSelectElement)
                                                .value,
                                        )
                                    }
                                >
                                    {field.options.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </SettingField>
                        );

                    case "text":
                    default:
                        return (
                            <SettingField
                                key={field.key}
                                label={field.label}
                                description={field.description}
                            >
                                <input
                                    type="text"
                                    className="settings-text-input"
                                    placeholder={field.placeholder}
                                    disabled={isFieldDisabled}
                                    value={String(value ?? "")}
                                    onInput={(event) =>
                                        onChange(
                                            field.key,
                                            (event.currentTarget as HTMLInputElement)
                                                .value,
                                        )
                                    }
                                />
                            </SettingField>
                        );
                }
            })}
        </div>
    );
}
