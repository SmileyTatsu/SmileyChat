import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-preact";
import type {
    PresetInjectionPosition,
    PresetPrompt,
    PresetPromptOrderEntry,
    PresetPromptRole,
} from "../../../lib/presets/types";

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
                            className={[
                                "prompt-row",
                                selectedPromptId === prompt.id ? "active" : "",
                                draggedPromptId === prompt.id ? "dragging" : "",
                                dropTargetPromptId === prompt.id ? "drop-target" : "",
                            ]
                                .filter(Boolean)
                                .join(" ")}
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
                                        (event.currentTarget as HTMLInputElement).checked,
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
                            <button type="button" onClick={onDeleteSelectedPrompt}>
                                <Trash2 size={15} />
                                Delete
                            </button>
                        </div>
                        <label>
                            Title
                            <input
                                value={selectedPrompt.title}
                                onInput={(event) =>
                                    onUpdatePrompt(selectedPrompt.id, {
                                        title: (event.currentTarget as HTMLInputElement)
                                            .value,
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
                                            role: (
                                                event.currentTarget as HTMLSelectElement
                                            ).value as PresetPromptRole,
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
                                            injectionPosition: (
                                                event.currentTarget as HTMLSelectElement
                                            ).value as PresetInjectionPosition,
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
                                    disabled={selectedPrompt.injectionPosition === "none"}
                                    min={0}
                                    type="number"
                                    value={selectedPrompt.injectionDepth}
                                    onInput={(event) =>
                                        onUpdatePrompt(selectedPrompt.id, {
                                            injectionDepth: Number(
                                                (event.currentTarget as HTMLInputElement)
                                                    .value,
                                            ),
                                        })
                                    }
                                />
                            </label>
                        </div>
                        <p className="field-hint">
                            Injection inserts this prompt around a conversation message.
                            Depth 0 targets the latest message, 1 targets the previous
                            message, and higher values move farther back in the chat.
                        </p>
                        <div className="preset-toggle-row compact">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={selectedPromptOrderEntry?.enabled ?? true}
                                    onInput={(event) =>
                                        onUpdateOrderEntry(
                                            selectedPrompt.id,
                                            (event.currentTarget as HTMLInputElement)
                                                .checked,
                                        )
                                    }
                                />
                                Enabled
                            </label>
                        </div>
                        <label>
                            Content
                            <textarea
                                className="preset-prompt-content"
                                value={selectedPrompt.content}
                                onInput={(event) =>
                                    onUpdatePrompt(selectedPrompt.id, {
                                        content: (
                                            event.currentTarget as HTMLTextAreaElement
                                        ).value,
                                    })
                                }
                            />
                        </label>
                    </>
                ) : (
                    <p className="muted-copy">No prompt selected.</p>
                )}
            </section>
        </div>
    );
}
