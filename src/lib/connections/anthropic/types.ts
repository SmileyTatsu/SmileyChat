import type { ChatGenerationMessage } from "../types";

export type AnthropicConnectionConfig = {
    baseUrl: string;
    apiKey?: string;
    maxTokens?: number;
    model: AnthropicModelSelection;
    thinking?: AnthropicThinkingConfig;
};

export type AnthropicRuntimeConfig = AnthropicConnectionConfig;

export type AnthropicModelSelection =
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

export type AnthropicThinkingConfig =
    | {
          mode: "off";
      }
    | {
          mode: "adaptive";
          effort?: "medium" | "high" | "xhigh" | "max";
          display?: "summarized" | "omitted";
      }
    | {
          mode: "enabled";
          budgetTokens?: number;
          display?: "summarized" | "omitted";
      };

export type AnthropicContentBlock =
    | {
          type: "text";
          text: string;
      }
    | {
          type: "image";
          source:
              | {
                    type: "base64";
                    media_type: string;
                    data: string;
                }
              | {
                    type: "url";
                    url: string;
                };
      }
    | AnthropicThinkingBlock
    | AnthropicRedactedThinkingBlock
    | {
          type: "tool_use";
          id?: string;
          name?: string;
          input?: unknown;
      };

export type AnthropicThinkingBlock = {
    type: "thinking";
    thinking?: string;
    signature?: string;
};

export type AnthropicRedactedThinkingBlock = {
    type: "redacted_thinking";
    data?: string;
};

export type AnthropicMessage = {
    role: "user" | "assistant";
    content: string | AnthropicContentBlock[];
};

export type AnthropicCreateMessageRequest = {
    model: string;
    max_tokens: number;
    messages: AnthropicMessage[];
    stream?: boolean;
    system?: string;
    thinking?:
        | {
              type: "adaptive";
              effort?: "medium" | "high" | "xhigh" | "max";
              display?: "summarized" | "omitted";
          }
        | {
              type: "enabled";
              budget_tokens: number;
              display?: "summarized" | "omitted";
          };
};

export type AnthropicCreateMessageResponse = {
    id?: string;
    type?: "message";
    role?: "assistant";
    content?: AnthropicContentBlock[];
    model?: string;
    stop_reason?: string | null;
    stop_sequence?: string | null;
    usage?: AnthropicUsage;
};

export type AnthropicUsage = {
    input_tokens?: number;
    output_tokens?: number;
};

export type AnthropicReasoningDetails = {
    anthropic: {
        content?: AnthropicContentBlock[];
        stopReason?: string | null;
        usage?: AnthropicUsage;
        visibleText?: string;
    };
};

export type AnthropicStreamEvent =
    | {
          type: "message_start";
          message?: AnthropicCreateMessageResponse;
      }
    | {
          type: "content_block_start";
          index: number;
          content_block?: AnthropicContentBlock;
      }
    | {
          type: "content_block_delta";
          index: number;
          delta?:
              | {
                    type: "text_delta";
                    text?: string;
                }
              | {
                    type: "thinking_delta";
                    thinking?: string;
                }
              | {
                    type: "signature_delta";
                    signature?: string;
                }
              | {
                    type: "input_json_delta";
                    partial_json?: string;
                };
      }
    | {
          type: "content_block_stop";
          index: number;
      }
    | {
          type: "message_delta";
          delta?: {
              stop_reason?: string | null;
              stop_sequence?: string | null;
          };
          usage?: AnthropicUsage;
      }
    | {
          type: "message_stop";
      }
    | {
          type: "ping";
      }
    | {
          type: "error";
          error?: {
              type?: string;
              message?: string;
          };
      };

export type AnthropicModel = {
    id: string;
    type?: "model";
    display_name?: string;
    created_at?: string;
    max_input_tokens?: number;
    max_tokens?: number;
    capabilities?: {
        thinking?: {
            adaptive?: {
                supported?: boolean;
            };
            enabled?: {
                supported?: boolean;
            };
        };
    };
};

export type AnthropicListModelsResponse = {
    data?: AnthropicModel[];
    first_id?: string;
    has_more?: boolean;
    last_id?: string;
};

export type AnthropicPromptMessage = ChatGenerationMessage;
