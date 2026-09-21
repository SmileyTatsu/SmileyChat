import { Check, Settings, UserRound } from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";

import type { PersonaSummary, SmileyPersona, UserStatus } from "#frontend/types";

import { formatStatus } from "./persona-status";

type PersonaBarProps = {
    persona: SmileyPersona;
    personas: PersonaSummary[];
    status: UserStatus;
    onOpenPersonasSettings: () => void;
    onPersonaSelect: (personaId: string) => void;
    onStatusChange: (status: UserStatus) => void;
};

const statuses: UserStatus[] = ["online", "away", "dnd", "offline"];

export function PersonaBar({
    persona,
    personas,
    status,
    onOpenPersonasSettings,
    onPersonaSelect,
    onStatusChange,
}: PersonaBarProps) {
    const [statusMenuOpen, setStatusMenuOpen] = useState(false);
    const statusWrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!statusMenuOpen) {
            return;
        }

        function handlePointerDown(event: PointerEvent) {
            const statusWrap = statusWrapRef.current;

            if (!statusWrap || statusWrap.contains(event.target as Node)) {
                return;
            }

            setStatusMenuOpen(false);
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setStatusMenuOpen(false);
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
                    <div
                        className="status-menu"
                        role="menu"
                        aria-label="Persona and status menu"
                    >
                        <div className="persona-menu-header">
                            <span>Switch Persona</span>
                        </div>
                        <div
                            className="persona-picker-list"
                            role="group"
                            aria-label="Personas"
                        >
                            {personas.map((item) => (
                                <button
                                    className={item.id === persona.id ? "active" : ""}
                                    key={item.id}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        onPersonaSelect(item.id);
                                        setStatusMenuOpen(false);
                                    }}
                                >
                                    <PersonaAvatar
                                        avatarPath={item.avatar?.path}
                                        compact
                                    />
                                    <span>{item.name}</span>
                                    {item.id === persona.id && (
                                        <Check
                                            size={14}
                                            className="persona-active-check"
                                        />
                                    )}
                                </button>
                            ))}
                        </div>
                        <button
                            className="manage-personas-button"
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                onOpenPersonasSettings();
                                setStatusMenuOpen(false);
                            }}
                        >
                            <Settings size={14} />
                            <span>Manage personas</span>
                        </button>

                        <div className="persona-menu-divider" />

                        <div className="persona-status-section">
                            <div className="persona-menu-header">
                                <span>Status</span>
                            </div>
                            <div className="persona-status-grid">
                                {statuses.map((nextStatus) => (
                                    <button
                                        className={`persona-status-chip ${status === nextStatus ? "active" : ""}`}
                                        key={nextStatus}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            onStatusChange(nextStatus);
                                            setStatusMenuOpen(false);
                                        }}
                                    >
                                        <i
                                            className={`status-dot ${nextStatus}`}
                                            aria-hidden="true"
                                        />
                                        <span>{formatStatus(nextStatus)}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
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
