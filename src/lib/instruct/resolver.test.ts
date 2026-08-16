import { describe, expect, test } from "bun:test";

import { resolveInstructTemplate } from "./resolver";

describe("Instruct template resolution", () => {
    test("selects the most specific built-in activation match in Auto mode", () => {
        const result = resolveInstructTemplate({
            activeTemplateId: "builtin:auto",
            formatting: { instructTemplate: "auto" },
            modelId: "Mistral V7-Tekken GGUF",
            builtInTemplates: [
                {
                    id: "mistral-v7-tekken",
                    name: "Mistral V7-Tekken",
                    userPrefix: "[INST]",
                },
            ],
        });

        expect(result.template).toEqual({
            id: "mistral-v7-tekken",
            name: "Mistral V7-Tekken",
        });
        expect(result.reason).toBe("activation-regex");
        expect(result.formatting.instructTemplate).toBe("custom");
    });

    test("uses a manual template even when another activation regex matches", () => {
        const result = resolveInstructTemplate({
            activeTemplateId: "custom:manual-template",
            formatting: { instructTemplate: "custom" },
            modelId: "Mistral V7-Tekken",
            customTemplates: [
                {
                    id: "manual-template",
                    name: "Manual",
                    userPrefix: "<manual>",
                    activationRegex: "mistral",
                },
            ],
        });

        expect(result.reason).toBe("manual");
        expect(result.formatting.userPrefix).toBe("<manual>");
    });

    test("keeps legacy Auto behavior when no activation regex matches", () => {
        const formatting = { instructTemplate: "auto" as const };
        expect(
            resolveInstructTemplate({
                activeTemplateId: "builtin:auto",
                formatting,
                modelId: "Unknown model",
            }),
        ).toMatchObject({ formatting, reason: "auto-fallback" });
    });

    test("keeps explicit preset formatting overrides above an Auto template", () => {
        const result = resolveInstructTemplate({
            activeTemplateId: "auto",
            formatting: { instructTemplate: "auto", userPrefix: "<global>" },
            presetFormatting: { userPrefix: "<preset>" },
            modelId: "Llama 3",
            builtInTemplates: [
                {
                    id: "llama-3-instruct",
                    name: "Llama 3 Instruct",
                    userPrefix: "<template>",
                },
            ],
        });

        expect(result.reason).toBe("activation-regex");
        expect(result.formatting.userPrefix).toBe("<preset>");
    });

    test("does not confuse model sizes, quantization, or filenames for versions", () => {
        const builtInTemplates = [
            "mistral-v1",
            "mistral-v2-v3",
            "mistral-v3-tekken",
            "mistral-v7",
            "mistral-v7-tekken",
            "llama-3-instruct",
            "llama-3-instruct-names",
            "chatml",
            "chatml-names",
            "deepseek-v2-5",
            "openai-harmony",
            "openai-harmony-thinking",
            "glm-4",
            "gemma-2",
            "command-r",
        ].map((id) => ({ id, name: id }));
        const select = (modelId: string) =>
            resolveInstructTemplate({
                activeTemplateId: "builtin:auto",
                formatting: { instructTemplate: "auto" },
                modelId,
                builtInTemplates,
            }).template?.id;

        expect(select("Mistral-7B-Instruct-v0.1.Q4_K_M.gguf")).toBe("mistral-v1");
        expect(select("Mixtral-8x22B-Instruct-v0.3")).toBe("mistral-v2-v3");
        expect(select("Mistral-7B-v0.1.Q3_K_M.gguf")).toBe("mistral-v1");
        expect(select("Mistral-v7-Tekken")).toBe("mistral-v7-tekken");
        expect(select("Mistral-v3-Tekken")).toBe("mistral-v3-tekken");
        expect(select("Meta_Llama_3_8B_Instruct_filename.gguf")).toBe("llama-3-instruct");
        expect(select("Meta_Llama_3_8B_Instruct_names.gguf")).toBe(
            "llama-3-instruct-names",
        );
        expect(select("gpt-4o-thinking")).toBeUndefined();
        expect(select("Harmony-8B-Llama3-thinking")).toBe("openai-harmony-thinking");
        expect(select("Harmony-8B-Llama3")).toBe("openai-harmony");
        expect(select("DeepSeek-V2.Q5_K_M.gguf")).toBeUndefined();
        expect(select("DeepSeek-V2.5-Instruct")).toBe("deepseek-v2-5");
        expect(select("glm_4_9b")).toBe("glm-4");
        expect(select("gemma_2_9b")).toBe("gemma-2");
        expect(select("command_r_plus")).toBe("command-r");
    });
});
