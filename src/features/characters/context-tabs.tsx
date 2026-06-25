type ContextTab = "entity" | "chat";

type ContextTabsProps = {
    activeTab: ContextTab;
    entityLabel: string;
    hasActiveChatDetails: boolean;
    idBase: string;
    onTabChange: (tab: ContextTab) => void;
};

const tabs: ContextTab[] = ["entity", "chat"];

export function ContextTabs({
    activeTab,
    entityLabel,
    hasActiveChatDetails,
    idBase,
    onTabChange,
}: ContextTabsProps) {
    function tabLabel(tab: ContextTab) {
        return tab === "entity" ? entityLabel : "Chat Details";
    }

    function handleKeyDown(event: KeyboardEvent, tab: ContextTab) {
        const currentIndex = tabs.indexOf(tab);
        let nextIndex = currentIndex;

        if (event.key === "ArrowRight") {
            nextIndex = (currentIndex + 1) % tabs.length;
        } else if (event.key === "ArrowLeft") {
            nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        } else if (event.key === "Home") {
            nextIndex = 0;
        } else if (event.key === "End") {
            nextIndex = tabs.length - 1;
        } else {
            return;
        }

        event.preventDefault();
        const nextTab = tabs[nextIndex];

        onTabChange(nextTab);
        requestAnimationFrame(() => {
            document.getElementById(tabId(idBase, nextTab))?.focus();
        });
    }

    return (
        <div className="context-tabs" role="tablist" aria-label="Context sidebar">
            {tabs.map((tab) => (
                <button
                    key={tab}
                    id={tabId(idBase, tab)}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab}
                    aria-controls={panelId(idBase, tab)}
                    tabIndex={activeTab === tab ? 0 : -1}
                    className={activeTab === tab ? "active" : ""}
                    onClick={() => onTabChange(tab)}
                    onKeyDown={(event) => handleKeyDown(event, tab)}
                >
                    <span>{tabLabel(tab)}</span>
                    {tab === "chat" && hasActiveChatDetails && (
                        <span
                            className="context-tab-dot"
                            aria-label="Chat details active"
                        />
                    )}
                </button>
            ))}
        </div>
    );
}

export function tabId(idBase: string, tab: ContextTab) {
    return `${idBase}-${tab}-tab`;
}

export function panelId(idBase: string, tab: ContextTab) {
    return `${idBase}-${tab}-panel`;
}

export type { ContextTab };
