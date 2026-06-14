type AppStartupScreenProps = {
    error?: string;
    label: string;
    onRetry?: () => void;
};

export function AppStartupScreen({ error, label, onRetry }: AppStartupScreenProps) {
    const messageRows = [
        "long",
        "medium",
        "wide",
        "short",
        "medium",
        "long",
        "wide",
        "medium",
        "short",
        "long",
        "wide",
        "medium",
    ];

    return (
        <main
            className={`app-startup-screen ${error ? "error" : "loading"}`}
            aria-busy={error ? undefined : "true"}
        >
            <section className="startup-stage" aria-label="SmileyChat startup">
                <div className="startup-sidebar" aria-hidden="true">
                    <div className="startup-mark" />
                    <div className="startup-line wide" />
                    <div className="startup-line" />
                    <div className="startup-list">
                        <div />
                        <div />
                        <div />
                    </div>
                    <div className="startup-persona" />
                </div>
                <div className="startup-chat" aria-hidden="true">
                    <div className="startup-chat-header">
                        <div className="startup-avatar" />
                        <div>
                            <div className="startup-line title" />
                            <div className="startup-line short" />
                        </div>
                    </div>
                    <div className="startup-messages">
                        {messageRows.map((row, index) => (
                            <div
                                className={`startup-message ${row}`}
                                key={`${row}-${index}`}
                            />
                        ))}
                    </div>
                    <div className="startup-composer" />
                </div>
                <div className="startup-panel" aria-hidden="true">
                    <div className="startup-avatar large" />
                    <div className="startup-line wide" />
                    <div className="startup-line" />
                    <div className="startup-block" />
                </div>
            </section>
            <div className="startup-copy" role={error ? "alert" : "status"}>
                <p className="startup-kicker">SmileyChat</p>
                <h1>{error ? "Could not load the app" : label}</h1>
                {error ? (
                    <>
                        <p>{error}</p>
                        {onRetry ? (
                            <button type="button" onClick={onRetry}>
                                Retry
                            </button>
                        ) : null}
                    </>
                ) : (
                    <p>Preparing your chat workspace.</p>
                )}
            </div>
        </main>
    );
}
