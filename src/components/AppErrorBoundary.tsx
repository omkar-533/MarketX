import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  onReset?: () => void;
};

type State = { error: Error | null; recoverKey: number; attempts: number };

const MAX_SOFT_RECOVERIES = 2;

/**
 * Soft recovery boundary — remounts children a few times, then stays put.
 * Never loops WolfLoader forever (that caused full-screen flicker).
 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, recoverKey: 0, attempts: 0 };
  private recoverTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Workspace] Render error:', error, info.componentStack);
    if (this.recoverTimer) clearTimeout(this.recoverTimer);
    const nextAttempts = this.state.attempts + 1;
    if (nextAttempts > MAX_SOFT_RECOVERIES) {
      this.setState({ attempts: nextAttempts });
      return;
    }
    this.recoverTimer = setTimeout(() => {
      this.props.onReset?.();
      this.setState((s) => ({
        error: null,
        recoverKey: s.recoverKey + 1,
        attempts: s.attempts + 1,
      }));
    }, 120);
  }

  componentWillUnmount() {
    if (this.recoverTimer) clearTimeout(this.recoverTimer);
  }

  render() {
    if (this.state.error && this.state.attempts >= MAX_SOFT_RECOVERIES) {
      return (
        <div className="wolf-desk-recover">
          <p>Workspace hiccup — refresh once to continue.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      );
    }
    if (this.state.error) {
      return <div className="wolf-desk-recover wolf-desk-recover--quiet" aria-busy="true" />;
    }
    return (
      <div key={this.state.recoverKey} className="app-error-boundary">
        {this.props.children}
      </div>
    );
  }
}
