import { Component, type ComponentChildren } from "preact";

import { getPluginDisplayName } from "#frontend/lib/plugins/registry";

type PluginErrorBoundaryProps = {
    children: ComponentChildren;
    fallback?: ComponentChildren;
    pluginName: string;
    resetKey?: string;
    surface?: string;
};

type PluginErrorBoundaryState = {
    errorMessage: string;
    hasError: boolean;
};

export class PluginErrorBoundary extends Component<
    PluginErrorBoundaryProps,
    PluginErrorBoundaryState
> {
    state: PluginErrorBoundaryState = {
        errorMessage: "",
        hasError: false,
    };

    static getDerivedStateFromError(error: unknown): PluginErrorBoundaryState {
        return {
            errorMessage: error instanceof Error ? error.message : String(error),
            hasError: true,
        };
    }

    componentDidCatch(error: unknown) {
        console.warn(`${this.props.pluginName} plugin UI failed to render:`, error);
    }

    componentDidUpdate(previousProps: PluginErrorBoundaryProps) {
        if (
            this.state.hasError &&
            previousProps.resetKey !== this.props.resetKey
        ) {
            this.setState({ errorMessage: "", hasError: false });
        }
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback !== undefined) {
                return this.props.fallback;
            }

            return (
                <div className="plugin-error-boundary" role="alert">
                    <strong>{this.props.pluginName} failed to render.</strong>
                    {this.props.surface && <span>{this.props.surface}</span>}
                    {this.state.errorMessage && <code>{this.state.errorMessage}</code>}
                </div>
            );
        }

        return this.props.children;
    }
}

type PluginRenderSurfaceProps = {
    fallback?: ComponentChildren;
    pluginId: string;
    resetKey?: string;
    surface?: string;
    render: () => ComponentChildren;
};

export function PluginRenderSurface({
    fallback,
    pluginId,
    resetKey,
    surface,
    render,
}: PluginRenderSurfaceProps) {
    const pluginName = getPluginDisplayName(pluginId);

    return (
        <PluginErrorBoundary
            fallback={fallback}
            pluginName={pluginName}
            resetKey={resetKey}
            surface={surface}
        >
            <PluginRenderInvocation render={render} />
        </PluginErrorBoundary>
    );
}

function PluginRenderInvocation({ render }: { render: () => ComponentChildren }) {
    return <>{render()}</>;
}

export function pluginIdFromScopedId(id: string) {
    return id.split(":")[0] || id;
}
