import { fetchProviderApi, trimTrailingSlash } from "../http";

import { createXAIHeaders } from "./adapter";
import type { XAIListModelsResponse, XAIModel } from "./types";

export async function listXAIModels({
    apiKey,
    baseUrl,
}: {
    apiKey?: string;
    baseUrl: string;
}): Promise<XAIModel[]> {
    const targetUrl = `${trimTrailingSlash(baseUrl)}/models`;
    const data = await fetchProviderApi<XAIListModelsResponse>(targetUrl, {
        headers: createXAIHeaders({ apiKey }),
        errorPrefix: "xAI model list failed",
        displayUrl: targetUrl,
    });

    return data.data ?? [];
}
