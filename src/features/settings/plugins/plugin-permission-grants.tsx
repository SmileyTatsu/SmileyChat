import { KeyRound, ShieldAlert } from "lucide-preact";
import { useState } from "preact/hooks";
import type { FunctionComponent } from "preact";

import type { GrantablePluginPermission } from "#frontend/lib/plugins/grants";

import {
    describePluginGrants,
    pluginGrantCopy,
    type PluginGrantDescriptor,
    type PluginGrantIcon,
} from "./plugin-grant-descriptors";
import { PluginInstallConsentDialog } from "./plugin-install-consent";
import { PluginServerStatus } from "./plugin-server-status";
import type { PluginServerStatusLine } from "./plugin-settings-helpers";

const GRANT_ICONS: Record<
    PluginGrantIcon,
    FunctionComponent<{ size?: number | string }>
> = {
    key: KeyRound,
    shield: ShieldAlert,
};

/**
 * Runtime approvals a plugin needs beyond declaring a permission.
 *
 * Install consent answers "what does the artifact ask for?". Reading saved API
 * keys, or running code on this computer, is a decision the user can revisit
 * long after install, so each one is a separate, revocable switch that the
 * plugin card owns. The copy lives in `plugin-grant-descriptors.ts`; this file
 * only renders what the manifest declares.
 */
export function PluginPermissionGrants({
    pluginName,
    declared,
    granted,
    serverStatus,
    busy,
    onToggle,
}: {
    pluginName: string;
    declared: readonly string[];
    granted: readonly string[];
    /** Compact line for the optional server module, when the card derives one. */
    serverStatus?: PluginServerStatusLine;
    busy?: boolean;
    onToggle: (permission: GrantablePluginPermission, granted: boolean) => void;
}) {
    const offerable = describePluginGrants(declared);
    const [confirming, setConfirming] = useState<PluginGrantDescriptor | null>(null);

    if (offerable.length === 0 && !serverStatus) {
        return null;
    }

    function confirmGrant(grant: PluginGrantDescriptor) {
        setConfirming(null);
        onToggle(grant.permission, true);
    }

    return (
        <>
            <div className="plugin-grants">
                <span>Approvals</span>
                <PluginServerStatus line={serverStatus} />
                {offerable.length > 0 && (
                    <ul className="plugin-grant-list">
                        {offerable.map((grant) => {
                            const isGranted = granted.includes(grant.permission);
                            const Icon = GRANT_ICONS[grant.icon];
                            const classes = [
                                grant.highImpact ? "plugin-grant-high-impact" : "",
                                isGranted ? "plugin-grant-granted" : "",
                            ]
                                .filter(Boolean)
                                .join(" ");

                            return (
                                <li
                                    key={grant.permission}
                                    className={classes || undefined}
                                >
                                    <div className="plugin-grant-copy">
                                        <span className="plugin-permission-name">
                                            <Icon size={11} aria-hidden="true" />
                                            {grant.label}
                                        </span>
                                        <small>
                                            {isGranted
                                                ? grant.grantedNote
                                                : grant.pendingNote}
                                        </small>
                                    </div>
                                    <label
                                        className="plugin-toggle"
                                        title={
                                            isGranted
                                                ? grant.tooltip.revoke
                                                : grant.tooltip.grant
                                        }
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isGranted}
                                            disabled={busy}
                                            onChange={(event) =>
                                                onToggle(
                                                    grant.permission,
                                                    event.currentTarget.checked,
                                                )
                                            }
                                            onClick={(event) => {
                                                // Approving must not be skippable:
                                                // hold the switch where it is until
                                                // the shared dialog says yes.
                                                if (
                                                    isGranted ||
                                                    !grant.requiresConfirmation
                                                ) {
                                                    return;
                                                }

                                                event.preventDefault();
                                                setConfirming(grant);
                                            }}
                                        />
                                        <span
                                            className="plugin-toggle-track"
                                            aria-hidden="true"
                                        >
                                            <span />
                                        </span>
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {confirming?.confirm && (
                <PluginInstallConsentDialog
                    plugin={{
                        name: pluginName,
                        permissions: [confirming.permission],
                    }}
                    title={pluginGrantCopy(confirming.confirm.title, pluginName)}
                    confirmLabel="Approve"
                    intro={<p>{pluginGrantCopy(confirming.confirm.intro, pluginName)}</p>}
                    note={
                        <p className="plugin-permission-note">
                            {pluginGrantCopy(confirming.confirm.note, pluginName)}
                        </p>
                    }
                    isBusy={busy}
                    onConfirm={() => confirmGrant(confirming)}
                    onClose={() => setConfirming(null)}
                />
            )}
        </>
    );
}
