/**
 * AutoOpenManager - Smart auto-open system for IDE panels
 * Listens to AI tool usage events and auto-opens relevant panels
 */

type PanelType = 'terminal' | 'browser' | 'preview' | 'problems' | 'output';

interface AutoOpenConfig {
    enabled: boolean;
    panels: {
        [K in PanelType]: boolean;
    };
}

type EventCallback = (panel: PanelType, data?: any) => void;

class AutoOpenManagerClass {
    private listeners: Set<EventCallback> = new Set();
    private config: AutoOpenConfig = {
        enabled: true,
        panels: {
            terminal: true,
            browser: true,
            preview: true,
            problems: true,
            output: true,
        },
    };

    /**
     * Subscribe to auto-open events
     */
    subscribe(callback: EventCallback): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Trigger panel open
     */
    private triggerOpen(panel: PanelType, data?: any) {
        console.log(`[AutoOpenManager] triggerOpen called for panel: ${panel}`, { enabled: this.config.enabled, panelEnabled: this.config.panels[panel] });
        if (!this.config.enabled || !this.config.panels[panel]) return;
        this.listeners.forEach(cb => cb(panel, data));
    }

    /**
     * Process AI tool usage - call this when AI uses a tool
     */
    processToolUsage(toolName: string, toolData?: any) {
        // Terminal tools
        if (
            toolName === 'terminal_manager' ||
            toolName === 'run_command' ||
            toolName === 'execute_command' ||
            toolName === 'shell' ||
            toolName.includes('terminal')
        ) {
            this.triggerOpen('terminal', toolData);
        }

        // Browser tools
        if (
            toolName === 'browser_navigate' ||
            toolName === 'browser_click' ||
            toolName === 'browser_type' ||
            toolName === 'browser_screenshot' ||
            toolName === 'web_browse' ||
            toolName.includes('browser')
        ) {
            this.triggerOpen('browser', toolData);
        }

        // Preview triggers (after creating/modifying HTML/React files)
        if (
            toolName === 'write_file' ||
            toolName === 'create_file'
        ) {
            const path = toolData?.path || toolData?.filePath || '';
            if (
                path.endsWith('.html') ||
                path.endsWith('.tsx') ||
                path.endsWith('.jsx') ||
                path.includes('index.')
            ) {
                // Delay preview to allow file to be written
                setTimeout(() => this.triggerOpen('preview', toolData), 1000);
            }
        }
    }

    /**
     * Process AI step events - for streaming responses
     */
    processStepEvent(event: { type: string; data?: any }) {
        // When step involves tool call, process it
        if (event.type === 'step_started' && event.data?.tool) {
            this.processToolUsage(event.data.tool.name, event.data.tool.input);
        }

        // When preview is ready
        if (event.type === 'preview_ready') {
            console.log('[AutoOpenManager] Received preview_ready event', event.data);
            this.triggerOpen('preview', event.data);
        }

        // When there are problems/errors
        if (event.type === 'step_failed' || event.type === 'error') {
            this.triggerOpen('problems', event.data);
        }
    }

    /**
     * Process output logs
     */
    processOutput(type: 'log' | 'error' | 'warning', message: string) {
        if (type === 'error' || type === 'warning') {
            this.triggerOpen('problems', { type, message });
        }
        this.triggerOpen('output', { type, message });
    }

    /**
     * Manually open a panel (for user actions)
     */
    openPanel(panel: PanelType, data?: any) {
        this.listeners.forEach(cb => cb(panel, data));
    }

    /**
     * Update configuration
     */
    setConfig(config: Partial<AutoOpenConfig>) {
        this.config = { ...this.config, ...config };
    }

    /**
     * Get current configuration
     */
    getConfig(): AutoOpenConfig {
        return { ...this.config };
    }

    /**
     * Enable/disable auto-open
     */
    setEnabled(enabled: boolean) {
        this.config.enabled = enabled;
    }

    /**
     * Enable/disable specific panel auto-open
     */
    setPanelEnabled(panel: PanelType, enabled: boolean) {
        this.config.panels[panel] = enabled;
    }
}

// Singleton instance
export const AutoOpenManager = new AutoOpenManagerClass();

// React hook for using AutoOpenManager
import { useEffect, useCallback, useState } from 'react';

export function useAutoOpen(onOpen: (panel: PanelType, data?: any) => void) {
    useEffect(() => {
        return AutoOpenManager.subscribe(onOpen);
    }, [onOpen]);
}

// Hook to track which panels should be open
export function useAutoPanels() {
    const [activePanels, setActivePanels] = useState<Set<PanelType>>(new Set());

    const handleOpen = useCallback((panel: PanelType) => {
        setActivePanels(prev => new Set([...prev, panel]));
    }, []);

    const closePanel = useCallback((panel: PanelType) => {
        setActivePanels(prev => {
            const next = new Set(prev);
            next.delete(panel);
            return next;
        });
    }, []);

    useEffect(() => {
        return AutoOpenManager.subscribe(handleOpen);
    }, [handleOpen]);

    return {
        activePanels,
        closePanel,
        isOpen: (panel: PanelType) => activePanels.has(panel),
    };
}

export type { PanelType, AutoOpenConfig };
