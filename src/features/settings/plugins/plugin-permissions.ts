/**
 * Human-readable presentation for plugin permission labels.
 *
 * Permission strings are defined by `src/lib/plugins/registry.ts` (enforced at
 * runtime) and declared by plugins in `plugin.json`. This module only turns them
 * into labels and short descriptions for install consent and plugin cards.
 */

export type PluginPermissionInfo = {
    key: string;
    label: string;
    description: string;
    /** Permissions that can read data, spend tokens, or rewrite chat content. */
    highImpact: boolean;
};

const HIGH_IMPACT_PERMISSIONS = new Set([
    "state:read",
    "model:generate",
    "network:fetch",
    "connections:secrets",
    "connections:providers",
    "chat:input",
    "chat:prompt",
    "chat:output",
    "chat:message-update",
    "actions",
    "tools:register",
]);

const PERMISSION_DETAILS: Record<string, { label: string; description: string }> = {
    "state:read": {
        label: "Read app state",
        description: "Sees the active chat, character, persona, and other app data.",
    },
    actions: {
        label: "Run app actions",
        description: "Adds messages to the chat and triggers app actions without you.",
    },
    "model:generate": {
        label: "Generate replies",
        description: "Calls the AI model on your behalf and spends provider tokens.",
    },
    "network:fetch": {
        label: "Fetch web requests",
        description: "Sends requests from your machine to sites outside SmileyChat.",
    },
    "connections:secrets": {
        label: "Use connection secrets",
        description: "Can read the API keys saved for your model connections.",
    },
    "connections:providers": {
        label: "Register connections",
        description: "Routes chat requests and settings through its own connection code.",
    },
    "chat:input": {
        label: "Rewrite your input",
        description: "Can change what you send before the AI sees it.",
    },
    "chat:prompt": {
        label: "Rewrite prompts",
        description: "Can change the compiled prompt sent to the AI.",
    },
    "chat:prompt-context": {
        label: "Add prompt context",
        description: "Injects extra context into prompts.",
    },
    "chat:prompt-inject": {
        label: "Inject prompt blocks",
        description: "Adds its own text blocks into the prompt at a chosen depth.",
    },
    "chat:output": {
        label: "Rewrite AI replies",
        description: "Can change AI replies before they are saved to the chat.",
    },
    "chat:display": {
        label: "Change message display",
        description: "Alters how messages are rendered in the chat.",
    },
    "chat:message-update": {
        label: "Edit stored messages",
        description: "Can modify messages already saved in a chat.",
    },
    "presets:macros": {
        label: "Add preset macros",
        description: "Provides and resolves {{macro}} placeholders in presets.",
    },
    "tools:register": {
        label: "Register AI tools",
        description: "Exposes tools that the AI can call during a chat.",
    },
    "commands:register": {
        label: "Add slash commands",
        description: "Registers composer commands and options.",
    },
    events: {
        label: "Listen to app events",
        description: "Subscribes to app events and can emit its own.",
    },
    storage: {
        label: "Store plugin data",
        description: "Keeps its own JSON data in the plugin folder.",
    },
    "ui:settings": {
        label: "Add settings panel",
        description: "Adds a section to Options.",
    },
    "ui:sidebar": {
        label: "Add sidebar panel",
        description: "Adds a panel to the left sidebar.",
    },
    "ui:character-details": {
        label: "Extend character panel",
        description: "Adds a section to the character info panel.",
    },
    "ui:messages": {
        label: "Render messages",
        description: "Provides the renderer for chat message bubbles.",
    },
    "ui:message-actions": {
        label: "Add message actions",
        description: "Adds buttons to the message hover actions.",
    },
    "ui:composer": {
        label: "Add composer actions",
        description: "Adds buttons and options to the message composer.",
    },
    "ui:composer-state": {
        label: "Change composer state",
        description: "Can prefill or lock the message composer.",
    },
    "ui:header": {
        label: "Add header actions",
        description: "Adds buttons to the chat header.",
    },
    "ui:modals": {
        label: "Open dialogs",
        description: "Can open its own modal windows over the app.",
    },
    "ui:styles": {
        label: "Add styles",
        description: "Injects its own CSS into the app.",
    },
};

export function isHighImpactPermission(permission: string) {
    return HIGH_IMPACT_PERMISSIONS.has(permission);
}

export function describePluginPermission(permission: string): PluginPermissionInfo {
    const key = permission.trim();
    const details = PERMISSION_DETAILS[key];

    return {
        key,
        label: details?.label ?? formatPermissionKey(key),
        description:
            details?.description ??
            "No description available for this permission. Check the plugin source.",
        highImpact: isHighImpactPermission(key),
    };
}

export function describePluginPermissions(
    permissions: readonly string[] | undefined,
): PluginPermissionInfo[] {
    const seen = new Set<string>();
    const described: PluginPermissionInfo[] = [];

    for (const permission of permissions ?? []) {
        const info = describePluginPermission(permission);

        if (!info.key || seen.has(info.key)) {
            continue;
        }

        seen.add(info.key);
        described.push(info);
    }

    return described;
}

/**
 * Permissions a registry entry adds on top of the installed plugin manifest.
 * Used to decide whether an update needs a fresh consent step.
 */
export function findNewPluginPermissions(
    registryPermissions: readonly string[] | undefined,
    installedPermissions: readonly string[] | undefined,
) {
    const installed = new Set(
        (installedPermissions ?? [])
            .map((permission) => permission.trim())
            .filter(Boolean),
    );
    const added = new Set<string>();

    for (const permission of registryPermissions ?? []) {
        const key = permission.trim();

        if (key && !installed.has(key)) {
            added.add(key);
        }
    }

    return [...added];
}

/** Joins permission labels for prose: "Chat output", "Chat output and Styles". */
export function formatPluginPermissionList(permissions: readonly string[]) {
    const labels = describePluginPermissions(permissions).map((info) => info.label);

    if (labels.length === 0) {
        return "";
    }

    if (labels.length === 1) {
        return labels[0];
    }

    if (labels.length === 2) {
        return `${labels[0]} and ${labels[1]}`;
    }

    return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function formatPermissionKey(permission: string) {
    return permission
        .replace(/[:_-]+/g, " ")
        .trim()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
