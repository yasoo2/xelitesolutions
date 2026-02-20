import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallbackTitle?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    private handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    width: '100%',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    padding: 20,
                    textAlign: 'center',
                    gap: 12,
                    border: '1px solid var(--border-color)',
                    borderRadius: 8
                }}>
                    <AlertTriangle size={32} color="#ef4444" />
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {this.props.fallbackTitle || 'تعذّر تحميل المكون'}
                    </div>
                    {this.state.error && (
                        <div style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            fontFamily: 'monospace',
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {this.state.error.message}
                        </div>
                    )}
                    <button
                        onClick={this.handleRetry}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 12px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 6,
                            fontSize: 12,
                            cursor: 'pointer',
                            color: 'var(--text-primary)'
                        }}
                    >
                        <RefreshCw size={14} />
                        إعادة المحاولة
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
