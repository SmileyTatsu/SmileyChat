import { Settings, UserRound, Users } from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { PersonaSummary, SmileyPersona, UserStatus } from "../../types";
import { formatStatus } from "./personaStatus";

type PersonaBarProps = {
    persona: SmileyPersona;
    personas: PersonaSummary[];
    status: UserStatus;
    onOpenSettings: () => void;
    onOpenPersonasSettings: () => void;
    onPersonaSelect: (personaId: string) => void;
    onStatusChange: (status: UserStatus) => void;
};

const statuses: UserStatus[] = ["online", "away", "dnd", "offline"];

export function PersonaBar({
    persona,
    personas,
    status,
    onOpenSettings,
    onOpenPersonasSettings,
    onPersonaSelect,
    onStatusChange,
}: PersonaBarProps) {
    const [statusMenuOpen, setStatusMenuOpen] = useState(false);
    const [personaPanelOpen, setPersonaPanelOpen] = useState(false);
    const statusWrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!statusMenuOpen) {
            setPersonaPanelOpen(false);
            return;
        }

        function handlePointerDown(event: PointerEvent) {
            const statusWrap = statusWrapRef.current;

            if (!statusWrap || statusWrap.contains(event.target as Node)) {
                return;
            }

            setStatusMenuOpen(false);
            setPersonaPanelOpen(false);
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setStatusMenuOpen(false);
                setPersonaPanelOpen(false);
            }
        }

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [statusMenuOpen]);

    return (
        <section className="persona-bar" aria-label="Selected persona">
            <div className="persona-status-wrap" ref={statusWrapRef}>
                <button
                    className="persona-main"
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={statusMenuOpen}
                    onClick={() => {
                        setStatusMenuOpen((open) => !open);
                        setPersonaPanelOpen(false);
                    }}
                >
                    <PersonaAvatar avatarPath={persona.avatar?.path} />
                    <div className="persona-details">
                        <strong>{persona.name}</strong>
                        <span>
                            <i className={`status-dot ${status}`} aria-hidden="true" />
                            {formatStatus(status)}
                        </span>
                    </div>
                </button>

                {statusMenuOpen && (
                    <div className="status-menu" role="menu">
                        {statuses.map((nextStatus) => (
                            <button
                                className={status === nextStatus ? "active" : ""}
                                key={nextStatus}
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    onStatusChange(nextStatus);
                                    setStatusMenuOpen(false);
                                    setPersonaPanelOpen(false);
                                }}
                            >
                                <i
                                    className={`status-dot ${nextStatus}`}
                                    aria-hidden="true"
                                />
                                {formatStatus(nextStatus)}
                            </button>
                        ))}
                        <div
                            className="persona-menu-wrap"
                            onMouseEnter={() => setPersonaPanelOpen(true)}
                            onMouseLeave={() => setPersonaPanelOpen(false)}
                        >
                            <button
                                type="button"
                                role="menuitem"
                                onFocus={() => setPersonaPanelOpen(true)}
                            >
                                <Users size={15} />
                                Personas
                            </button>
                            {personaPanelOpen && (
                                <div
                                    className="persona-picker-panel"
                                    role="menu"
                                    aria-label="Personas"
                                >
                                    <div className="persona-picker-list">
                                        {personas.map((item) => (
                                            <button
                                                className={
                                                    item.id === persona.id ? "active" : ""
                                                }
                                                key={item.id}
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    onPersonaSelect(item.id);
                                                    setPersonaPanelOpen(false);
                                                    setStatusMenuOpen(false);
                                                }}
                                            >
                                                <PersonaAvatar
                                                    avatarPath={item.avatar?.path}
                                                    compact
                                                />
                                                <span>{item.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        className="manage-personas-button"
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            onOpenPersonasSettings();
                                            setPersonaPanelOpen(false);
                                            setStatusMenuOpen(false);
                                        }}
                                    >
                                        Manage personas
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <button
                className="persona-settings"
                type="button"
                title="Open settings"
                onClick={onOpenSettings}
            >
                <Settings size={18} />
            </button>
        </section>
    );
}

function PersonaAvatar({
    compact,
    avatarPath,
}: {
    avatarPath?: string;
    compact?: boolean;
}) {
    return (
        <div className={compact ? "persona-avatar compact" : "persona-avatar"}>
            {avatarPath ? (
                <img src={avatarPath} alt="" />
            ) : (
                <UserRound size={compact ? 15 : 18} />
            )}
        </div>
    );
}
