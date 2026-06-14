export const novelAIDefaultModels = [
    { id: "xialong-v1", label: "Xiaolong" },
    { id: "glm-4-6", label: "GLM 4.6" },
    { id: "llama-3-erato-v1", label: "Erato" },
    { id: "kayra-v1", label: "Kayra" },
    { id: "clio-v1", label: "Clio" },
] as const;

export const novelAITextBaseUrl = "https://text.novelai.net";
export const novelAILegacyBaseUrl = "https://api.novelai.net";

export const kayraLogitBias: Record<string, number> = {
    "23": -100,
    "21": -100,
};

export const eratoLogitBias: Record<string, number> = {
    "12488": -100,
    "128041": -100,
};

export function defaultNovelAIBaseUrlForModel(modelId: string) {
    return modelId === "xialong-v1" || modelId === "glm-4-6"
        ? novelAITextBaseUrl
        : novelAILegacyBaseUrl;
}

export function isDefaultNovelAIModel(modelId: string) {
    return novelAIDefaultModels.some((model) => model.id === modelId);
}
