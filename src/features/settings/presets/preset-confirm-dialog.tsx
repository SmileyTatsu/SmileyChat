import { ConfirmDialog } from "#frontend/components/ui/confirm-dialog";

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
        <ConfirmDialog
            title={action.title}
            message={action.message}
            details={action.details}
            confirmLabel={action.confirmLabel}
            variant="danger"
            onConfirm={action.onConfirm}
            onClose={onClose}
        />
    );
}
