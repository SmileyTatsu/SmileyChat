import defaultNovelAIModelCategories from "#frontend/data/default-novelai-models.json";

export const novelAIDefaultModels = defaultNovelAIModelCategories.flatMap(
    (category) => category.models,
);

export const novelAITextBaseUrl = "https://text.novelai.net";
export const novelAITextGenerationMaxOutputTokens = 250;

export const kayraLogitBias: Record<string, number> = {
    "23": -100,
    "21": -100,
};

export const eratoLogitBias: Record<string, number> = {
    "12488": -100,
    "128041": -100,
};

export function defaultNovelAIBaseUrlForModel(_modelId: string) {
    return novelAITextBaseUrl;
}

export function isDefaultNovelAIModel(modelId: string) {
    return novelAIDefaultModels.some((model) => model.id === modelId);
}

export function usesNovelAITextGenerationApi(modelId: string) {
    return modelId.includes("erato") || modelId.includes("kayra");
}
