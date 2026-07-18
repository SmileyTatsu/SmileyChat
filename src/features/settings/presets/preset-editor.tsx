import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-preact";
import type { JSX } from "preact";
import { useState } from "preact/hooks";

import { cn } from "#frontend/lib/common/style";
import type {
    PresetInjectionPosition,
    PresetPrompt,
    PresetPromptOrderEntry,
    PresetPromptRole,
} from "#frontend/lib/presets/types";

export type OrderedPrompt = {
    entry: PresetPromptOrderEntry;
    prompt: PresetPrompt;
};

type PresetEditorProps = {
    orderedPrompts: OrderedPrompt[];
    selectedPrompt: PresetPrompt | undefined;
    selectedPromptId: string;
    selectedPromptOrderEntry: PresetPromptOrderEntry | undefined;
    onAddPrompt: () => void;
    onDeleteSelectedPrompt: () => void;
    onMovePrompt: (promptId: string, direction: -1 | 1) => void;
    onReorderPrompt: (promptId: string, targetPromptId: string) => void;
    onSelectPrompt: (promptId: string) => void;
    onUpdateOrderEntry: (promptId: string, enabled: boolean) => void;
    onUpdatePrompt: (promptId: string, nextPrompt: Partial<PresetPrompt>) => void;
};

export function PresetEditor({
    orderedPrompts,
    selectedPrompt,
    selectedPromptId,
    selectedPromptOrderEntry,
    onAddPrompt,
    onDeleteSelectedPrompt,
    onMovePrompt,
    onReorderPrompt,
    onSelectPrompt,
    onUpdateOrderEntry,
    onUpdatePrompt,
}: PresetEditorProps) {
    const [draggedPromptId, setDraggedPromptId] = useState("");
    const [dropTargetPromptId, setDropTargetPromptId] = useState("");

    function clearDragState() {
        setDraggedPromptId("");
        setDropTargetPromptId("");
    }

    function handleDragStart(
        event: JSX.TargetedDragEvent<HTMLButtonElement>,
        promptId: string,
    ) {
        setDraggedPromptId(promptId);
        event.dataTransfer?.setData("text/plain", promptId);

        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
        }
    }

    function handleDragOver(
        event: JSX.TargetedDragEvent<HTMLDivElement>,
        promptId: string,
    ) {
        if (!draggedPromptId || draggedPromptId === promptId) {
            return;
        }

        event.preventDefault();
        setDropTargetPromptId(promptId);

        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }
    }

    function handleDrop(
        event: JSX.TargetedDragEvent<HTMLDivElement>,
        targetPromptId: string,
    ) {
        event.preventDefault();

        const sourcePromptId =
            draggedPromptId || event.dataTransfer?.getData("text/plain") || "";

        if (sourcePromptId && sourcePromptId !== targetPromptId) {
            onReorderPrompt(sourcePromptId, targetPromptId);
        }

        clearDragState();
    }

    return (
        <div className="preset-editor">
            <section className="prompt-order-panel" aria-label="Prompt order">
                <div className="preset-section-header">
                    <h3>Prompt order</h3>
                    <button type="button" onClick={onAddPrompt}>
                        <Plus size={15} />
                        Prompt
                    </button>
                </div>

                <div className="prompt-list">
                    {orderedPrompts.map(({ entry, prompt }, index) => (
                        <div
                            className={cn("prompt-row", {
                                active: selectedPromptId === prompt.id,
                                dragging: draggedPromptId === prompt.id,
                                "drop-target": dropTargetPromptId === prompt.id,
                            })}
                            key={prompt.id}
                            onDragLeave={() => {
                                if (dropTargetPromptId === prompt.id) {
                                    setDropTargetPromptId("");
                                }
                            }}
                            onDragOver={(event) => handleDragOver(event, prompt.id)}
                            onDrop={(event) => handleDrop(event, prompt.id)}
                        >
                            <button
                                aria-label={`Drag ${prompt.title} to reorder`}
                                className="prompt-drag-handle"
                                draggable
                                title="Drag to reorder"
                                type="button"
                                onDragEnd={clearDragState}
                                onDragStart={(event) => handleDragStart(event, prompt.id)}
                            >
                                <GripVertical size={16} />
                            </button>

                            <input
                                aria-label={`Enable ${prompt.title}`}
                                type="checkbox"
                                checked={entry.enabled}
                                onInput={(event) =>
                                    onUpdateOrderEntry(
                                        prompt.id,
                                        event.currentTarget.checked,
                                    )
                                }
                            />
                            <button
                                type="button"
                                onClick={() => onSelectPrompt(prompt.id)}
                            >
                                <strong>{prompt.title}</strong>
                                <small>{prompt.role}</small>
                            </button>

                            <span className="prompt-move-buttons">
                                <button
                                    aria-label="Move prompt up"
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onMovePrompt(prompt.id, -1);
                                    }}
                                >
                                    <ArrowUp size={14} />
                                </button>
                                <button
                                    aria-label="Move prompt down"
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onMovePrompt(prompt.id, 1);
                                    }}
                                >
                                    <ArrowDown size={14} />
                                </button>
                            </span>
                            <em>{index + 1}</em>
                        </div>
                    ))}
                </div>
            </section>

            <section className="prompt-detail-panel" aria-label="Prompt details">
                {selectedPrompt ? (
                    <>
                        <div className="preset-section-header">
                            <h3>Prompt</h3>
                            <div className="prompt-detail-actions">
                                <label className="prompt-enabled-toggle">
                                    <input
                                        type="checkbox"
                                        checked={
                                            selectedPromptOrderEntry?.enabled ?? true
                                        }
                                        onChange={(event) =>
                                            onUpdateOrderEntry(
                                                selectedPrompt.id,
                                                event.currentTarget.checked,
                                            )
                                        }
                                    />
                                    <span
                                        className="prompt-enabled-track"
                                        aria-hidden="true"
                                    >
                                        <span />
                                    </span>
                                    <span>Enabled</span>
                                </label>

                                <button
                                    className="danger-button"
                                    type="button"
                                    onClick={onDeleteSelectedPrompt}
                                >
                                    <Trash2 size={15} />
                                    Delete
                                </button>
                            </div>
                        </div>
                        <div className="prompt-detail-fields">
                            <label>
                                Title
                                <input
                                    value={selectedPrompt.title}
                                    onInput={(event) =>
                                        onUpdatePrompt(selectedPrompt.id, {
                                            title: event.currentTarget.value,
                                        })
                                    }
                                />
                            </label>
                            <div className="preset-field-grid">
                                <label>
                                    Role
                                    <select
                                        value={selectedPrompt.role}
                                        onInput={(event) =>
                                            onUpdatePrompt(selectedPrompt.id, {
                                                role: event.currentTarget
                                                    .value as PresetPromptRole,
                                            })
                                        }
                                    >
                                        <option value="system">System</option>
                                        <option value="user">User</option>
                                        <option value="assistant">Assistant</option>
                                    </select>
                                </label>
                                <label>
                                    Injection
                                    <select
                                        value={selectedPrompt.injectionPosition}
                                        onInput={(event) =>
                                            onUpdatePrompt(selectedPrompt.id, {
                                                injectionPosition: event.currentTarget
                                                    .value as PresetInjectionPosition,
                                            })
                                        }
                                    >
                                        <option value="none">None</option>
                                        <option value="before">Before</option>
                                        <option value="after">After</option>
                                    </select>
                                </label>
                                <label>
                                    Depth
                                    <input
                                        disabled={
                                            selectedPrompt.injectionPosition === "none"
                                        }
                                        min={0}
                                        type="number"
                                        value={selectedPrompt.injectionDepth}
                                        onInput={(event) =>
                                            onUpdatePrompt(selectedPrompt.id, {
                                                injectionDepth: Number(
                                                    event.currentTarget.value,
                                                ),
                                            })
                                        }
                                    />
                                </label>
                            </div>
                            <p className="field-hint">
                                Injection inserts this prompt around a conversation
                                message. Depth 0 targets the latest message, 1 targets the
                                previous message, and higher values move farther back in
                                the chat.
                            </p>
                            <label className="prompt-content-field">
                                Content
                                <textarea
                                    className="preset-prompt-content"
                                    value={selectedPrompt.content}
                                    onInput={(event) =>
                                        onUpdatePrompt(selectedPrompt.id, {
                                            content: event.currentTarget.value,
                                        })
                                    }
                                />
                            </label>
                        </div>
                    </>
                ) : (
                    <p className="muted-copy">No prompt selected.</p>
                )}
            </section>
        </div>
    );
}
