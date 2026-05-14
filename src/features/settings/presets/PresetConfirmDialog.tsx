import { AlertTriangle, Trash2 } from "lucide-preact";

export type PresetConfirmAction = {
    title: string;
    message: string;
    details?: string[];
    confirmLabel: string;
    onConfirm: () => void;
};

type PresetConfirmDialogProps = {
    action: PresetConfirmAction;
    onClose: () => void;
};

export function PresetConfirmDialog({ action, onClose }: PresetConfirmDialogProps) {
    return (
        <div className="message-confirm-backdrop" role="presentation" onClick={onClose}>
            <section
                className="message-confirm-dialog compact"
                role="dialog"
                aria-modal="true"
                aria-label={action.title}
                onClick={(event) => event.stopPropagation()}
            >
                <header>
                    <AlertTriangle size={19} />
                    <h2>{action.title}</h2>
                </header>
                <p>{action.message}</p>
                {action.details && action.details.length > 0 && (
                    <div className="preset-confirm-details">
                        {action.details.map((detail) => (
                            <p key={detail}>{detail}</p>
                        ))}
                    </div>
                )}
                <div className="message-confirm-actions">
                    <button type="button" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className="danger-button"
                        type="button"
                        onClick={() => {
                            action.onConfirm();
                            onClose();
                        }}
                    >
                        <Trash2 size={15} />
                        {action.confirmLabel}
                    </button>
                </div>
            </section>
        </div>
    );
}
