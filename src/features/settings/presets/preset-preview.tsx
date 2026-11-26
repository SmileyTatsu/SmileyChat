import { messageContentToText } from "#frontend/lib/connections/images";
import { getEnabledPluginToolEntries } from "#frontend/lib/plugins/registry";
import {
    compilePresetContext,
    compilePresetMessages,
} from "#frontend/lib/presets/compile";
import type { SmileyPreset } from "#frontend/lib/presets/types";
import type { ChatMode, Message, SmileyCharacter, UserStatus } from "#frontend/types";
import { useMemo } from "preact/hooks";

type PresetPreviewProps = {
    activeView: "compiled" | "flat";
    preset?: SmileyPreset;
    character: SmileyCharacter;
    messages: Message[];
    mode: ChatMode;
    personaDescription: string;
    personaName: string;
    userStatus: UserStatus;
};

export function PresetPreview({
    activeView,
    preset,
    character,
    messages,
    mode,
    personaDescription,
    personaName,
    userStatus,
}: PresetPreviewProps) {
    const compileContext = useMemo(
        () => ({
            character,
            messages,
            mode,
            personaDescription,
            personaName,
            // The preview answers "what does this preset look like with the
            // tools I have installed", so chat group toggles are ignored here;
            // `enabledToolGroups` decides that per chat at request time.
            tools: getEnabledPluginToolEntries().map(({ tool, groupId, groupLabel }) => ({
                name: tool.name,
                groupId,
                groupLabel,
            })),
            userStatus,
        }),
        [character, messages, mode, personaDescription, personaName, userStatus],
    );
    const compiledMessagesPreview = useMemo(
        () =>
            activeView === "compiled"
                ? compilePresetMessages(preset, compileContext)
                : [],
        [activeView, compileContext, preset],
    );
    const compiledContextPreview = useMemo(
        () => (activeView === "flat" ? compilePresetContext(preset, compileContext) : ""),
        [activeView, compileContext, preset],
    );

    return (
        <section className="preset-preview-panel" aria-label="Preset preview">
            {activeView === "compiled" ? (
                <div className="compiled-message-list" role="tabpanel">
                    {compiledMessagesPreview.map((message, index) => (
                        <article
                            className="compiled-message"
                            key={`${message.role}-${index}`}
                        >
                            <strong>{message.role}</strong>
                            <pre>{messageContentToText(message.content)}</pre>
                        </article>
                    ))}
                </div>
            ) : (
                <textarea
                    className="context-preview"
                    aria-label="Flat context preview"
                    role="tabpanel"
                    readOnly
                    value={compiledContextPreview}
                />
            )}
        </section>
    );
}
