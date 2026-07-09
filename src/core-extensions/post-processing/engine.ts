import { getMessageContent } from "#frontend/lib/messages";
import type {
    ChatGenerationMessage,
    ChatGenerationMessageRole,
} from "#frontend/lib/connections/types";
import type {
    ChatOutputMiddlewareContext,
    PluginAppSnapshot,
    SmileyPluginApi,
} from "#frontend/lib/plugins/types";
import { compilePresetMessages } from "#frontend/lib/presets/compile";
import type { PresetCollection } from "#frontend/lib/presets/types";
import type { Message, SmileyCharacter } from "#frontend/types";

import type { PipelinePass } from "./settings";

export type PipelineEngineContext = {
    character: SmileyCharacter;
    messages: Message[];
    mode: PluginAppSnapshot["mode"];
    personaDescription: string;
    personaName: string;
    presetCollection: PresetCollection;
    userStatus: PluginAppSnapshot["userStatus"];
};

export function contextFromOutputMiddleware(
    context: ChatOutputMiddlewareContext,
): PipelineEngineContext {
    return {
        character: context.character,
        messages: context.messages,
        mode: context.mode,
        personaDescription: context.persona.description,
        personaName: context.persona.name,
        presetCollection: context.presetCollection,
        userStatus: context.userStatus,
    };
}

export function contextFromSnapshot(snapshot: PluginAppSnapshot): PipelineEngineContext {
    return {
        character: snapshot.character,
        messages: snapshot.messages,
        mode: snapshot.mode,
        personaDescription: snapshot.persona.description,
        personaName: snapshot.persona.name,
        presetCollection: snapshot.presetCollection,
        userStatus: snapshot.userStatus,
    };
}

export function buildPassMessages(
    api: SmileyPluginApi,
    pass: PipelinePass,
    currentText: string,
    context: PipelineEngineContext,
): ChatGenerationMessage[] {
    return buildPassMessagesWithContextMessages(
        api,
        pass,
        currentText,
        context,
        limitContextMessages(context.messages, pass.contextMessageLimit),
    );
}

export function buildBudgetedPassMessages(
    api: SmileyPluginApi,
    pass: PipelinePass,
    currentText: string,
    context: PipelineEngineContext,
    tokenBudget: number,
): ChatGenerationMessage[] {
    let contextMessages = limitContextMessages(
        context.messages,
        pass.contextMessageLimit,
    );
    let messages = buildPassMessagesWithContextMessages(
        api,
        pass,
        currentText,
        context,
        contextMessages,
    );

    while (api.model.estimateTokens(messages) > tokenBudget && contextMessages.length) {
        contextMessages = contextMessages.slice(1);
        messages = buildPassMessagesWithContextMessages(
            api,
            pass,
            currentText,
            context,
            contextMessages,
        );
    }

    return messages;
}

function buildPassMessagesWithContextMessages(
    api: SmileyPluginApi,
    pass: PipelinePass,
    currentText: string,
    context: PipelineEngineContext,
    contextMessages: Message[],
): ChatGenerationMessage[] {
    const systemPrompt = api.presets.resolveMacros(pass.prompt, {
        character: context.character,
        messages: contextMessages,
        mode: context.mode,
        personaDescription: context.personaDescription,
        personaName: context.personaName,
        userStatus: context.userStatus,
    });
    const preset = pass.presetId
        ? context.presetCollection.presets.find((item) => item.id === pass.presetId)
        : undefined;

    if (preset) {
        return compilePresetMessages(preset, {
            character: context.character,
            messages: [...contextMessages, createTaskMessage(systemPrompt, currentText)],
            mode: context.mode,
            personaDescription: context.personaDescription,
            personaName: context.personaName,
            userStatus: context.userStatus,
        });
    }

    const userSections = [
        pass.includeCharacter ? characterSection(context.character) : "",
        pass.includeSceneContext ? sceneSection(contextMessages) : "",
        `<text_to_transform>\n${currentText}\n</text_to_transform>`,
    ].filter((section) => section.trim().length > 0);

    return [
        ...(systemPrompt.trim()
            ? [
                  {
                      role: "system" as const,
                      content: systemPrompt,
                  },
              ]
            : []),
        {
            role: "user",
            content: userSections.join("\n\n"),
        },
    ];
}

function limitContextMessages(messages: Message[], messageLimit: number) {
    if (messageLimit < 0) {
        return messages;
    }

    if (messageLimit === 0) {
        return [];
    }

    return messages.slice(-messageLimit);
}

function createTaskMessage(instruction: string, currentText: string): Message {
    const createdAt = new Date().toISOString();
    const content = [
        instruction.trim()
            ? `<post_processing_instruction>\n${instruction}\n</post_processing_instruction>`
            : "",
        `<text_to_transform>\n${currentText}\n</text_to_transform>`,
    ]
        .filter(Boolean)
        .join("\n\n");

    return {
        id: `post-processing-task-${createdAt}`,
        author: "Post Processing",
        metadata: {
            includeInPrompt: true,
            promptRole: "user",
        },
        role: "user",
        createdAt,
        activeSwipeIndex: 0,
        swipes: [
            {
                id: `post-processing-task-swipe-${createdAt}`,
                content,
                createdAt,
            },
        ],
    };
}

function characterSection(character: SmileyCharacter) {
    return [
        "<character>",
        field("name", character.data.name),
        field("description", character.data.description),
        field("personality", character.data.personality),
        field("scenario", character.data.scenario),
        field("system_prompt", character.data.system_prompt),
        field("post_history_instructions", character.data.post_history_instructions),
        "</character>",
    ]
        .filter(Boolean)
        .join("\n");
}

function sceneSection(messages: Message[]) {
    const recentMessages = messages;

    if (recentMessages.length === 0) {
        return "";
    }

    return [
        "<scene_context>",
        ...recentMessages.map((message) => {
            const role = promptRoleForMessage(message);
            const author = message.author || role;
            const content = getMessageContent(message).trim();

            return content ? `${author} (${role}):\n${content}` : "";
        }),
        "</scene_context>",
    ]
        .filter(Boolean)
        .join("\n\n");
}

function field(name: string, value: string | undefined) {
    const text = value?.trim();
    return text ? `<${name}>\n${text}\n</${name}>` : "";
}

function promptRoleForMessage(message: Message): ChatGenerationMessageRole {
    if (message.role === "user") {
        return "user";
    }

    if (message.metadata?.displayRole === "system") {
        return "system";
    }

    return "assistant";
}
