import type { PresetCollection, PresetPrompt, ScyllaPreset } from "./types";

export const dynamicPromptIds = {
    character: "charDescription",
    scenario: "scenario",
    chatHistory: "chatHistory",
} as const;

export function createDefaultPreset(now = new Date().toISOString()): ScyllaPreset {
    const prompts: PresetPrompt[] = [
        {
            id: "69994633-aef6-4892-85d6-a47ddb7d03d6",
            title: "Assistant Instructions",
            role: "system",
            content: [
                "You are an experienced and passionate aesthetic Roleplay Game Master, specializing in crafting immersive and engaging narratives for players.",
                "Your expertise lies in creating rich, detailed worlds and characters that captivate the imagination.",
                "You excel at adapting to player choices, weaving intricate storylines, and fostering a collaborative storytelling environment.",
                "Your goal is to provide an unforgettable roleplaying experience that sparks creativity and deepens player engagement.",
            ].join("\n"),
            systemPrompt: true,
            marker: false,
            injectionPosition: "none",
            injectionDepth: 0,
            forbidOverrides: false,
        },
        {
            id: dynamicPromptIds.character,
            title: "Character Description",
            role: "system",
            content: [
                "<{{char}}_description>",
                "{{char_description}}",
                "</{{char}}_description>",
                "",
                "<{{char}}_personality>",
                "{{char_personality}}",
                "</{{char}}_personality>",
                "",
                "<{{char}}_system_prompt>",
                "{{char_system_prompt}}",
                "</{{char}}_system_prompt>",
                "",
                "<{{char}}_message_examples>",
                "{{char_message_examples}}",
                "</{{char}}_message_examples>",
                "",
                "<{{char}}_lore>",
                "{{character_book}}",
                "</{{char}}_lore>",
            ].join("\n"),
            systemPrompt: false,
            marker: true,
            injectionPosition: "none",
            injectionDepth: 4,
            forbidOverrides: false,
        },
        {
            id: dynamicPromptIds.scenario,
            title: "Scenario",
            role: "system",
            content: [
                "<scenario>",
                "{{scenario}}",
                "</scenario>",
                "",
                "<post_history_instructions>",
                "{{post_history_instructions}}",
                "</post_history_instructions>",
            ].join("\n"),
            systemPrompt: false,
            marker: true,
            injectionPosition: "none",
            injectionDepth: 4,
            forbidOverrides: false,
        },
        {
            id: dynamicPromptIds.chatHistory,
            title: "Chat History",
            role: "system",
            content: ["<chat_history>", "{{chat_history}}", "</chat_history>"].join("\n"),
            systemPrompt: false,
            marker: true,
            injectionPosition: "none",
            injectionDepth: 4,
            forbidOverrides: false,
        },
    ];

    return {
        id: "default",
        title: "Default",
        prompts,
        promptOrder: prompts.map((prompt) => ({
            promptId: prompt.id,
            enabled: true,
        })),
        createdAt: now,
        updatedAt: now,
    };
}

export const defaultPresetCollection: PresetCollection = {
    activePresetId: "default",
    presets: [createDefaultPreset("2026-01-01T00:00:00.000Z")],
};
