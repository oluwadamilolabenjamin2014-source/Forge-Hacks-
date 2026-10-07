import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

/**
 * Errors are shown, never swallowed — a blank screen tells you nothing.
 * But the catcher is deliberately narrow: benign browser noise (ResizeObserver
 * notifications, cross-origin "Script error.") must not take the app down.
 */
const BENIGN = [/ResizeObserver loop/i, /^Script error\.?$/, /Non-Error promise rejection/i];

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[forge:ui] render error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ padding: 32, fontFamily: 'ui-sans-serif, system-ui', color: '#e8edf7', background: '#0b0f17', minHeight: '100vh' }}>
        <h1 style={{ fontSize: 18, marginBottom: 4 }}>The interface hit an error</h1>
        <p style={{ color: '#93a1bd', fontSize: 13, maxWidth: 620, lineHeight: 1.6 }}>
          It fails loudly rather than pretending to work. Most often this means the API is not running — start it with{' '}
          <code style={{ color: '#fdba74' }}>npm start</code> and reload.
        </p>
        <pre
          style={{
            background: '#121826',
            border: '1px solid #23304a',
            padding: 16,
            borderRadius: 12,
            overflow: 'auto',
            fontSize: 12,
            maxHeight: 240,
          }}
        >
          {String(error.stack || error.message)}
        </pre>
        <button
          type="button"
          onClick={() => location.reload()}
          style={{ background: '#f97316', color: '#0b0f17', border: 0, borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' }}
        >
          Reload
        </button>
      </div>
    );
  }
}

/** Last-resort net for errors thrown outside React's tree (event handlers, timers). */
function WindowErrorGuard() {
  React.useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = String(event.message || '');
      if (BENIGN.some((re) => re.test(message))) return;
      console.error('[forge:ui] uncaught', event.error || message);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      console.error('[forge:ui] unhandled rejection', event.reason);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}

const container = document.getElementById('root');
if (!container) throw new Error('missing #root');

createRoot(container).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WindowErrorGuard />
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
