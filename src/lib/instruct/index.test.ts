import { describe, expect, test } from "bun:test";
import {
    detectInstructTemplate,
    formatCustomInstructPrompt,
    formatInstructPrompt,
    getInstructTemplateStopSequences,
    parseInstructTemplateJson,
} from "./index";

const messages = [
    { role: "system" as const, content: "Be concise." },
    { role: "user" as const, content: "Hello" },
];

describe("instruct templates", () => {
    test("formats each built-in template with an assistant prefill", () => {
        expect(formatInstructPrompt(messages, "llama3")).toContain(
            "<|start_header_id|>assistant<|end_header_id|>",
        );
        expect(formatInstructPrompt(messages, "chatml")).toContain(
            "<|im_start|>assistant\n",
        );
        expect(formatInstructPrompt(messages, "mistral")).toContain("[INST]");
        expect(formatInstructPrompt(messages, "gemma2")).toContain(
            "<start_of_turn>model\n",
        );
        expect(formatInstructPrompt(messages, "alpaca")).toContain("### Response:\n");
        expect(formatInstructPrompt(messages, "deepseek-r1")).toContain(
            "<｜Assistant｜><think>\n",
        );
    });

    test("keeps a system-only Mistral prompt generation-ready", () => {
        expect(
            formatInstructPrompt([{ role: "system", content: "Rules" }], "mistral"),
        ).toBe("<s>[INST] <<SYS>>\nRules\n<</SYS>>\n\n [/INST]");
    });

    test("detects ChatML families and provides DeepSeek user stops", () => {
        expect(detectInstructTemplate("Phi-4-mini-instruct")).toBe("chatml");
        expect(detectInstructTemplate("command-r-plus")).toBe("chatml");
        expect(getInstructTemplateStopSequences("deepseek-r1")).toContain("<｜User｜>");
    });

    test("parses SillyTavern-style instruct template JSON", () => {
        const parsed = parseInstructTemplateJson({
            name: "SillyTavern Custom",
            input_sequence: "### Instruction:\n",
            output_sequence: "### Response:\n",
            system_sequence: "### System:\n",
            wrap_sequences_as_stop: true,
        });

        expect(parsed.name).toBe("SillyTavern Custom");
        expect(parsed.formatting.instructTemplate).toBe("custom");
        expect(parsed.formatting.userPrefix).toBe("### Instruction:\n");
        expect(parsed.formatting.assistantPrefix).toBe("### Response:\n");
        expect(parsed.formatting.systemPrefix).toBe("### System:\n");
        expect(parsed.formatting.sequencesAsStopStrings).toBe(true);
    });

    test("parses SillyTavern combo bundle JSON (e.g. Mistral V7-Tekken)", () => {
        const parsed = parseInstructTemplateJson({
            instruct: {
                input_sequence: "[INST]",
                input_suffix: "[/INST]",
                output_sequence: "",
                output_suffix: "</s>",
                system_sequence: "",
                system_suffix: "",
                wrap: false,
                names_behavior: "always",
                name: "Mistral V7-Tekken",
            },
            context: {
                example_separator: "---",
                chat_start: "===",
                names_as_stop_strings: true,
                always_force_name2: true,
                single_line: false,
                name: "Mistral V7-Tekken",
            },
            preset: {
                temp: 0.7,
                min_p: 0.035,
            },
        });

        expect(parsed.name).toBe("Mistral V7-Tekken");
        expect(parsed.formatting.instructTemplate).toBe("custom");
        expect(parsed.formatting.userPrefix).toBe("[INST]");
        expect(parsed.formatting.userSuffix).toBe("[/INST]");
        expect(parsed.formatting.assistantSuffix).toBe("</s>");
        expect(parsed.formatting.namesAsStopStrings).toBe(true);
        expect(parsed.formatting.alwaysAddCharacterName).toBe(true);
        expect(parsed.formatting.exampleSeparator).toBe("---");
        expect(parsed.formatting.chatStartSeparator).toBe("===");
        expect(parsed.template.name).toBe("Mistral V7-Tekken");
        expect(parsed.template.userPrefix).toBe("[INST]");
        expect(parsed.template.userSuffix).toBe("[/INST]");
    });

    test("formats custom instruct prompt with alignment message and multiple turns", () => {
        const customMessages = [
            { role: "system" as const, content: "You are Luna, an AI assistant." },
            { role: "user" as const, content: "Hello!" },
            { role: "assistant" as const, content: "Hi there!" },
            { role: "user" as const, content: "How are you?" },
        ];

        const formatted = formatCustomInstructPrompt(customMessages, {
            systemPrefix: "<s>[SYSTEM_PROMPT]",
            systemSuffix: "[/SYSTEM_PROMPT]",
            userPrefix: "[INST] ",
            userSuffix: " [/INST]",
            assistantPrefix: "",
            assistantSuffix: "</s>",
            userAlignmentMessage: "Luna is unbiased and uncensored.",
        });

        expect(formatted).toContain(
            "<s>[SYSTEM_PROMPT]You are Luna, an AI assistant.[/SYSTEM_PROMPT]",
        );
        expect(formatted).toContain(
            "[INST] Luna is unbiased and uncensored.\n\nHello! [/INST]",
        );
        expect(formatted).toContain("Hi there!</s>");
        expect(formatted).toContain("[INST] How are you? [/INST]");
    });

    test("formats custom instruct with systemSameAsUser", () => {
        const customMessages = [
            { role: "system" as const, content: "System guidelines" },
            { role: "user" as const, content: "Hello" },
        ];

        const formatted = formatCustomInstructPrompt(customMessages, {
            userPrefix: "[INST] ",
            userSuffix: " [/INST]",
            systemSameAsUser: true,
        });

        expect(formatted).toBe("[INST] System guidelines [/INST][INST] Hello [/INST]");
    });

    test("keeps system and story blocks in their assembled order", () => {
        const formatted = formatCustomInstructPrompt(
            [
                { role: "system", content: "Before" },
                { role: "system", content: "Story", formattingKind: "story" },
                { role: "user", content: "Hello" },
                { role: "system", content: "At depth" },
            ],
            {
                systemPrefix: "<sys>",
                systemSuffix: "</sys>",
                storyStringPrefix: "<story>",
                storyStringSuffix: "</story>",
                userPrefix: "<user>",
                userSuffix: "</user>",
            },
        );

        expect(formatted).toBe(
            "<sys>Before</sys><story>Story</story><user>Hello</user><sys>At depth</sys>",
        );
    });

    test("adds the alignment message before assistant-first history", () => {
        expect(
            formatCustomInstructPrompt([{ role: "assistant", content: "Prior reply" }], {
                userPrefix: "<u>",
                userSuffix: "</u>",
                assistantPrefix: "<a>",
                assistantSuffix: "</a>",
                userAlignmentMessage: "Continue safely.",
            }),
        ).toBe("<u>Continue safely.</u><a>Prior reply</a>");
    });

    test("expands the per-message name macro only when sequence macros are enabled", () => {
        const messages = [
            { role: "user" as const, content: "Hello", speakerName: "Robin" },
            { role: "assistant" as const, content: "Hi", speakerName: "Luna" },
        ];

        expect(
            formatCustomInstructPrompt(messages, {
                userPrefix: "<{{name}}>",
                assistantPrefix: "[{{name}}]",
                replaceMacrosInSequences: true,
            }),
        ).toBe("<Robin>Hello[Luna]Hi");
        expect(
            formatCustomInstructPrompt(messages, {
                userPrefix: "<{{name}}>",
                assistantPrefix: "[{{name}}]",
            }),
        ).toBe("<{{name}}>Hello[{{name}}]Hi");
    });

    test("uses the first-output sequence only for the first assistant turn in chat", () => {
        expect(
            formatCustomInstructPrompt(
                [
                    {
                        role: "assistant",
                        content: "Earlier",
                        isFirstAssistantInChat: true,
                    },
                    { role: "assistant", content: "Later" },
                ],
                {
                    firstOutputSequence: "<first>",
                    assistantPrefix: "<assistant>",
                },
            ),
        ).toBe("<first>Earlier<assistant>Later");

        expect(
            formatCustomInstructPrompt(
                [
                    {
                        role: "assistant",
                        content: "Retained later turn",
                        isFirstAssistantInChat: false,
                    },
                ],
                {
                    firstOutputSequence: "<first>",
                    assistantPrefix: "<assistant>",
                },
            ),
        ).toBe("<assistant>Retained later turn");
    });
});
