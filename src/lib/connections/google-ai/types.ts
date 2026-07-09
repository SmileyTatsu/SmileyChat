export type GoogleAIConnectionConfig = {
    baseUrl: string;
    apiKey?: string;
    maxOutputTokens?: number;
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
    fileData?: {
        fileUri: string;
        mimeType: string;
    };
    inlineData?: {
        mimeType: string;
        data: string;
    };
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

export type GoogleAISafetyCategory =
    | "HARM_CATEGORY_HARASSMENT"
    | "HARM_CATEGORY_HATE_SPEECH"
    | "HARM_CATEGORY_SEXUALLY_EXPLICIT"
    | "HARM_CATEGORY_DANGEROUS_CONTENT";

export type GoogleAISafetyThreshold =
    | "BLOCK_NONE"
    | "BLOCK_ONLY_HIGH"
    | "BLOCK_MEDIUM_AND_ABOVE"
    | "BLOCK_LOW_AND_ABOVE";

export type GoogleAISafetySetting = {
    category: GoogleAISafetyCategory;
    threshold: GoogleAISafetyThreshold;
};

export type GoogleAIGenerateContentRequest = {
    contents: GoogleAIContent[];
    systemInstruction?: GoogleAISystemInstruction;
    safetySettings?: GoogleAISafetySetting[];
    generationConfig?: {
        frequencyPenalty?: number;
        maxOutputTokens?: number;
        presencePenalty?: number;
        seed?: number;
        stopSequences?: string[];
        temperature?: number;
        thinkingConfig?: {
            includeThoughts?: boolean;
            thinkingLevel?: GoogleAIThinkingConfig["thinkingLevel"];
            thinkingBudget?: number;
        };
        topK?: number;
        topP?: number;
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
    temperature?: number;
    topK?: number;
    topP?: number;
};

export type GoogleAIListModelsResponse = {
    models?: GoogleAIModel[];
    nextPageToken?: string;
};
