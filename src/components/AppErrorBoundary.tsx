import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  onReset?: () => void;
};

type State = { error: Error | null; recoverKey: number; attempts: number };

const MAX_SOFT_RECOVERIES = 1;

/**
 * Soft recovery boundary — navigates home, then remounts once.
 * Never remounts the same crashing tree in-place (that caused LIVE WOLF hiccup loops).
 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, recoverKey: 0, attempts: 0 };
  private recoverTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Workspace] Render error:', error, info.componentStack);
    try {
      sessionStorage.setItem(
        'wolf_last_render_error',
        `${error?.name || 'Error'}: ${error?.message || String(error)}`,
      );
    } catch {
      /* ignore */
    }
    if (this.recoverTimer) clearTimeout(this.recoverTimer);
    const nextAttempts = this.state.attempts + 1;

    // Leave the broken tab immediately so remount cannot re-open the same crash.
    try {
      this.props.onReset?.();
    } catch {
      /* ignore */
    }

    if (nextAttempts > MAX_SOFT_RECOVERIES) {
      this.setState({ attempts: nextAttempts });
      return;
    }

    this.recoverTimer = setTimeout(() => {
      this.setState((s) => ({
        error: null,
        recoverKey: s.recoverKey + 1,
        attempts: nextAttempts,
      }));
    }, 80);
  }

  componentWillUnmount() {
    if (this.recoverTimer) clearTimeout(this.recoverTimer);
  }

  render() {
    if (this.state.error && this.state.attempts >= MAX_SOFT_RECOVERIES) {
      const detail =
        this.state.error.message ||
        (typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem('wolf_last_render_error')
          : null);
      return (
        <div className="wolf-desk-recover">
          <p>Workspace hiccup — refresh once to continue.</p>
          {detail ? <p className="wolf-desk-recover__detail">{detail}</p> : null}
          <div className="wolf-desk-recover__actions">
            <button type="button" onClick={() => this.props.onReset?.()}>
              Open home
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              Refresh
            </button>
          </div>
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
