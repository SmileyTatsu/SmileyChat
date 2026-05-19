import { fetchProviderApi, trimTrailingSlash } from "../http";

import type { OpenAICompatibleListModelsResponse, OpenAICompatibleModel } from "./types";

export async function listOpenAICompatibleModels({
    apiKey,
    baseUrl,
}: {
    apiKey?: string;
    baseUrl: string;
}): Promise<OpenAICompatibleModel[]> {
    const targetUrl = `${trimTrailingSlash(baseUrl)}/models`;
    const headers: Record<string, string> = {};

    if (apiKey?.trim()) {
        headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    const data = await fetchProviderApi<OpenAICompatibleListModelsResponse>(targetUrl, {
        headers,
        errorPrefix: "OpenAI-compatible model list failed",
        displayUrl: targetUrl,
    });
    return data.data;
}
