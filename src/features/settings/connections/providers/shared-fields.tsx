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
    }>;
};

type CatalogModelFieldProps<TModel> = {
    apiModels: TModel[];
    defaultModelCategories: DefaultModelCategory[];
    disabled?: boolean;
    model: CatalogModelSelection;
    onChange: (model: CatalogModelSelection) => void;
    onLoadModels: () => void;
    getApiModelId: (model: TModel) => string;
    getApiModelLabel: (model: TModel) => string;
};

type ConnectionActionsProps = {
    disabled?: boolean;
    onSave: () => void;
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

export function ApiKeyField({
    apiKey,
    disabled,
    onChange,
    onClear,
}: ApiKeyFieldProps) {
    return (
        <label>
            API key
            <div className="inline-field-row">
                <input
                    value={apiKey ?? ""}
                    type="password"
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
    model,
    onChange,
    onLoadModels,
    getApiModelId,
    getApiModelLabel,
}: CatalogModelFieldProps<TModel>) {
    const selectedModelValue =
        model.source === "custom" ? "custom:" : `${model.source}:${model.id}`;
    const hasLoadedApiModels = apiModels.length > 0;
    const savedApiModelId =
        !hasLoadedApiModels && model.source === "api" && model.id.length > 0
            ? model.id
            : null;

    function updateSelectedModel(value: string) {
        const separatorIndex = value.indexOf(":");
        const source = value.slice(0, separatorIndex);
        const id = value.slice(separatorIndex + 1);

        if (source === "api") {
            onChange({ source: "api", id });
            return;
        }

        if (source === "custom") {
            onChange({
                source: "custom",
                id: model.source === "custom" ? model.id : "",
            });
            return;
        }

        onChange({ source: "default", id });
    }

    return (
        <>
            <div className="inline-field-row">
                <label>
                    Model
                    <select
                        value={selectedModelValue}
                        onInput={(event) =>
                            updateSelectedModel(
                                (event.currentTarget as HTMLSelectElement).value,
                            )
                        }
                    >
                        {hasLoadedApiModels ? (
                            <optgroup label="Loaded from API">
                                {apiModels.map((apiModel) => {
                                    const id = getApiModelId(apiModel);

                                    return (
                                        <option key={id} value={`api:${id}`}>
                                            {getApiModelLabel(apiModel)}
                                        </option>
                                    );
                                })}
                            </optgroup>
                        ) : savedApiModelId ? (
                            <optgroup label="Loaded from API">
                                <option value={`api:${savedApiModelId}`}>
                                    {savedApiModelId}
                                </option>
                            </optgroup>
                        ) : (
                            <>
                                {defaultModelCategories.map((category) => (
                                    <optgroup key={category.id} label={category.label}>
                                        {category.models.map((defaultModel) => (
                                            <option
                                                key={defaultModel.id}
                                                value={`default:${defaultModel.id}`}
                                            >
                                                {defaultModel.label}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                                <optgroup label="Loaded from API">
                                    <option disabled value="api:">
                                        Load models to fill this category
                                    </option>
                                </optgroup>
                            </>
                        )}
                        <option value="custom:">Custom model...</option>
                    </select>
                </label>
                <button type="button" disabled={disabled} onClick={onLoadModels}>
                    Load
                </button>
            </div>
            <label>
                Custom model
                <input
                    disabled={model.source !== "custom"}
                    value={model.source === "custom" ? model.id : ""}
                    placeholder="Use when the endpoint does not list models"
                    onInput={(event) =>
                        onChange({
                            source: "custom",
                            id: (event.currentTarget as HTMLInputElement).value,
                        })
                    }
                />
            </label>
        </>
    );
}

export function ConnectionActions({
    disabled,
    onSave,
    onTest,
}: ConnectionActionsProps) {
    return (
        <div className="connection-actions">
            <button type="button" disabled={disabled} onClick={onSave}>
                Save
            </button>
            <button type="button" disabled={disabled} onClick={onTest}>
                Test connection
            </button>
        </div>
    );
}
