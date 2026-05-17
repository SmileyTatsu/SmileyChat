export function MessageReasoning(props: { reasoning: string }) {
    if (props.reasoning.length === 0) return;

    return (
        <details className="message-reasoning">
            <summary>Thought Process</summary>
            <p>{props.reasoning}</p>
        </details>
    );
}
