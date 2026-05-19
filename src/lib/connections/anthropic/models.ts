import { safeResponseText, trimTrailingSlash } from "../http";
import { createAnthropicHeaders } from "./adapter";
import type { AnthropicListModelsResponse, AnthropicModel } from "./types";

export async function listAnthropicModels({
    apiKey,
    baseUrl,
}: {
    apiKey?: string;
    baseUrl: string;
}): Promise<AnthropicModel[]> {
    const targetUrl = new URL(`${trimTrailingSlash(baseUrl)}/models`);
    targetUrl.searchParams.set("limit", "1000");
    const displayUrl = targetUrl.toString();
    const response = await fetch(displayUrl, {
        headers: createAnthropicHeaders({ apiKey }),
    });

    if (!response.ok) {
        throw new Error(
            `Anthropic model list failed at ${displayUrl}: ${response.status} ${await safeResponseText(response)}`,
        );
    }

    const data = (await response.json()) as AnthropicListModelsResponse;

    return data.data ?? [];
}
