/**
 * Providers regularly end a completion with stray blank lines, and every adapter
 * used to `trim()` the whole reply. That also removed the leading indentation of
 * code blocks, quoted verse and nested lists, so only the tail is trimmed now.
 */
export function trimGeneratedText(text: string) {
    return text.trimEnd();
}
