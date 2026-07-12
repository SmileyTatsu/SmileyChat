import type { RegexSettings } from "./settings";

export function runRules(text: string, settings: RegexSettings) {
    let result = text;
    const errors = new Map<string, string>();
    const activeProfile = settings.profiles.find(
        (p) => p.id === settings.activeProfileId,
    );

    if (!activeProfile) {
        return { errors, text: result };
    }

    for (const rule of activeProfile.rules) {
        if (!rule.enabled) continue;

        try {
            result = result.replace(
                new RegExp(rule.pattern, rule.flags),
                (...args: unknown[]) => {
                    const match = String(args[0] ?? "");
                    const captures = args
                        .slice(1, -2)
                        .map((value) => (value === undefined ? "" : String(value)));
                    const trimmed = rule.trimOut
                        ? match.split(rule.trimOut).join("")
                        : match;
                    return rule.replacement.replace(
                        /\$([$&]|\d{1,2})/g,
                        (token, key: string) => {
                            if (key === "$") return "$";
                            if (key === "&") return trimmed;
                            return captures[Number(key) - 1] ?? token;
                        },
                    );
                },
            );
        } catch (error) {
            errors.set(
                rule.id,
                error instanceof Error
                    ? error.message
                    : "This regular expression is invalid.",
            );
        }
    }

    return { errors, text: result };
}
