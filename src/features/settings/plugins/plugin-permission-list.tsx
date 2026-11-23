import { AlertTriangle, ShieldAlert } from "lucide-preact";

import { describePluginPermissions } from "./plugin-permissions";

export function PluginPermissionList({
    permissions,
    label = "Permissions",
}: {
    permissions: readonly string[];
    label?: string;
}) {
    const described = describePluginPermissions(permissions);

    if (described.length === 0) {
        return null;
    }

    return (
        <div className="plugin-permissions">
            <span>{label}</span>
            <ul className="plugin-permission-list">
                {described.map((permission) => (
                    <li
                        key={permission.key}
                        className={
                            permission.highImpact
                                ? "plugin-permission-high-impact"
                                : undefined
                        }
                    >
                        <span className="plugin-permission-name">
                            {permission.highImpact && (
                                <ShieldAlert size={11} aria-hidden="true" />
                            )}
                            {permission.label}
                        </span>
                        <small>{permission.description}</small>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function PluginPermissionUnlisted() {
    return (
        <div className="plugin-permission-unlisted" role="note">
            <AlertTriangle size={13} aria-hidden="true" />
            <span>
                Permissions not listed by the registry, so SmileyChat cannot show what
                this extension asks for before installing.
            </span>
        </div>
    );
}
