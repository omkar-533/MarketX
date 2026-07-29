import { Component, type ErrorInfo, type ReactNode } from 'react';
import WolfLoader from './WolfLoader';

type Props = {
  children: ReactNode;
  onReset?: () => void;
};

type State = { error: Error | null; recoverKey: number };

/**
 * Soft recovery boundary — never shows a scary "failed" screen.
 * Logs the error, remounts children, and falls back to Dashboard.
 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, recoverKey: 0 };
  private recoverTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Workspace] Render error (recovering quietly):', error, info.componentStack);
    if (this.recoverTimer) clearTimeout(this.recoverTimer);
    this.recoverTimer = setTimeout(() => {
      this.props.onReset?.();
      this.setState((s) => ({ error: null, recoverKey: s.recoverKey + 1 }));
    }, 50);
  }

  componentWillUnmount() {
    if (this.recoverTimer) clearTimeout(this.recoverTimer);
  }

  render() {
    if (this.state.error) {
      return <WolfLoader />;
    }
    return (
      <div key={this.state.recoverKey} className="app-error-boundary">
        {this.props.children}
      </div>
    );
  }
}
