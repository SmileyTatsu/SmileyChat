export type GoogleAIConnectionConfig = {
    baseUrl: string;
    apiKey?: string;
    model: GoogleAIModelSelection;
    thinking?: GoogleAIThinkingConfig;
};

export type GoogleAIRuntimeConfig = GoogleAIConnectionConfig;

export type GoogleAIThinkingConfig = {
    includeThoughts?: boolean;
    mode?: "auto" | "level" | "budget";
    thinkingLevel?: "minimal" | "low" | "medium" | "high";
    thinkingBudget?: number;
};

export type GoogleAIModelSelection =
    | {
          source: "default";
          id: string;
      }
    | {
          source: "api";
          id: string;
      }
    | {
          source: "custom";
          id: string;
      };

export type GoogleAIPart = {
    text?: string;
    thought?: boolean;
    thoughtSignature?: string;
    thought_signature?: string;
};

export type GoogleAIContent = {
    role?: "user" | "model";
    parts: GoogleAIPart[];
};

export type GoogleAISystemInstruction = {
    parts: GoogleAIPart[];
};

export type GoogleAIGenerateContentRequest = {
    contents: GoogleAIContent[];
    systemInstruction?: GoogleAISystemInstruction;
    generationConfig?: {
        thinkingConfig?: {
            includeThoughts?: boolean;
            thinkingLevel?: GoogleAIThinkingConfig["thinkingLevel"];
            thinkingBudget?: number;
        };
    };
};

export type GoogleAIGenerateContentResponse = {
    candidates?: Array<{
        content?: GoogleAIContent;
        finishReason?: string;
        finishMessage?: string;
    }>;
    promptFeedback?: {
        blockReason?: string;
    };
    usageMetadata?: GoogleAIUsageMetadata;
    modelVersion?: string;
    responseId?: string;
};

export type GoogleAIGenerateContentStreamChunk = GoogleAIGenerateContentResponse;

export type GoogleAIUsageMetadata = {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    thoughtsTokenCount?: number;
};

export type GoogleAIReasoningDetails = {
    googleAI: {
        parts?: GoogleAIPart[];
        usageMetadata?: GoogleAIUsageMetadata;
        visibleText?: string;
    };
};

export type GoogleAIModel = {
    name: string;
    baseModelId?: string;
    version?: string;
    displayName?: string;
    description?: string;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
    supportedGenerationMethods?: string[];
};

export type GoogleAIListModelsResponse = {
    models?: GoogleAIModel[];
    nextPageToken?: string;
};
