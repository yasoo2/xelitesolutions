import React, { useEffect, useState, useRef } from 'react';
import { SocketService } from '../services/socket';

export interface TrackerTask {
    id: string;
    label: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    startedAt?: number;
    completedAt?: number;
}

export default function TaskTracker() {
    const [tasks, setTasks] = useState<TrackerTask[]>([]);
    const [visible, setVisible] = useState(false);
    const [elapsedMs, setElapsedMs] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimeRef = useRef<number>(0);

    useEffect(() => {
        const unsub = SocketService.subscribeTaskTracker((incoming: TrackerTask[]) => {
            if (!incoming || incoming.length === 0) {
                // Run finished — keep visible briefly then fade out
                setTimeout(() => setVisible(false), 2500);
                if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
                return;
            }

            setTasks(incoming);
            setVisible(true);

            // Start elapsed timer on first task
            if (!startTimeRef.current) {
                startTimeRef.current = Date.now();
                timerRef.current = setInterval(() => {
                    setElapsedMs(Date.now() - startTimeRef.current);
                }, 100);
            }
        });

        // Reset on run_started
        const unsubSocket = SocketService.subscribe((msg: any) => {
            if (msg.type === 'run_started') {
                setTasks([]);
                setVisible(false);
                setElapsedMs(0);
                startTimeRef.current = 0;
                if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
            }
        });

        return () => { unsub(); unsubSocket(); if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    if (!visible || tasks.length === 0) return null;

    const completed = tasks.filter(t => t.status === 'completed').length;
    const total = tasks.length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const allDone = completed === total;
    const elapsed = formatElapsed(elapsedMs);

    return (
        <div className={`task-tracker ${allDone ? 'all-done' : ''}`}>
            {/* Header */}
            <div className="task-tracker-header">
                <div className="task-tracker-title">
                    <span className="task-tracker-icon">{allDone ? '✅' : '⚡'}</span>
                    <span>{allDone ? 'اكتملت المهام' : 'جاري التنفيذ...'}</span>
                </div>
                <div className="task-tracker-meta">
                    <span className="task-tracker-elapsed">{elapsed}</span>
                    <span className="task-tracker-count">{completed}/{total}</span>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="task-tracker-progress-bar">
                <div
                    className={`task-tracker-progress-fill ${allDone ? 'done' : ''}`}
                    style={{ width: `${pct}%` }}
                />
            </div>

            {/* Task List */}
            <div className="task-tracker-list">
                {tasks.map((task) => (
                    <div key={task.id} className={`task-tracker-item status-${task.status}`}>
                        <div className="task-tracker-item-icon">
                            {task.status === 'completed' && <CheckmarkIcon />}
                            {task.status === 'in_progress' && <SpinnerIcon />}
                            {task.status === 'failed' && <FailIcon />}
                            {task.status === 'pending' && <PendingIcon />}
                        </div>
                        <span className="task-tracker-item-label">{task.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function CheckmarkIcon() {
    return (
        <svg className="task-checkmark" viewBox="0 0 24 24" width="18" height="18">
            <circle className="task-checkmark-circle" cx="12" cy="12" r="10" fill="none" stroke="#22c55e" strokeWidth="2" />
            <path className="task-checkmark-path" d="M7 12.5l3 3 7-7" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function SpinnerIcon() {
    return (
        <svg className="task-spinner" viewBox="0 0 24 24" width="18" height="18">
            <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(99,102,241,0.2)" strokeWidth="2" />
            <path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
    );
}

function FailIcon() {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18">
            <circle cx="12" cy="12" r="10" fill="none" stroke="#ef4444" strokeWidth="2" />
            <path d="M8 8l8 8M16 8l-8 8" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function PendingIcon() {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18">
            <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(148,163,184,0.4)" strokeWidth="2" strokeDasharray="4 3" />
        </svg>
    );
}

function formatElapsed(ms: number): string {
    if (ms < 1000) return '0s';
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}m ${rem}s`;
}
