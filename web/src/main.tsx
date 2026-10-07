import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [error, setError] = React.useState<Error | null>(null);
  if (error) {
    return (
      <div style={{ padding: 32, fontFamily: 'ui-sans-serif, system-ui', color: '#e8edf7', background: '#0b0f17', minHeight: '100vh' }}>
        <h1 style={{ fontSize: 18 }}>The UI hit an error</h1>
        <p style={{ color: '#93a1bd', fontSize: 13 }}>The API may be down. This page fails loudly rather than showing an empty shell.</p>
        <pre style={{ background: '#121826', border: '1px solid #23304a', padding: 16, borderRadius: 12, overflow: 'auto', fontSize: 12 }}>{String(error.stack || error.message)}</pre>
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
  return (
    <React.Fragment>
      {React.Children.map(children, (child) => (React.isValidElement(child) ? child : null))}
      <SilentCatcher onError={setError} />
    </React.Fragment>
  );
}

/** Catches render-time errors thrown anywhere below. */
function SilentCatcher({ onError }: { onError: (e: Error) => void }) {
  React.useEffect(() => {
    const handler = (event: ErrorEvent) => onError(event.error || new Error(event.message));
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, [onError]);
  return null;
}

const container = document.getElementById('root');
if (!container) throw new Error('missing #root');
createRoot(container).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
