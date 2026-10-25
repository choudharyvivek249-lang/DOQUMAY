import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/app.css';

/**
 * Top-level ErrorBoundary to prevent blank white screens
 * If any component throws during render, displays clear recovery UI with reset button.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('DoquMay ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#faf5ff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}>
          <div style={{
            maxWidth: '460px',
            width: '100%',
            background: '#ffffff',
            borderRadius: '24px',
            padding: '32px 24px',
            boxShadow: '0 10px 40px rgba(99, 102, 241, 0.12)',
            border: '1.5px solid #e9d5ff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}>
            <span style={{ fontSize: '3rem' }}>⚡</span>
            <h2 style={{ margin: 0, color: '#1e1b4b', fontSize: '1.4rem', fontWeight: 800 }}>
              DoquMay Loading Issue
            </h2>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem', lineHeight: 1.5 }}>
              A temporary issue occurred while initializing the application. Tap the button below to reset the cache and start fresh.
            </p>
            {this.state.error && (
              <pre style={{
                width: '100%',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '12px',
                padding: '12px',
                color: '#dc2626',
                fontSize: '0.78rem',
                textAlign: 'left',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: '160px',
                boxSizing: 'border-box',
              }}>
                {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
              </pre>
            )}
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                width: '100%',
                minHeight: '48px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 800,
                fontSize: '1rem',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.25)',
              }}
            >
              🔄 Reset Cache &amp; Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
