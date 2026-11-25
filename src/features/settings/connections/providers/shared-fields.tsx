import type { JSX } from "preact";

import { formatContextTokens } from "../model-picker/format";
import { ModelPicker } from "../model-picker/model-picker";
import { groupOfModelId } from "../model-picker/search";
import type { ModelPickerContext, ModelPickerItem } from "../model-picker/types";

/**
 * Model pickers render their popover inside the field's <label>. Without this
 * guard a click on a popover row, section or hint would also click the trigger
 * button (a label forwards clicks to its control) and toggle the list closed.
 */
export function preventLabelClickThrough(
    event: JSX.TargetedMouseEvent<HTMLLabelElement>,
) {
    const target = event.target as HTMLElement | null;

    if (
        target === event.currentTarget ||
        target?.closest("button, input, select, textarea, a")
    ) {
        return;
    }

    event.preventDefault();
}

type ApiKeyFieldProps = {
    apiKey?: string;
    disabled?: boolean;
    onChange: (apiKey: string) => void;
    onClear: () => void;
};

type BaseUrlFieldProps = {
    baseUrl: string;
    placeholder: string;
    onChange: (baseUrl: string) => void;
};

type CatalogModelSelection =
    | {
          source: "default";
          id: string;
      }
    | {
          source: "api";
          id: string;
      }
    | {
          source: "custom";
          id: string;
      };

type DefaultModelCategory = {
    id: string;
    label: string;
    models: Array<{
        id: string;
        label: string;
        contextTokenLimit?: number;
    }>;
};

type CatalogModelFieldProps<TModel> = {
    apiModels: TModel[];
    defaultModelCategories: DefaultModelCategory[];
    disabled?: boolean;
    modelLoadingDisabled?: boolean;
    model: CatalogModelSelection;
    modelPicker: ModelPickerContext;
    onChange: (model: CatalogModelSelection) => void;
    onLoadModels: () => void;
    getApiModelId: (model: TModel) => string;
    getApiModelLabel: (model: TModel) => string;
};

type ConnectionActionsProps = {
    disabled?: boolean;
    onTest: () => void;
};

export function BaseUrlField({ baseUrl, placeholder, onChange }: BaseUrlFieldProps) {
    return (
        <label>
            Base URL
            <input
                value={baseUrl}
                placeholder={placeholder}
                onInput={(event) =>
                    onChange((event.currentTarget as HTMLInputElement).value)
                }
            />
        </label>
    );
}

export function ApiKeyField({ apiKey, disabled, onChange, onClear }: ApiKeyFieldProps) {
    return (
        <label>
            API key
            <div className="inline-field-row">
                <input
                    value={apiKey ?? ""}
                    type="password"
                    inputMode="text"
                    autoCapitalize="off"
                    autoComplete="off"
                    autoCorrect="off"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-form-type="other"
                    data-lpignore="true"
                    placeholder="Saved to userData/settings/connection-secrets.json"
                    onInput={(event) =>
                        onChange((event.currentTarget as HTMLInputElement).value)
                    }
                />
                <button
                    type="button"
                    disabled={disabled || !apiKey?.trim()}
                    onClick={onClear}
                >
                    Clear
                </button>
            </div>
        </label>
    );
}

export function CatalogModelField<TModel>({
    apiModels,
    defaultModelCategories,
    disabled,
    modelLoadingDisabled,
    model,
    modelPicker,
    onChange,
    onLoadModels,
    getApiModelId,
    getApiModelLabel,
}: CatalogModelFieldProps<TModel>) {
    const items: ModelPickerItem[] = [];
    const defaultModelIds = new Set<string>();
    const itemIds = new Set<string>();

    for (const category of defaultModelCategories) {
        for (const defaultModel of category.models) {
            if (itemIds.has(defaultModel.id)) {
                continue;
            }

            defaultModelIds.add(defaultModel.id);
            itemIds.add(defaultModel.id);
            items.push({
                id: defaultModel.id,
                label: defaultModel.label,
                group: category.label,
                meta: formatContextTokens(defaultModel.contextTokenLimit),
            });
        }
    }

    const apiModelIds = new Set<string>();

    for (const apiModel of apiModels) {
        const id = getApiModelId(apiModel);

        if (!id) {
            continue;
        }

        apiModelIds.add(id);

        if (itemIds.has(id)) {
            continue;
        }

        itemIds.add(id);
        items.push({
            id,
            label: getApiModelLabel(apiModel),
            group: groupOfModelId(id),
        });
    }

    // A saved model can be missing from both lists, e.g. an API id stored before
    // Load ran. Keep it in the list so the trigger can show the current selection.
    if (model.id && !itemIds.has(model.id)) {
        items.push({
            id: model.id,
            label: model.id,
            group: "Current",
        });
    }

    function selectModel(id: string) {
        if (!id) {
            return;
        }

        onChange(
            defaultModelIds.has(id)
                ? { source: "default", id }
                : apiModelIds.has(id)
                  ? { source: "api", id }
                  : { source: "custom", id },
        );
        modelPicker.onModelUsed(id);
    }

    return (
        <div className="inline-field-row">
            <label onClick={preventLabelClickThrough}>
                Model
                <ModelPicker
                    disabled={disabled}
                    emptyHint="Press Load to fetch the models from this endpoint."
                    favorites={modelPicker.favorites}
                    items={items}
                    limit={modelPicker.limit}
                    placeholder="Select a model"
                    recent={modelPicker.recent}
                    value={model.id}
                    onSelect={selectModel}
                    onToggleFavorite={modelPicker.onToggleFavorite}
                />
            </label>
            <button
                type="button"
                disabled={disabled || modelLoadingDisabled}
                onClick={onLoadModels}
                title={
                    modelLoadingDisabled
                        ? "Load models on the computer running SmileyChat."
                        : undefined
                }
            >
                Load
            </button>
        </div>
    );
}

export function ConnectionActions({ disabled, onTest }: ConnectionActionsProps) {
    return (
        <div className="connection-actions">
            <button type="button" disabled={disabled} onClick={onTest}>
                Test connection
            </button>
        </div>
    );
}
