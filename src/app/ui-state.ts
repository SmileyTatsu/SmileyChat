import { signal } from "@preact/signals";

import type { SettingsCategory } from "#frontend/types";

export const desktopSidebarOpen = signal(true);
export const mobileSidebarOpen = signal(false);
export const desktopCharacterOpen = signal(false);
export const mobileCharacterOpen = signal(false);
export const settingsOpen = signal(false);
export const activeSettingsCategory = signal<SettingsCategory>("connections");

export function setActiveSettingsCategory(category: SettingsCategory) {
    activeSettingsCategory.value = category;
}

export function openSettings(category?: SettingsCategory) {
    if (category) {
        activeSettingsCategory.value = category;
    }

    settingsOpen.value = true;
}

export function closeSettingsSignal() {
    settingsOpen.value = false;
}
