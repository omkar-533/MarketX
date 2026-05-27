import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  onReset?: () => void;
};

type State = { error: Error | null };

/** Catches errors inside logged-in workspace — login page stays usable */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Workspace] Render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 min-h-[50vh] text-center">
          <h2 className="text-lg font-semibold text-slate-100">This page failed to load</h2>
          <p className="text-sm text-slate-400 max-w-md">{this.state.error.message}</p>
          <div className="flex gap-3">
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-gold/20 text-gold border border-gold/40 text-sm font-medium hover:bg-gold/30"
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset?.();
              }}
            >
              Go to Dashboard
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg border border-dark-border text-slate-400 text-sm hover:text-slate-200"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
