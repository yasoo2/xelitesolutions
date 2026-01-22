import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../config';

interface QueuedTask {
    id: string;
    message: string;
    timestamp: Date;
    priority: 'high' | 'normal';
    relatedToCurrentTask: boolean;
    sessionId?: string;
}

interface ContextAnalysis {
    action: 'merge' | 'queue' | 'execute';
    isCorrection: boolean;
    confidence: number;
    reason: string;
}

export function useTaskQueue(sessionId: string | undefined) {
    const [tasks, setTasks] = useState<QueuedTask[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch queued tasks
    const fetchTasks = useCallback(async () => {
        if (!sessionId) return;

        try {
            const response = await fetch(`${API_URL}/queue/${sessionId}`, {
                credentials: 'include',
            });

            if (response.ok) {
                const data = await response.json();
                setTasks(data.tasks || []);
            }
        } catch (error) {
            console.error('Error fetching tasks:', error);
        }
    }, [sessionId]);

    // Analyze a new message
    const analyzeMessage = useCallback(async (message: string): Promise<ContextAnalysis | null> => {
        if (!sessionId) return null;

        try {
            const response = await fetch(`${API_URL}/queue/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ message, sessionId }),
            });

            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error('Error analyzing message:', error);
        }

        return null;
    }, [sessionId]);

    // Add task to queue
    const addTask = useCallback(async (
        message: string,
        priority: 'high' | 'normal' = 'normal',
        relatedToCurrentTask = false
    ): Promise<QueuedTask | null> => {
        if (!sessionId) return null;

        try {
            const response = await fetch(`${API_URL}/queue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ message, sessionId, priority, relatedToCurrentTask }),
            });

            if (response.ok) {
                const data = await response.json();
                await fetchTasks(); // Refresh the list
                return data.task;
            }
        } catch (error) {
            console.error('Error adding task:', error);
        }

        return null;
    }, [sessionId, fetchTasks]);

    // Remove task from queue
    const removeTask = useCallback(async (taskId: string): Promise<boolean> => {
        if (!sessionId) return false;

        try {
            const response = await fetch(`${API_URL}/queue/${sessionId}/${taskId}`, {
                method: 'DELETE',
                credentials: 'include',
            });

            if (response.ok) {
                await fetchTasks(); // Refresh the list
                return true;
            }
        } catch (error) {
            console.error('Error removing task:', error);
        }

        return false;
    }, [sessionId, fetchTasks]);

    // Start a queued task
    const startTask = useCallback(async (taskId: string): Promise<boolean> => {
        if (!sessionId) return false;

        try {
            const response = await fetch(`${API_URL}/queue/${sessionId}/start/${taskId}`, {
                method: 'POST',
                credentials: 'include',
            });

            if (response.ok) {
                await fetchTasks(); // Refresh the list
                return true;
            }
        } catch (error) {
            console.error('Error starting task:', error);
        }

        return false;
    }, [sessionId, fetchTasks]);

    // Set current task description
    const setCurrentTask = useCallback(async (description: string): Promise<boolean> => {
        if (!sessionId) return false;

        try {
            const response = await fetch(`${API_URL}/queue/${sessionId}/current`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ description }),
            });

            return response.ok;
        } catch (error) {
            console.error('Error setting current task:', error);
            return false;
        }
    }, [sessionId]);

    // Clear current task
    const clearCurrentTask = useCallback(async (): Promise<boolean> => {
        if (!sessionId) return false;

        try {
            const response = await fetch(`${API_URL}/queue/${sessionId}/current`, {
                method: 'DELETE',
                credentials: 'include',
            });

            return response.ok;
        } catch (error) {
            console.error('Error clearing current task:', error);
            return false;
        }
    }, [sessionId]);

    // Auto-fetch tasks on mount and when sessionId changes
    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    return {
        tasks,
        isLoading,
        fetchTasks,
        analyzeMessage,
        addTask,
        removeTask,
        startTask,
        setCurrentTask,
        clearCurrentTask,
    };
}
