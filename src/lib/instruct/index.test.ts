import { describe, expect, test } from "bun:test";
import {
    detectInstructTemplate,
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
});
