import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

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

  handleReload = () => {
    window.location.reload();
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
            <button type="button" className="btn btn-primary" onClick={this.handleReload}>
              <RotateCcw size={16} aria-hidden="true" />
              <span>Muat Ulang Aplikasi</span>
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
