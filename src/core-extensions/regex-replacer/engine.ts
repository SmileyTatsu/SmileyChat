import type { ChatGenerationMessage } from "#frontend/lib/connections/types";
import type { Message, MessageRole } from "#frontend/types";

import { getRegexSettings, type RegexRule } from "./settings";

export type RegexTarget = keyof RegexRule["targets"];
export type RegexRunOptions = {
    depth?: number;
    destination: RegexRule["destination"];
    macroResolver?: (value: string) => string;
    target: RegexTarget;
};

export function runRegexPass(text: string, options: RegexRunOptions): string {
    const settings = getRegexSettings();
    const profile = settings.profiles.find(
        (item) => item.id === settings.activeProfileId,
    );

    if (!settings.enabled || !text || !profile) return text;

    return profile.rules.reduce((current, rule) => {
        if (
            rule.destination !== options.destination ||
            !rule.enabled ||
            !rule.targets[options.target] ||
            !isInDepth(rule, options.depth)
        ) {
            return current;
        }

        try {
            const pattern = options.macroResolver?.(rule.pattern) ?? rule.pattern;
            const regex = new RegExp(pattern, rule.flags);
            return current.replace(regex, (...args: unknown[]) =>
                replacementForMatch(args, rule),
            );
        } catch (error) {
            console.warn(`Regex Replacer: Invalid rule "${rule.description}"`, error);
            return current;
        }
    }, text);
}

export function appliesToDestination(
    rule: RegexRule,
    destination: RegexRule["destination"],
) {
    return rule.destination === destination;
}

export function depthForMessage(messages: Message[], messageId: string) {
    const index = messages.findIndex((message) => message.id === messageId);
    return index < 0 ? 0 : messages.length - 1 - index;
}

export function targetForMessage(message: Message): RegexTarget | undefined {
    return message.role === "user"
        ? "userInput"
        : message.role === "character"
          ? "aiResponse"
          : undefined;
}

export function targetForPromptMessage(
    message: ChatGenerationMessage,
): RegexTarget | undefined {
    if (message.reasoning) return "reasoning";
    if (message.role === "user") return "userInput";
    if (message.role === "assistant") return "aiResponse";
    return "worldInfo";
}

function isInDepth(rule: RegexRule, depth: number | undefined) {
    const currentDepth = depth ?? 0;
    return (
        currentDepth >= rule.minDepth &&
        (rule.maxDepth < 0 || currentDepth <= rule.maxDepth)
    );
}

function replacementForMatch(args: unknown[], rule: RegexRule) {
    const match = String(args[0] ?? "");
    const captures = args
        .slice(1, -2)
        .map((value) => (value === undefined ? "" : String(value)));
    const trimmed = rule.trimOut ? match.split(rule.trimOut).join("") : match;

    return rule.replacement.replace(/\$([$&`']|\d{1,2})/g, (token, key: string) => {
        if (key === "$") return "$";
        if (key === "&") return trimmed;
        if (key === "`") return "";
        if (key === "'") return "";
        const capture = captures[Number(key) - 1];
        return capture ?? token;
    });
}
