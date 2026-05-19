import type { ChatGenerationMessage } from "../connections/types";
import type { PromptInjection } from "./types";

export type PromptOutletRegistry = {
    add(outletName: string, injection: PromptInjection): void;
    render(outletName: string): string;
};

export function createPromptOutletRegistry(
    injections: PromptInjection[] = [],
): PromptOutletRegistry {
    const outlets = new Map<string, PromptInjection[]>();

    function add(outletName: string, injection: PromptInjection) {
        const key = normalizeOutletName(outletName);

        if (!key) {
            return;
        }

        const current = outlets.get(key) ?? [];
        current.push(injection);
        outlets.set(key, current);
    }

    const registry: PromptOutletRegistry = {
        add,
        render(outletName) {
            return sortPromptInjections(
                outlets.get(normalizeOutletName(outletName)) ?? [],
            )
                .map((injection) => injection.content.trim())
                .filter(Boolean)
                .join("\n\n");
        },
    };

    for (const injection of injections) {
        if (injection.anchor === "outlet") {
            registry.add(injection.outletName ?? "", injection);
        }
    }

    return registry;
}

export function sortPromptInjections(injections: PromptInjection[]) {
    return [...injections].sort((left, right) => {
        const priority = (right.priority ?? 0) - (left.priority ?? 0);

        if (priority !== 0) {
            return priority;
        }

        const order = left.order - right.order;

        if (order !== 0) {
            return order;
        }

        return left.id.localeCompare(right.id);
    });
}

export function promptInjectionToMessage(
    injection: PromptInjection,
): ChatGenerationMessage {
    return {
        role: injection.role,
        content: injection.content,
    };
}

function normalizeOutletName(value: string) {
    return value.trim().toLowerCase();
}
