import { Trash2 } from "lucide-preact";
import { useEffect, useMemo, useState } from "preact/hooks";

import {
    acceptPipelineReview,
    cancelPipelineRun,
    getPipelineRunState,
    rejectPipelineReview,
    subscribeToPipelineRun,
    truncatePipelineReviewFrom,
    type PipelineRunState,
} from "./controller";
import { diffSideBySide, type DiffPiece, type SideBySideDiffRow } from "./diff";

type PostProcessingModalProps = {
    close: () => void;
};

type ReviewSelection = "final" | number;

export function PostProcessingModal({ close }: PostProcessingModalProps) {
    const [state, setState] = useState<PipelineRunState>(getPipelineRunState());
    const [reviewSelection, setReviewSelection] = useState<ReviewSelection>("final");

    useEffect(
        () =>
            subscribeToPipelineRun(() => {
                const nextState = getPipelineRunState();
                setState(nextState);
            }),
        [],
    );

    useEffect(() => {
        if (state.status !== "review") {
            setReviewSelection("final");
            return;
        }

        if (typeof reviewSelection === "number" && !state.snapshots[reviewSelection]) {
            setReviewSelection("final");
        }
    }, [reviewSelection, state]);

    const changeSummary = useMemo(() => {
        if (state.status !== "review") {
            return { changed: 0, original: 0, result: 0 };
        }

        return {
            changed: Math.abs(state.finalText.length - state.originalText.length),
            original: state.originalText.length,
            result: state.finalText.length,
        };
    }, [state]);

    const reviewComparison = useMemo(() => {
        if (state.status !== "review") {
            return {
                label: "Pipeline result",
                original: "",
                revised: "",
            };
        }

        if (typeof reviewSelection === "number") {
            const snapshot = state.snapshots[reviewSelection];

            if (snapshot) {
                return {
                    label: snapshot.passName,
                    original: snapshot.input,
                    revised: snapshot.output,
                };
            }
        }

        return {
            label: "Pipeline result",
            original: state.originalText,
            revised: state.finalText,
        };
    }, [reviewSelection, state]);

    const diffRows = useMemo(
        () => diffSideBySide(reviewComparison.original, reviewComparison.revised),
        [reviewComparison],
    );

    if (state.status === "idle") {
        return (
            <section className="spp-modal">
                <div className="spp-empty">No post-processing run is active.</div>
            </section>
        );
    }

    if (state.status === "running") {
        const progress = `${state.currentPassIndex + 1} / ${state.passCount}`;

        return (
            <section className="spp-modal">
                <div className="spp-run-header">
                    <div>
                        <span>
                            {state.mode === "auto" ? "Automatic run" : "Manual run"}
                        </span>
                        <strong>{state.passName}</strong>
                    </div>
                    <div className="spp-progress-pill">{progress}</div>
                </div>

                <div
                    className="spp-progress-bar"
                    aria-label="Post-processing progress"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={state.passCount}
                    aria-valuenow={state.currentPassIndex + 1}
                >
                    <span
                        style={{
                            width: `${Math.round(
                                ((state.currentPassIndex + 1) / state.passCount) * 100,
                            )}%`,
                        }}
                    />
                </div>

                <label className="spp-live-output">
                    <span>Live pass output</span>
                    <textarea readOnly value={state.streamedText} />
                </label>

                <footer className="spp-modal-actions">
                    <button
                        type="button"
                        className="danger-button"
                        onClick={cancelPipelineRun}
                    >
                        Cancel
                    </button>
                </footer>
            </section>
        );
    }

    return (
        <section className="spp-modal">
            <div className="spp-review-header">
                <div>
                    <span>{state.error ? "Fallback ready" : "Review changes"}</span>
                    <strong>
                        {changeSummary.original.toLocaleString()} {"->"}{" "}
                        {changeSummary.result.toLocaleString()} chars
                    </strong>
                    <small>{reviewComparison.label}</small>
                </div>
                <div className="spp-progress-pill">
                    {state.snapshots.length.toLocaleString()} pass
                    {state.snapshots.length === 1 ? "" : "es"}
                </div>
            </div>

            {state.error && <div className="spp-error">{state.error}</div>}

            <div className="spp-review-grid">
                <section
                    className="spp-diff-panel"
                    aria-label="Original text differences"
                >
                    <header>
                        <span>Original</span>
                        <small>Removed</small>
                    </header>
                    <div className="spp-diff-output">
                        {diffRows.length > 0 ? (
                            diffRows.map((row, index) => (
                                <DiffLine
                                    key={`original-${index}`}
                                    pieces={row.original}
                                    row={row}
                                    side="original"
                                />
                            ))
                        ) : (
                            <span className="spp-diff-empty">No text changes.</span>
                        )}
                    </div>
                </section>
                <section className="spp-diff-panel" aria-label="Revised text differences">
                    <header>
                        <span>New</span>
                        <small>Added</small>
                    </header>
                    <div className="spp-diff-output">
                        {diffRows.length > 0 ? (
                            diffRows.map((row, index) => (
                                <DiffLine
                                    key={`revised-${index}`}
                                    pieces={row.revised}
                                    row={row}
                                    side="revised"
                                />
                            ))
                        ) : (
                            <span className="spp-diff-empty">No text changes.</span>
                        )}
                    </div>
                </section>
            </div>

            <details className="spp-pass-details">
                <summary>Pass history</summary>
                <div>
                    <article className={reviewSelection === "final" ? "active" : ""}>
                        <button type="button" onClick={() => setReviewSelection("final")}>
                            <strong>Pipeline result</strong>
                            <small>
                                {state.originalText.length.toLocaleString()} {"->"}{" "}
                                {state.finalText.length.toLocaleString()} chars
                            </small>
                        </button>
                    </article>
                    {state.snapshots.map((snapshot, index) => (
                        <article
                            className={reviewSelection === index ? "active" : ""}
                            key={`${snapshot.passId}-${snapshot.passName}`}
                        >
                            <button
                                type="button"
                                onClick={() => setReviewSelection(index)}
                            >
                                <strong>{snapshot.passName}</strong>
                                {snapshot.error && <span>{snapshot.error}</span>}
                                <small>
                                    {snapshot.input.length.toLocaleString()} {"->"}{" "}
                                    {snapshot.output.length.toLocaleString()} chars
                                </small>
                            </button>
                            <button
                                type="button"
                                className="danger-button"
                                aria-label={`Delete ${snapshot.passName} and following passes from this review`}
                                title="Delete this and following passes"
                                onClick={() =>
                                    truncateReviewFrom(index, snapshot.passName)
                                }
                            >
                                <Trash2 size={14} aria-hidden="true" />
                            </button>
                        </article>
                    ))}
                </div>
            </details>

            <footer className="spp-modal-actions">
                <button
                    type="button"
                    className="primary"
                    onClick={() => {
                        acceptPipelineReview(state.finalText);
                        close();
                    }}
                >
                    Accept
                </button>
                <button
                    type="button"
                    onClick={() => {
                        rejectPipelineReview();
                        close();
                    }}
                >
                    Reject
                </button>
            </footer>
        </section>
    );
}

function truncateReviewFrom(snapshotIndex: number, passName: string) {
    if (
        !window.confirm(
            `Delete "${passName}" and every following pass from this review? The accepted result will revert to the text before that pass.`,
        )
    ) {
        return;
    }

    truncatePipelineReviewFrom(snapshotIndex);
}

function DiffLine({
    pieces,
    row,
    side,
}: {
    pieces: DiffPiece[];
    row: SideBySideDiffRow;
    side: "original" | "revised";
}) {
    const isEmpty = pieces.length === 0;

    return (
        <div className={`spp-diff-line ${side} ${row.type}${isEmpty ? "empty" : ""}`}>
            {isEmpty ? (
                <span aria-hidden="true"> </span>
            ) : (
                pieces.map((piece, index) => (
                    <DiffPieceView key={`${piece.type}-${index}`} piece={piece} />
                ))
            )}
        </div>
    );
}

function DiffPieceView({ piece }: { piece: DiffPiece }) {
    if (piece.type === "equal") {
        return <span>{piece.text}</span>;
    }

    return <mark className={`spp-diff-token ${piece.type}`}>{piece.text}</mark>;
}
