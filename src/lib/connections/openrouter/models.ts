import { safeResponseText } from "../http";

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
    const response = await fetch(targetUrl, {
        headers: createOpenRouterHeaders({
            ...config,
            model: { source: "api", id: "" },
            providerPreferences: {},
        }),
    });

    if (!response.ok) {
        throw new Error(
            `OpenRouter model list failed: ${response.status} ${await safeResponseText(response)}`,
        );
    }

    const data = (await response.json()) as OpenRouterListModelsResponse;
    return Array.isArray(data.data) ? data.data : [];
}
