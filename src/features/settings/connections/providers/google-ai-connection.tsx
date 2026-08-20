import defaultModelCategories from "#frontend/data/default-google-ai-models.json";
import { DeferredNumberInput } from "#frontend/features/settings/deferred-number-input";
import { parseDefaultThinkingLevel } from "#frontend/lib/connections/request-validation";
import type {
    GoogleAIConnectionConfig,
    GoogleAIModel,
    GoogleAIThinkingConfig,
    GoogleAIThinkingLevel,
} from "#frontend/lib/connections/google-ai/types";

import {
    ApiKeyField,
    BaseUrlField,
    CatalogModelField,
    ConnectionActions,
} from "./shared-fields";

type GoogleAIConnectionProps = {
    config: GoogleAIConnectionConfig;
    disabled?: boolean;
    modelLoadingDisabled?: boolean;
    models: GoogleAIModel[];
    onChange: (config: GoogleAIConnectionConfig) => void;
    onClearApiKey: () => void;
    onLoadModels: () => void;
    onTest: () => void;
};

type GoogleAICatalogModel = {
    id: string;
    label?: string;
    contextTokenLimit?: number;
    requestValidation?: {
        inputTokenLimit?: number;
        maxOutputTokens?: number | null;
        thinking?: {
            supported?: boolean;
            default?: string;
            levels?: GoogleAIThinkingLevel[];
        };
    };
};

const allThinkingLevels: GoogleAIThinkingLevel[] = ["minimal", "low", "medium", "high"];

const catalogModels: GoogleAICatalogModel[] = (
    defaultModelCategories as unknown as Array<{ models?: GoogleAICatalogModel[] }>
).flatMap((category) => category.models ?? []);

