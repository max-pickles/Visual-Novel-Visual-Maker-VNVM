import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, copied: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', inset: 0,
          background: '#002244', // Dark blue "BSOD" aesthetic
          color: '#e2e8f0',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--mono), monospace',
          padding: 40,
          zIndex: 9999,
          overflowY: 'auto'
        }}>
          <div style={{ maxWidth: 800, width: '100%' }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>:(</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', marginBottom: 16 }}>
              VNV Maker encountered a fatal error.
            </h1>
            <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24 }}>
              The application crashed. We apologize for the inconvenience. 
              Please restart the app or reload the window to continue.
            </p>

            <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
              <button 
                onClick={() => window.location.reload()}
                style={{
                  background: '#fff',
                  color: '#002244',
                  border: 'none',
                  padding: '10px 24px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  borderRadius: 4
                }}
              >
                Reload Application
              </button>

              <button 
                onClick={() => {
                  const errText = `${this.state.error?.toString() || ''}\n${this.state.error?.stack || ''}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack || ''}`;
                  navigator.clipboard.writeText(errText).catch(e => console.error('Failed to copy', e));
                  this.setState({ copied: true });
                  setTimeout(() => this.setState({ copied: false }), 2000);
                }}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  padding: '10px 24px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  borderRadius: 4
                }}
              >
                {this.state.copied ? 'Copied to Clipboard!' : 'Copy Error Log'}
              </button>
            </div>

            {this.state.error && (
              <div style={{ background: 'rgba(0,0,0,0.4)', padding: 20, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 8, fontSize: 14 }}>
                  {this.state.error.toString()}
                </div>
                <pre style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                  {this.state.error.stack}
                </pre>
              </div>
            )}
            
            {this.state.errorInfo && (
              <div style={{ background: 'rgba(0,0,0,0.4)', padding: 20, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', marginTop: 16 }}>
                <div style={{ fontWeight: 700, color: '#fb923c', marginBottom: 8, fontSize: 14 }}>
                  Component Stack
                </div>
                <pre style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                  {this.state.errorInfo.componentStack}
                </pre>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
