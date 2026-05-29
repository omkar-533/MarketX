import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[App] Render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-[#0a0e17] text-slate-200">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-slate-400 max-w-md text-center font-mono break-all">
            {this.state.error.message}
          </p>
          <p className="text-xs text-slate-600 max-w-md text-center">
            Hard refresh (Ctrl+Shift+R). If it repeats, send this message to support.
          </p>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-gold/20 text-gold border border-gold/40 text-sm font-medium hover:bg-gold/30"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
