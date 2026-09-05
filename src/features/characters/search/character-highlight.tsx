import {
    highlightText,
    type MatchRange,
} from "#frontend/lib/characters/character-search";

export type CharacterHighlightProps = {
    text: string;
    ranges: MatchRange[];
    className?: string;
};

export function CharacterHighlight({ text, ranges, className }: CharacterHighlightProps) {
    const segments = highlightText(text, ranges);

    return (
        <span className={className}>
            {segments.map((segment, index) =>
                segment.isMatch ? (
                    <mark key={index} className="character-search-highlight">
                        {segment.text}
                    </mark>
                ) : (
                    <span key={index}>{segment.text}</span>
                ),
            )}
        </span>
    );
}
