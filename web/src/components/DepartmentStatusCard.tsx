import React from 'react';

/**
 * DepartmentStatusCard — the live "engineering company" pipeline strip.
 *
 * Renders the department stages sent by the backend `department_status` WS event
 * (Analyst -> Architect -> Developer -> Reviewer -> Delivered) and highlights
 * which one is working now, with earlier stages marked done.
 *
 * DESIGN: uses the app's own design tokens from joe-premium.css (gold accent,
 * card background, borders, radius, shadows) via CSS variables, so it matches the
 * system's look and automatically adapts to the light/dark theme toggle. No
 * hard-coded colours.
 */

export interface DepartmentStage {
    key: string;
    label: string;
    labelAr: string;
    icon: string;
}

export interface DepartmentStatusData {
    stages: DepartmentStage[];
    active: string;
    done: string[];
    note?: string;
}

interface Props {
    status: DepartmentStatusData | null;
    isArabic?: boolean;
}

export const DepartmentStatusCard: React.FC<Props> = ({ status, isArabic }) => {
    if (!status || !Array.isArray(status.stages) || status.stages.length === 0) return null;

    const doneSet = new Set(status.done || []);

    return (
        <div
            dir={isArabic ? 'rtl' : 'ltr'}
            className="joe-department-card"
            aria-label="engineering-departments"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
                padding: '8px 12px',
                margin: '0 0 8px',
                borderRadius: 'var(--joe-border-radius-sm, 12px)',
                background: 'var(--joe-bg-card, rgba(20,25,32,0.9))',
                border: '1px solid var(--joe-border, rgba(240,193,75,0.25))',
                boxShadow: 'var(--joe-shadow-sm, 0 2px 8px rgba(0,0,0,0.4))',
                fontSize: 12,
                color: 'var(--joe-text-secondary, #b0bac5)',
            }}
        >
            <span style={{ opacity: 0.75, fontWeight: 600, color: 'var(--joe-text-muted, #6b7280)' }}>
                {isArabic ? 'الأقسام:' : 'Team:'}
            </span>
            {status.stages.map((stage, i) => {
                const isActive = stage.key === status.active;
                const isDone = doneSet.has(stage.key);
                const label = isArabic ? stage.labelAr : stage.label;
                const color = isActive
                    ? 'var(--joe-gold-primary, #f0c14b)'
                    : isDone
                        ? 'var(--joe-gold-secondary, #d4af37)'
                        : 'var(--joe-text-muted, #6b7280)';
                return (
                    <React.Fragment key={stage.key}>
                        <span
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '3px 8px',
                                borderRadius: 999,
                                color,
                                fontWeight: isActive ? 700 : 500,
                                background: isActive ? 'var(--joe-gold-subtle, rgba(240,193,75,0.15))' : 'transparent',
                                border: `1px solid ${isActive ? 'var(--joe-gold-border, rgba(240,193,75,0.35))' : 'transparent'}`,
                                boxShadow: isActive ? 'var(--joe-shadow-gold, 0 0 25px rgba(240,193,75,0.25))' : 'none',
                                transition: 'all var(--joe-transition-speed, 0.35s) ease',
                            }}
                        >
                            <span>{isDone ? '✓' : stage.icon}</span>
                            <span>{label}</span>
                            {isActive && (
                                <span
                                    style={{
                                        width: 6, height: 6, borderRadius: '50%',
                                        background: 'var(--joe-gold-primary, #f0c14b)',
                                        animation: 'joeDeptPulse 1s ease-in-out infinite',
                                    }}
                                />
                            )}
                        </span>
                        {i < status.stages.length - 1 && (
                            <span style={{ opacity: 0.35, color: 'var(--joe-text-muted, #6b7280)' }}>
                                {isArabic ? '←' : '→'}
                            </span>
                        )}
                    </React.Fragment>
                );
            })}
            <style>{`@keyframes joeDeptPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.3; transform: scale(0.7); } }`}</style>
        </div>
    );
};

export default DepartmentStatusCard;
