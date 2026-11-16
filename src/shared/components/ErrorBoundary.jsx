import React from 'react';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { logger } from '../../infrastructure/logging/logger.js';

/**
 * Top-level Error Boundary protecting portals against uncaught UI crashes.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Terjadi kesalahan pada tampilan aplikasi.',
    };
  }

  componentDidCatch(error, errorInfo) {
    logger.error('ui', 'Uncaught render error in ErrorBoundary', {
      message: error?.message || 'unknown',
      componentStack: errorInfo?.componentStack ? errorInfo.componentStack.slice(0, 300) : '',
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.assign('/');
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="auth-page" role="alert">
          <section className="panel auth-card" style={{ display: 'grid', gap: '14px' }}>
            <div className="badge badge-danger" style={{ width: 'fit-content' }}>
              <AlertTriangle size={14} aria-hidden="true" />
              <span>UI Error Boundary</span>
            </div>
            <h1 style={{ margin: 0, fontSize: '22px' }}>Aplikasi Mengalami Gangguan Tampilan</h1>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
              {this.state.message}
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={this.handleReload}>
                <RotateCcw size={16} aria-hidden="true" />
                <span>Muat Ulang Aplikasi</span>
              </button>
              <button type="button" className="btn" onClick={this.handleGoHome}>
                <Home size={16} aria-hidden="true" />
                <span>Kembali ke Beranda</span>
              </button>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
