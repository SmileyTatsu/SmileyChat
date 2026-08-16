import { describe, expect, test } from "bun:test";
import {
    deleteInstructTemplate,
    readInstructTemplates,
    saveInstructTemplate,
} from "./instruct-store";

describe("instruct store", () => {
    test("saves, reads, and deletes custom instruct template", async () => {
        const templateData = {
            name: "Test Mistral V7",
            userPrefix: "[INST] ",
            userSuffix: " [/INST]",
            assistantPrefix: "",
            assistantSuffix: "</s>",
            systemPrefix: "<s>[INST] ",
            systemSuffix: " [/INST]",
            sequencesAsStopStrings: true,
        };

        const result = await saveInstructTemplate(templateData);
        expect(result.template.name).toBe("Test Mistral V7");
        expect(result.template.userPrefix).toBe("[INST] ");
        expect(result.template.id).toBeDefined();

        const all = await readInstructTemplates();
        const found = all.find((item) => item.id === result.template.id);
        expect(found).toBeDefined();
        expect(found?.userSuffix).toBe(" [/INST]");
        expect(found?.assistantSuffix).toBe("</s>");

        const afterDelete = await deleteInstructTemplate(result.template.id);
        expect(afterDelete.some((item) => item.id === result.template.id)).toBe(false);
    });
});
