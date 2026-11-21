import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Last line of defence: if a page crashes while rendering, show a calm message with a way out
 * instead of a blank screen. It resets when the person navigates somewhere else (resetKey).
 */
interface Props { children: ReactNode; resetKey?: string; home?: string }
interface State { error: Error | null }

const isChunkError = (e: Error) => /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically imported module/i.test(`${e.name} ${e.message}`);

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Page crashed:', error, info.componentStack); }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = isChunkError(error);
    return (
      <div className="crash" role="alert">
        <div className="crash-card">
          <div className="crash-ic" aria-hidden="true">!</div>
          <h1>{stale ? 'A newer version is available' : 'Something went wrong on this page'}</h1>
          <p>
            {stale
              ? 'The app was updated while this page was open. Reload to continue. Nothing you saved has been lost.'
              : 'This is not your fault, and your saved data is safe. Try reloading the page. If it keeps happening, go back to the dashboard and tell us what you were doing.'}
          </p>
          <div className="crash-actions">
            <button className="btn" onClick={() => window.location.reload()}>Reload the page</button>
            <a className="btn secondary" href={this.props.home || '/'}>Go to the start</a>
          </div>
        </div>
      </div>
    );
  }
}
