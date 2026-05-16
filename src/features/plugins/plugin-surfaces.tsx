import { X } from "lucide-preact";
import { useEffect, useRef } from "preact/hooks";

import {
    closePluginModal,
    getPluginModalInstances,
    getPluginSidebarPanels,
} from "#frontend/lib/plugins/registry";
import { createPluginStorage } from "#frontend/lib/plugins/runtime";
import type {
    PluginAppSnapshot,
    PluginModalInstance,
    PluginSidebarPanel,
} from "#frontend/lib/plugins/types";

type PluginSidebarPanelsProps = {
    side: PluginSidebarPanel["side"];
    snapshot: PluginAppSnapshot;
};

type PluginModalHostProps = {
    snapshot: PluginAppSnapshot;
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
                            {panel.render({
                                pluginId,
                                snapshot,
                                storage: createPluginStorage(pluginId),
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
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
                        onClick={close}
                    >
                        <X size={18} />
                    </button>
                </header>
                <div className="plugin-modal-body">
                    {modal.render({
                        close,
                        snapshot,
                    })}
                </div>
            </section>
        </div>
    );
}

function pluginIdFromScopedId(id: string) {
    return id.split(":")[0] || id;
}
