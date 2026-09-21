import { CheckCircle2, LoaderCircle } from "lucide-preact";
import { useEffect, useMemo, useState } from "preact/hooks";

import {
    getPluginSettingsDefinition,
    getPluginSettingsRecord,
    subscribeToPluginSettings,
} from "#frontend/lib/plugins/registry";
import { createPluginStorage } from "#frontend/lib/plugins/runtime";
import type {
    PluginAppSnapshot,
    PluginManifest,
    PluginSettingsPanel,
} from "#frontend/lib/plugins/types";

import { DeclarativeSettingsFields } from "./declarative-settings-fields";
import { PluginRenderSurface } from "../../plugins/plugin-error-boundary";
import { usePluginSettingsAutosave } from "./use-plugin-settings-autosave";

export type ManagedPluginSettingsSectionProps = {
    plugin: PluginManifest;
    panel: PluginSettingsPanel;
    snapshot: PluginAppSnapshot;
};

export function ManagedPluginSettingsSection({
    plugin,
    panel,
    snapshot,
}: ManagedPluginSettingsSectionProps) {
    const settingsKey = panel.settingsKey || "settings";
    const storage = useMemo(() => createPluginStorage(plugin.id), [plugin.id]);
    const definition = getPluginSettingsDefinition(plugin.id, settingsKey);
    const existingRecord = getPluginSettingsRecord(plugin.id, settingsKey);

    const initialValue =
        existingRecord?.currentValue !== undefined
            ? existingRecord.currentValue
            : definition?.defaultValues !== undefined
              ? definition.defaultValues
              : {};

    const [draft, setDraft] = useState<any>(initialValue);

    // Initial load from storage if not already cached
    useEffect(() => {
        let active = true;
        const currentCached = getPluginSettingsRecord(
            plugin.id,
            settingsKey,
        )?.currentValue;
        if (currentCached !== undefined) {
            setDraft(currentCached);
            return;
        }

        void storage
            .getJson(settingsKey, definition?.defaultValues ?? {})
            .then((loaded) => {
                if (!active) return;
                const normalized = definition?.normalize
                    ? definition.normalize(loaded)
                    : loaded;
                setDraft(normalized);
            })
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, [plugin.id, settingsKey, definition, storage]);

    // Subscribe to external changes (e.g. from background tasks or other windows)
    useEffect(() => {
        return subscribeToPluginSettings(plugin.id, settingsKey, (newVal) => {
            setDraft(newVal);
        });
    }, [plugin.id, settingsKey]);

    const { requestState, statusMessage } = usePluginSettingsAutosave({
        pluginId: plugin.id,
        key: settingsKey,
        settings: draft,
        onSettingsChange: setDraft,
        storage,
        validate: definition?.validate,
    });

    function updateDraft(patchOrNext: any) {
        setDraft((current: any) => {
            let next: any;
            if (
                typeof current === "object" &&
                current !== null &&
                !Array.isArray(current) &&
                typeof patchOrNext === "object" &&
                patchOrNext !== null &&
                !Array.isArray(patchOrNext)
            ) {
                next = { ...current, ...patchOrNext };
            } else {
                next = patchOrNext;
            }
            return definition?.normalize ? definition.normalize(next) : next;
        });
    }

    const effectiveFields = panel.fields ?? definition?.fields;

    return (
        <section className="plugin-config-section" key={panel.id}>
            <div className="plugin-config-section-header">
                <h4>{panel.label}</h4>
                {(requestState === "loading" || requestState === "success") && (
                    <span
                        className={`preset-save-badge ${requestState}`}
                        role="status"
                        title={statusMessage}
                    >
                        {requestState === "loading" ? (
                            <LoaderCircle aria-hidden="true" size={14} />
                        ) : (
                            <CheckCircle2 aria-hidden="true" size={14} />
                        )}
                        {requestState === "loading" ? "Saving..." : "Saved"}
                    </span>
                )}
            </div>

            {requestState === "error" && statusMessage && (
                <p className="connection-status error" role="status">
                    {statusMessage}
                </p>
            )}

            <PluginRenderSurface
                pluginId={plugin.id}
                resetKey={panel.id}
                surface={panel.label}
                render={() => {
                    if (effectiveFields && effectiveFields.length > 0) {
                        return (
                            <DeclarativeSettingsFields
                                fields={effectiveFields}
                                values={draft ?? {}}
                                onChange={(key, value) => updateDraft({ [key]: value })}
                            />
                        );
                    }
                    if (panel.render) {
                        return panel.render({
                            pluginId: plugin.id,
                            snapshot,
                            storage,
                            settings: draft,
                            updateSettings: updateDraft,
                            requestState,
                            statusMessage,
                        });
                    }
                    return null;
                }}
            />
        </section>
    );
}
