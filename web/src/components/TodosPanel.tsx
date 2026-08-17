import React, { useEffect, useState } from 'react';
import { SocketService } from '../services/socket';
import { CheckCircle2, Circle, Clock, XCircle, ChevronDown, ChevronRight, Activity } from 'lucide-react';

export interface TodoItem {
    id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    content: string;
}

interface TodosPanelProps {
    sessionId?: string;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

export default function TodosPanel({ sessionId, isCollapsed = false, onToggleCollapse }: TodosPanelProps) {
    const [todos, setTodos] = useState<TodoItem[]>([]);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);

    /**
     * THE LIST BELONGS TO ITS CONVERSATION. This component already ACCEPTED a
     * sessionId and never once looked at it: every todo_update from any run was
     * merged in, and nothing cleared on a session switch — so a second chat
     * opened wearing the first one's task list. Found by sweeping the invariant
     * «anything that displays a run must be keyed by the run's session», not by
     * a bug report.
     */
    useEffect(() => { setTodos([]); setLastUpdated(null); }, [sessionId]);

    useEffect(() => {
        // Listen for todo updates from the socket
        const unsub = SocketService.subscribe((msg: any) => {
            if (msg.type === 'todo_update') {
                const data = msg.data;
                if (!data || !data.todos) return;
                const sid = String(msg.sessionId || data.sessionId || '').trim();
                if (sessionId && sid !== sessionId) return;

                setTodos(prev => {
                    if (!data.merge) {
                        return data.todos;
                    }

                    const newTodosMap = new Map(prev.map(todo => [todo.id, todo]));
                    data.todos.forEach((incoming: TodoItem) => {
                        newTodosMap.set(incoming.id, incoming);
                    });

                    return Array.from(newTodosMap.values());
                });

                if (data.timestamp) {
                    setLastUpdated(data.timestamp);
                }
            }
        }, sessionId);

        return () => unsub();
    }, [sessionId]);

    if (todos.length === 0) {
        return null; // Don't show the panel if there are no tasks
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle2 size={16} className="text-emerald-500" />;
            case 'in_progress': return <Activity size={16} className="text-blue-500 animate-pulse" />;
            case 'cancelled': return <XCircle size={16} className="text-slate-500" />;
            case 'pending':
            default: return <Circle size={16} className="text-slate-400" />;
        }
    };

    const activeCount = todos.filter(t => t.status === 'in_progress').length;
    const completedCount = todos.filter(t => t.status === 'completed').length;
    const totalCount = todos.length;
    const isAllDone = completedCount === totalCount && totalCount > 0;

    return (
        <div className={`joe-todos-panel ${isCollapsed ? 'collapsed' : ''} ${isAllDone ? 'all-done' : ''}`}>
            <div className="joe-todos-header" onClick={onToggleCollapse}>
                <div className="joe-todos-title-group">
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <h3 className="joe-todos-title">Agent Tasks</h3>
                    {activeCount > 0 && (
                        <span className="joe-todos-badge active">{activeCount} Active</span>
                    )}
                </div>
                <div className="joe-todos-progress">
                    <span className="joe-todos-count">{completedCount}/{totalCount}</span>
                </div>
            </div>

            {!isCollapsed && (
                <div className="joe-todos-list">
                    {todos.map((todo) => (
                        <div key={todo.id} className={`joe-todo-item status-${todo.status}`}>
                            <div className="joe-todo-icon">
                                {getStatusIcon(todo.status)}
                            </div>
                            <div className="joe-todo-content">
                                {todo.content}
                            </div>
                        </div>
                    ))}
                    {lastUpdated && (
                        <div className="joe-todos-footer">
                            <Clock size={12} />
                            <span>Updated {new Date(lastUpdated).toLocaleTimeString()}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
