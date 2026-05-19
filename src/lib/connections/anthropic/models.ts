import { fetchProviderApi, trimTrailingSlash } from "../http";
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
    const data = await fetchProviderApi<AnthropicListModelsResponse>(displayUrl, {
        headers: createAnthropicHeaders({ apiKey }),
        errorPrefix: "Anthropic model list failed",
        displayUrl,
    });

    return data.data ?? [];
}
