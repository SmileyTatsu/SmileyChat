import type { SmileyPluginApi } from "#frontend/lib/plugins/types";
import {
    arePluginSettingsEqual,
    usePluginSettingsAutosave,
    type RequestState,
} from "#frontend/features/settings/plugins/use-plugin-settings-autosave";

import { splitMasterPrompt } from "./master-prompt";
import { IMAGE_SETTINGS_KEY, type ImageGenerationSettings } from "./settings";

export { arePluginSettingsEqual as areImageSettingsEqual };
export type { RequestState };

export type UseImageSettingsAutosaveOptions = {
    api: SmileyPluginApi;
    settings: ImageGenerationSettings;
    onSettingsChange?: (settings: ImageGenerationSettings) => void;
};

export function useImageSettingsAutosave({
    api,
    settings,
    onSettingsChange,
}: UseImageSettingsAutosaveOptions) {
    return usePluginSettingsAutosave<ImageGenerationSettings>({
        pluginId: api.plugin.id,
        key: IMAGE_SETTINGS_KEY,
        settings,
        onSettingsChange,
        validate: (s) => {
            splitMasterPrompt(s.masterPrompt);
        },
    });
}
