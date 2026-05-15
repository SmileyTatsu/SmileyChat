export type GoogleAIConnectionConfig = {
    baseUrl: string;
    apiKey?: string;
    model: GoogleAIModelSelection;
};

export type GoogleAIRuntimeConfig = GoogleAIConnectionConfig;

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
    modelVersion?: string;
    responseId?: string;
};

export type GoogleAIGenerateContentStreamChunk = GoogleAIGenerateContentResponse;

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
