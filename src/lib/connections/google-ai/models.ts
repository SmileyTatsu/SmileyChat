import { fetchProviderApi } from "../http";
import { normalizeGoogleAIBaseUrl } from "./config";

import type { GoogleAIListModelsResponse, GoogleAIModel } from "./types";

export async function listGoogleAIModels({
    apiKey,
    baseUrl,
}: {
    apiKey?: string;
    baseUrl: string;
}): Promise<GoogleAIModel[]> {
    const normalizedBaseUrl = normalizeGoogleAIBaseUrl(baseUrl);
    const displayUrl = `${normalizedBaseUrl}/models`;
    const data = await fetchProviderApi<GoogleAIListModelsResponse>(displayUrl, {
        errorPrefix: "Google AI model list failed",
        displayUrl,
        headers: apiKey?.trim() ? { "x-goog-api-key": apiKey.trim() } : undefined,
    });

    return (data.models ?? []).filter((model) =>
        model.supportedGenerationMethods?.includes("generateContent"),
    );
}
