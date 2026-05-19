import { fetchProviderApi } from "../http";

import { createOpenRouterHeaders } from "./adapter";
import type {
    OpenRouterConnectionConfig,
    OpenRouterListModelsResponse,
    OpenRouterModel,
} from "./types";

const openRouterBaseUrl = "https://openrouter.ai/api/v1";

export async function listOpenRouterModels(
    config: Pick<OpenRouterConnectionConfig, "apiKey">,
): Promise<OpenRouterModel[]> {
    const targetUrl = `${openRouterBaseUrl}/models`;
    const data = await fetchProviderApi<OpenRouterListModelsResponse>(targetUrl, {
        headers: createOpenRouterHeaders({
            ...config,
            model: { source: "api", id: "" },
            providerPreferences: {},
        }),
        errorPrefix: "OpenRouter model list failed",
    });
    return Array.isArray(data.data) ? data.data : [];
}
