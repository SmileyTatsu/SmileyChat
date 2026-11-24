import { ShieldAlert } from "lucide-preact";

import { ConfirmDialog } from "#frontend/components/ui/confirm-dialog";
import type { PluginRegistryEntry } from "#frontend/lib/api/client";
import { PluginPermissionList, PluginPermissionUnlisted } from "./plugin-permission-list";

export type PluginInstallConsentDialogProps = {
    plugin: PluginRegistryEntry;
    isBusy?: boolean;
    confirmDisabled?: boolean;
    onConfirm: () => void | Promise<void>;
    onClose: () => void;
};

/**
 * The "install this extension?" dialog.
 *
 * Shared by the Store card and the notice for extensions that moved out of the
 * bundle, so an extension always shows the same permissions before it is
 * installed — no matter which button started the install. A plugin that was
 * already installed only asks again for permissions it did not declare before;
 * that case lives in the Store card, since only it knows the installed version.
 */
export function PluginInstallConsentDialog({
    plugin,
    isBusy = false,
    confirmDisabled = false,
    onConfirm,
    onClose,
}: PluginInstallConsentDialogProps) {
    const permissions = plugin.permissions;

    return (
        <ConfirmDialog
            title={`Install ${plugin.name}?`}
            icon={<ShieldAlert size={19} aria-hidden="true" />}
            confirmLabel="Install"
            isBusy={isBusy}
            confirmDisabled={confirmDisabled}
            onConfirm={onConfirm}
            onClose={onClose}
            body={
                <>
                    <p>
                        SmileyChat will download this extension from the verified
                        registry, install it, and enable it right away.
                    </p>
                    {permissions === undefined ? (
                        <PluginPermissionUnlisted />
                    ) : permissions.length === 0 ? (
                        <p className="plugin-permission-none">
                            This extension declares no permissions.
                        </p>
                    ) : (
                        <PluginPermissionList permissions={permissions} />
                    )}
                    <p className="plugin-permission-note">
                        Permissions describe what a plugin may use, but they are not a
                        sandbox: installed plugins run as trusted browser code. Your
                        plugin data and settings are kept.
                    </p>
                </>
            }
        />
    );
}
