import { fetchProviderApi, trimTrailingSlash } from "../http";

import type { GoogleAIListModelsResponse, GoogleAIModel } from "./types";

export async function listGoogleAIModels({
    apiKey,
    baseUrl,
}: {
    apiKey?: string;
    baseUrl: string;
}): Promise<GoogleAIModel[]> {
    const displayUrl = `${trimTrailingSlash(baseUrl)}/models`;
    const targetUrl = withApiKey(displayUrl, apiKey);
    const data = await fetchProviderApi<GoogleAIListModelsResponse>(targetUrl, {
        errorPrefix: "Google AI model list failed",
        displayUrl,
    });

    return (data.models ?? []).filter((model) =>
        model.supportedGenerationMethods?.includes("generateContent"),
    );
}

function withApiKey(url: string, apiKey: string | undefined) {
    if (!apiKey?.trim()) {
        return url;
    }

    const target = new URL(url);
    target.searchParams.set("key", apiKey.trim());
    return target.toString();
}
