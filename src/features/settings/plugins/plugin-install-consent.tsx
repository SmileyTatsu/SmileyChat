import { type ComponentChildren } from "preact";
import { ShieldAlert } from "lucide-preact";

import { ConfirmDialog } from "#frontend/components/ui/confirm-dialog";
import { PluginPermissionList, PluginPermissionUnlisted } from "./plugin-permission-list";

/**
 * Only what the dialog reads. A registry entry fits, and so does the installed
 * manifest when the same dialog asks to approve one runtime permission.
 */
export type PluginConsentTarget = {
    name: string;
    permissions?: readonly string[];
};

export type PluginInstallConsentDialogProps = {
    plugin: PluginConsentTarget;
    isBusy?: boolean;
    confirmDisabled?: boolean;
    /** Defaults to the install question. */
    title?: string;
    /** Defaults to "Install". */
    confirmLabel?: string;
    /** Replaces the paragraph that explains the download. */
    intro?: ComponentChildren;
    /** Replaces the closing note about permissions not being a sandbox. */
    note?: ComponentChildren;
    onConfirm: () => void | Promise<void>;
    onClose: () => void;
};

/**
 * The dialog that asks the user to accept a set of permissions.
 *
 * Shared by three callers: the Store card (install), the update-consent dialogs
 * ("new permissions"), and the plugin card's Approvals block (approving a
 * runtime grant). Only the title, the confirm word, and the two paragraphs
 * change, so the permission list and its emphasis stay identical everywhere.
 */
export function PluginInstallConsentDialog({
    plugin,
    isBusy = false,
    confirmDisabled = false,
    title,
    confirmLabel = "Install",
    intro,
    note,
    onConfirm,
    onClose,
}: PluginInstallConsentDialogProps) {
    const permissions = plugin.permissions;

    return (
        <ConfirmDialog
            title={title ?? `Install ${plugin.name}?`}
            icon={<ShieldAlert size={19} aria-hidden="true" />}
            confirmLabel={confirmLabel}
            isBusy={isBusy}
            confirmDisabled={confirmDisabled}
            onConfirm={onConfirm}
            onClose={onClose}
            body={
                <>
                    {intro ?? (
                        <p>
                            SmileyChat will download this extension from the verified
                            registry, install it, and enable it right away.
                        </p>
                    )}
                    {permissions === undefined ? (
                        <PluginPermissionUnlisted />
                    ) : permissions.length === 0 ? (
                        <p className="plugin-permission-none">
                            This extension declares no permissions.
                        </p>
                    ) : (
                        <PluginPermissionList permissions={permissions} />
                    )}
                    {note ?? (
                        <p className="plugin-permission-note">
                            Permissions describe what a plugin may use, but they are not a
                            sandbox: installed plugins run as trusted browser code. Your
                            plugin data and settings are kept.
                        </p>
                    )}
                </>
            }
        />
    );
}
