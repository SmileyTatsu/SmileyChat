import { X } from "lucide-preact";
import { useEffect, useRef } from "preact/hooks";

import {
    closePluginModal,
    getPluginCharacterDetailsSections,
    getPluginModalInstances,
    getPluginSidebarPanels,
} from "#frontend/lib/plugins/registry";
import { createPluginStorage } from "#frontend/lib/plugins/runtime";
import type {
    PluginAppSnapshot,
    PluginCharacterExtension,
    PluginModalInstance,
    PluginSidebarPanel,
} from "#frontend/lib/plugins/types";

import { PluginRenderSurface, pluginIdFromScopedId } from "./plugin-error-boundary";

type PluginSidebarPanelsProps = {
    side: PluginSidebarPanel["side"];
    snapshot: PluginAppSnapshot;
};

type PluginModalHostProps = {
    snapshot: PluginAppSnapshot;
};

type PluginCharacterDetailsSectionsProps = {
    character: PluginAppSnapshot["character"];
    snapshot: PluginAppSnapshot;
    onChange: (character: PluginAppSnapshot["character"]) => void;
};

export function PluginSidebarPanels({ side, snapshot }: PluginSidebarPanelsProps) {
    const panels = getPluginSidebarPanels(side);

    if (!panels.length) {
        return null;
    }

    return (
        <div className={`plugin-sidebar-panels ${side}`}>
            {panels.map((panel) => {
                const pluginId = pluginIdFromScopedId(panel.id);

                return (
                    <section className="plugin-sidebar-panel" key={panel.id}>
                        <h3>{panel.label}</h3>
                        <div>
                            <PluginRenderSurface
                                pluginId={pluginId}
                                resetKey={panel.id}
                                surface={panel.label}
                                render={() =>
                                    panel.render({
                                        pluginId,
                                        snapshot,
                                        storage: createPluginStorage(pluginId),
                                    })
                                }
                            />
                        </div>
                    </section>
                );
            })}
        </div>
    );
}

export function PluginCharacterDetailsSections({
    character,
    snapshot,
    onChange,
}: PluginCharacterDetailsSectionsProps) {
    const sections = getPluginCharacterDetailsSections();

    if (!sections.length) {
        return null;
    }

    function updateExtension(pluginId: string, extension: PluginCharacterExtension) {
        const safeExtension = cloneJsonRecord(extension);

        if (!safeExtension) {
            throw new Error("Character extension data must be a JSON object.");
        }

        onChange({
            ...character,
            data: {
                ...character.data,
                extensions: {
                    ...character.data.extensions,
                    [pluginId]: safeExtension,
                },
            },
        });
    }

    function clearExtension(pluginId: string) {
        const extensions = { ...character.data.extensions };
        delete extensions[pluginId];

        onChange({
            ...character,
            data: { ...character.data, extensions },
        });
    }

    return (
        <section
            className="character-details-plugin-sections"
            aria-labelledby="plugins-title"
        >
            <h3 id="plugins-title">Plugins</h3>
            {sections.map((section) => {
                const pluginId = pluginIdFromScopedId(section.id);
                const extension = asRecord(character.data.extensions[pluginId]);

                return (
                    <section
                        className="character-details-plugin-section"
                        key={section.id}
                    >
                        <h4>{section.label}</h4>
                        <PluginRenderSurface
                            pluginId={pluginId}
                            resetKey={`${section.id}:${character.id}`}
                            surface={section.label}
                            render={() =>
                                section.render({
                                    pluginId,
                                    snapshot,
                                    character,
                                    extension,
                                    storage: createPluginStorage(pluginId),
                                    updateExtension: (nextExtension) =>
                                        updateExtension(pluginId, nextExtension),
                                    clearExtension: () => clearExtension(pluginId),
                                })
                            }
                        />
                    </section>
                );
            })}
        </section>
    );
}

export function PluginModalHost({ snapshot }: PluginModalHostProps) {
    const modals = getPluginModalInstances();

    return (
        <>
            {modals.map((modal) => (
                <PluginModalFrame key={modal.id} modal={modal} snapshot={snapshot} />
            ))}
        </>
    );
}

function PluginModalFrame({
    modal,
    snapshot,
}: {
    modal: PluginModalInstance;
    snapshot: PluginAppSnapshot;
}) {
    const modalRef = useRef<HTMLElement>(null);
    const close = () => closePluginModal(modal.id);

    useEffect(() => {
        modalRef.current?.focus();
    }, []);

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
        }
    }

    return (
        <div className="plugin-modal-backdrop" role="presentation" onClick={close}>
            <section
                className="plugin-modal"
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-label={modal.title ?? "Plugin dialog"}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={handleKeyDown}
            >
                <header>
                    <h2>{modal.title ?? "Plugin"}</h2>
                    <button
                        className="icon-button"
                        type="button"
                        title="Close"
                        aria-label="Close"
                        onClick={close}
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </header>
                <div className="plugin-modal-body">
                    <PluginRenderSurface
                        pluginId={modal.pluginId}
                        resetKey={modal.id}
                        surface={modal.title ?? "Plugin dialog"}
                        render={() =>
                            modal.render({
                                close,
                                snapshot,
                            })
                        }
                    />
                </div>
            </section>
        </div>
    );
}

function asRecord(value: unknown): PluginCharacterExtension {
    return value && typeof value === "object" && !Array.isArray(value)
        ? { ...(value as Record<string, unknown>) }
        : {};
}

function cloneJsonRecord(
    value: PluginCharacterExtension,
): PluginCharacterExtension | undefined {
    try {
        const serialized = JSON.stringify(value);

        if (!serialized) {
            return undefined;
        }

        const parsed: unknown = JSON.parse(serialized);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as PluginCharacterExtension)
            : undefined;
    } catch {
        return undefined;
    }
}
