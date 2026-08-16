import { describe, expect, test } from "bun:test";

import fixture from "./fixtures/custom-text-completion.fixture.json";
import { formatCustomInstructPrompt } from "./index";
import type { ChatGenerationMessage } from "../connections/types";
import type { PresetFormattingSettings } from "../presets/types";

describe("text-completion prompt fixtures", () => {
    test(fixture.name, () => {
        expect(
            formatCustomInstructPrompt(
                fixture.messages as ChatGenerationMessage[],
                fixture.formatting as PresetFormattingSettings,
            ),
        ).toBe(fixture.goldenPrompt);
    });
});
