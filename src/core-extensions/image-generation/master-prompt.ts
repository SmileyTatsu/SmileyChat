export const PROMPT_MACRO = "{{prompt}}";

export type MasterPromptParts = {
    prefix: string;
    suffix: string;
};

export function splitMasterPrompt(template: string): MasterPromptParts {
    const first = template.indexOf(PROMPT_MACRO);
    const last = template.lastIndexOf(PROMPT_MACRO);

    if (first < 0) {
        throw new Error(`Master prompt must contain ${PROMPT_MACRO}.`);
    }
    if (first !== last) {
        throw new Error(`Master prompt must contain ${PROMPT_MACRO} exactly once.`);
    }

    return {
        prefix: template.slice(0, first),
        suffix: template.slice(first + PROMPT_MACRO.length),
    };
}

export function compileMasterPrompt(template: string, prompt: string) {
    const { prefix, suffix } = splitMasterPrompt(template);
    return `${prefix}${prompt}${suffix}`;
}