export function GoogleAIConnection({
    config,
    disabled,
    modelLoadingDisabled,
    models,
    onChange,
    onClearApiKey,
    onLoadModels,
    onTest,
}: GoogleAIConnectionProps) {
    function updateConfig(nextConfig: Partial<GoogleAIConnectionConfig>) {
        onChange({ ...config, ...nextConfig });
    }

    function updateThinking(nextThinking: Partial<GoogleAIThinkingConfig>) {
        updateConfig({
            thinking: {
                ...(config.thinking ?? {}),
                ...nextThinking,
            },
        });
    }

    const selectedCatalogModel = catalogModels.find(
        (model) => model.id === config.model.id,
    );
    const selectedApiModel = models.find(
        (model) => (model.baseModelId ?? model.name) === config.model.id,
    );

    const thinkingMeta = selectedCatalogModel?.requestValidation?.thinking;
    const supportedLevels =
        thinkingMeta?.supported !== false && thinkingMeta?.levels?.length
            ? thinkingMeta.levels
            : allThinkingLevels;

    return (
        <section className="connection-provider-panel">
            <h3>Google AI</h3>
            <BaseUrlField
                baseUrl={config.baseUrl}
                placeholder="https://generativelanguage.googleapis.com/v1beta"
                onChange={(baseUrl) => updateConfig({ baseUrl })}
            />
            <ApiKeyField
                apiKey={config.apiKey}
                disabled={disabled}
                onChange={(apiKey) => updateConfig({ apiKey })}
                onClear={onClearApiKey}
            />
            <CatalogModelField
                apiModels={models}
                defaultModelCategories={defaultModelCategories}
                disabled={disabled}
                modelLoadingDisabled={modelLoadingDisabled}
                model={config.model}
                onChange={(model) => {
                    const nextCatalogModel = catalogModels.find(
                        (candidate) => candidate.id === model.id,
                    );
                    const nextThinkingMeta =
                        nextCatalogModel?.requestValidation?.thinking;
                    let nextThinking = config.thinking;
                    if (
                        nextThinkingMeta?.levels?.length &&
                        config.thinking?.thinkingLevel &&
                        !nextThinkingMeta.levels.includes(config.thinking.thinkingLevel)
                    ) {
                        const parsed = parseDefaultThinkingLevel(
                            nextThinkingMeta.default,
                        );
                        const fallbackLevel =
                            parsed && nextThinkingMeta.levels.includes(parsed)
                                ? parsed
                                : nextThinkingMeta.levels[0];
                        nextThinking = {
                            ...config.thinking,
                            thinkingLevel: fallbackLevel,
                        };
                    }
                    updateConfig({
                        model,
                        ...(nextThinking !== config.thinking
                            ? { thinking: nextThinking }
                            : {}),
                    });
                }}
                onLoadModels={onLoadModels}
                getApiModelId={(model) => model.baseModelId ?? model.name}
                getApiModelLabel={modelLabel}
            />
            <label>
                Max output tokens
                <DeferredNumberInput
                    min={1}
                    step={1}
                    value={config.maxOutputTokens ?? 1000}
                    integer
                    onCommit={(maxOutputTokens) => updateConfig({ maxOutputTokens })}
                />
            </label>
            {(selectedCatalogModel || selectedApiModel) && (
                <dl className="openrouter-model-meta">
                    <div>
                        <dt>Input</dt>
                        <dd>
                            {selectedCatalogModel?.requestValidation?.inputTokenLimit?.toLocaleString() ??
                                selectedApiModel?.inputTokenLimit?.toLocaleString() ??
                                "Unknown"}
                        </dd>
                    </div>
                    <div>
                        <dt>Output</dt>
                        <dd>
                            {selectedCatalogModel?.requestValidation?.maxOutputTokens?.toLocaleString() ??
                                selectedApiModel?.outputTokenLimit?.toLocaleString() ??
                                "Unknown"}
                        </dd>
                    </div>
                    <div>
                        <dt>Thinking</dt>
                        <dd>{thinkingSupportLabel(thinkingMeta)}</dd>
                    </div>
                </dl>
            )}
            <fieldset className="connection-fieldset">
                <legend>Thinking</legend>
                <label className="checkbox-field">
                    <input
                        type="checkbox"
                        checked={config.thinking?.includeThoughts === true}
                        onInput={(event) =>
                            updateThinking({
                                includeThoughts: (event.currentTarget as HTMLInputElement)
                                    .checked,
                            })
                        }
                    />
                    Show thought summaries
                </label>
                <label>
                    Strategy
                    <select
                        value={config.thinking?.mode ?? "auto"}
                        onInput={(event) =>
                            updateThinking({
                                mode: (event.currentTarget as HTMLSelectElement)
                                    .value as GoogleAIThinkingConfig["mode"],
                            })
                        }
                    >
                        <option value="auto">Auto</option>
                        <option value="level">Gemini 3 level</option>
                        <option value="budget">Gemini 2.5 budget</option>
                    </select>
                </label>
                <label>
                    Thinking level
                    <select
                        value={
                            config.thinking?.thinkingLevel ??
                            (supportedLevels[0] || "low")
                        }
                        disabled={(config.thinking?.mode ?? "auto") !== "level"}
                        onInput={(event) =>
                            updateThinking({
                                thinkingLevel: (event.currentTarget as HTMLSelectElement)
                                    .value as GoogleAIThinkingConfig["thinkingLevel"],
                            })
                        }
                    >
                        {supportedLevels.map((lvl) => (
                            <option key={lvl} value={lvl}>
                                {levelLabel(lvl)}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Thinking budget
                    <DeferredNumberInput
                        step="1"
                        value={config.thinking?.thinkingBudget ?? -1}
                        disabled={(config.thinking?.mode ?? "auto") !== "budget"}
                        integer
                        optional
                        min={-1}
                        onCommit={(thinkingBudget) => updateThinking({ thinkingBudget })}
                    />
                </label>
            </fieldset>
            <ConnectionActions disabled={disabled} onTest={onTest} />
        </section>
    );
}

function modelLabel(model: GoogleAIModel) {
    const id = model.baseModelId ?? model.name;
    return model.displayName ? `${model.displayName} (${id})` : id;
}

function thinkingSupportLabel(thinkingMeta?: {
    supported?: boolean;
    default?: string;
    levels?: GoogleAIThinkingLevel[];
}) {
    if (!thinkingMeta) return "Supported";
    if (thinkingMeta.supported === false) return "Unsupported";
    const defaultText = thinkingMeta.default ? `Default: ${thinkingMeta.default}` : "";
    const levelsText = thinkingMeta.levels?.length
        ? `Levels: ${thinkingMeta.levels.join(", ")}`
        : "";
    if (defaultText && levelsText) {
        return `${defaultText} • ${levelsText}`;
    }
    return defaultText || levelsText || "Supported";
}

function levelLabel(level: GoogleAIThinkingLevel) {
    switch (level) {
        case "minimal":
            return "Minimal";
        case "low":
            return "Low";
        case "medium":
            return "Medium";
        case "high":
            return "High";
        default:
            return level;
    }
}
