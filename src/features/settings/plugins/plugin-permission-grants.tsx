import { KeyRound } from "lucide-preact";

import {
    type GrantablePluginPermission,
    GRANTABLE_PLUGIN_PERMISSIONS,
} from "#frontend/lib/plugins/grants";

import { describePluginPermissions } from "./plugin-permissions";

/**
 * Runtime approvals a plugin needs beyond declaring a permission.
 *
 * Install consent answers "what does the artifact ask for?". Reading saved API
 * keys is different: the answer can change long after install, so it is a
 * separate, revocable switch that the plugin card owns.
 */
export function PluginPermissionGrants({
    declared,
    granted,
    busy,
    onToggle,
}: {
    declared: readonly string[];
    granted: readonly string[];
    busy?: boolean;
    onToggle: (permission: GrantablePluginPermission, granted: boolean) => void;
}) {
    const offerable = GRANTABLE_PLUGIN_PERMISSIONS.filter((permission) =>
        declared.includes(permission),
    );

    if (offerable.length === 0) {
        return null;
    }

    return (
        <div className="plugin-grants">
            <span>Approvals</span>
            <ul className="plugin-grant-list">
                {offerable.map((permission) => {
                    const described = describePluginPermissions([permission])[0];
                    const isGranted = granted.includes(permission);

                    return (
                        <li
                            key={permission}
                            className={isGranted ? "plugin-grant-granted" : undefined}
                        >
                            <div className="plugin-grant-copy">
                                <span className="plugin-permission-name">
                                    <KeyRound size={11} aria-hidden="true" />
                                    {described?.label ?? permission}
                                </span>
                                <small>
                                    {isGranted
                                        ? "Can read the API keys saved for your model connections until you turn this off."
                                        : "Needs your approval before it can read saved API keys. Only enable this for plugins you trust with those keys."}
                                </small>
                            </div>
                            <label
                                className="plugin-toggle"
                                title={
                                    isGranted
                                        ? "Revoke access to connection secrets"
                                        : "Allow access to connection secrets"
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={isGranted}
                                    disabled={busy}
                                    onChange={(event) =>
                                        onToggle(permission, event.currentTarget.checked)
                                    }
                                />
                                <span className="plugin-toggle-track" aria-hidden="true">
                                    <span />
                                </span>
                            </label>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
