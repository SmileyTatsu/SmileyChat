import { describe, expect, test } from "bun:test";
import { resolveEffectiveStopSequences } from "./generation-settings";

describe("effective generation stop sequences", () => {
    test("combines preset, formatting, names, and model stops", () => {
        const stops = resolveEffectiveStopSequences({
            generation: { stopSequences: ["END"] },
            formatting: {
                namesAsStopStrings: true,
                separatorsAsStopStrings: true,
                singleLineMode: true,
                exampleSeparator: "***",
                chatStartSeparator: "START",
                instructTemplate: "auto",
            },
            characterName: "Luna",
            personaName: "Anon",
            groupMemberNames: ["Mira"],
            modelId: "Llama-3.1",
        });
        expect(stops).toEqual(
            expect.arrayContaining([
                "END",
                "\n",
                "\nLuna:",
                "\nAnon:",
                "\nMira:",
                "***",
                "START",
                "<|eot_id|>",
            ]),
        );
    });
});
