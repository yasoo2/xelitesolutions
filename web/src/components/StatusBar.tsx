import React from 'react';
import { GitBranch } from 'lucide-react';

interface StatusBarProps {
    isConnected?: boolean;
    branch?: string;
    language?: string;
    sessionId?: string;
}

export default function StatusBar({
    isConnected = true,
    branch = 'main',
    language = 'TypeScript',
    sessionId
}: StatusBarProps) {
    return (
        <footer className="joe-statusbar">
            {/* Left Side */}
            <div className="joe-statusbar-left">
                <div className="joe-status-item">
                    <span className={`joe-status-dot ${isConnected ? '' : 'disconnected'}`} />
                    <span>{isConnected ? 'Connected to Joe AI Network' : 'Disconnected'}</span>
                </div>
            </div>

            {/* Right Side */}
            <div className="joe-statusbar-right">
                {sessionId && (
                    <div className="joe-status-item">
                        <span style={{ opacity: 0.7 }}>Session:</span>
                        <span>{sessionId.slice(0, 8)}...</span>
                    </div>
                )}
                <div className="joe-status-item">
                    <GitBranch size={14} />
                    <span>{branch}</span>
                </div>
                <div className="joe-status-item">
                    <span>{language}</span>
                </div>
            </div>
        </footer>
    );
}
