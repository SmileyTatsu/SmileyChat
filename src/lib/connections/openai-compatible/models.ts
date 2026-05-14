import type { OpenAICompatibleListModelsResponse, OpenAICompatibleModel } from "./types";
import { safeResponseText, trimTrailingSlash } from "../http";

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

    const response = await fetch(targetUrl, {
        headers,
    });

    if (!response.ok) {
        throw new Error(
            `OpenAI-compatible model list failed at ${targetUrl}: ${response.status} ${await safeResponseText(response)}`,
        );
    }

    const data = (await response.json()) as OpenAICompatibleListModelsResponse;
    return data.data;
}
