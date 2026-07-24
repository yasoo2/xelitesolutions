import React from 'react';

/**
 * DepartmentStatusCard — the live "engineering company" pipeline strip.
 *
 * Renders the department stages sent by the backend `department_status` WS event
 * (Analyst -> Architect -> Developer -> Reviewer -> Delivered) and highlights
 * which one is working now, with earlier stages marked done. Purely presentational.
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
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
                padding: '8px 12px',
                margin: '0 0 8px',
                borderRadius: 12,
                background: 'rgba(139, 92, 246, 0.06)',
                border: '1px solid rgba(139, 92, 246, 0.18)',
                fontSize: 12,
            }}
            aria-label="engineering-departments"
        >
            <span style={{ opacity: 0.7, fontWeight: 600 }}>
                {isArabic ? 'الأقسام:' : 'Team:'}
            </span>
            {status.stages.map((stage, i) => {
                const isActive = stage.key === status.active;
                const isDone = doneSet.has(stage.key);
                const label = isArabic ? stage.labelAr : stage.label;
                const color = isActive ? '#8b5cf6' : isDone ? '#10b981' : 'rgba(148,163,184,0.7)';
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
                                background: isActive ? 'rgba(139,92,246,0.14)' : 'transparent',
                                border: `1px solid ${isActive ? 'rgba(139,92,246,0.4)' : 'transparent'}`,
                                transition: 'all 0.25s ease',
                            }}
                        >
                            <span>{isDone ? '✓' : stage.icon}</span>
                            <span>{label}</span>
                            {isActive && (
                                <span
                                    style={{
                                        width: 6, height: 6, borderRadius: '50%',
                                        background: '#8b5cf6', animation: 'joePulse 1s ease-in-out infinite',
                                    }}
                                />
                            )}
                        </span>
                        {i < status.stages.length - 1 && (
                            <span style={{ opacity: 0.35 }}>{isArabic ? '←' : '→'}</span>
                        )}
                    </React.Fragment>
                );
            })}
            <style>{`@keyframes joePulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.3; transform: scale(0.7); } }`}</style>
        </div>
    );
};

export default DepartmentStatusCard;
