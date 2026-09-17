import { ConfirmDialog } from "#frontend/components/ui/confirm-dialog";

export type PresetConfirmAction = {
    title: string;
    message: string;
    details?: string[];
    confirmLabel: string;
    onConfirm: () => void | Promise<void>;
};

type PresetConfirmDialogProps = {
    action: PresetConfirmAction;
    onClose: () => void;
};

export function PresetConfirmDialog({ action, onClose }: PresetConfirmDialogProps) {
    async function handleConfirm() {
        await action.onConfirm();
        onClose();
    }

    return (
        <ConfirmDialog
            title={action.title}
            message={action.message}
            details={action.details}
            confirmLabel={action.confirmLabel}
            variant="danger"
            onConfirm={handleConfirm}
            onClose={onClose}
        />
    );
}
