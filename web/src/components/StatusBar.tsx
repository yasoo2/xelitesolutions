import React, { useState, useEffect } from 'react';
import { GitBranch, Clock } from 'lucide-react';
import { APP_VERSION } from '../version';

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
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const formattedTime = currentTime.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });

    return (
        <footer className="joe-statusbar">
            {/* Left Side */}
            <div className="joe-statusbar-left">
                <div className="joe-status-item">
                    <span className={`joe-status-dot ${isConnected ? '' : 'disconnected'}`} />
                    <span>{isConnected ? 'Connected to Joe AI Network' : 'Disconnected'}</span>
                </div>
                <div className="joe-status-item">
                    <Clock size={14} />
                    <span>{formattedTime}</span>
                </div>
            </div>

            {/* Right Side */}
            <div className="joe-statusbar-right">
                <div className="joe-status-item">
                    <span style={{ opacity: 0.7 }}>v{APP_VERSION}</span>
                </div>
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
