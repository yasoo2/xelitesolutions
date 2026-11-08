/**
 * Joe's experience book, the owner's own (api/routes/experience.ts,
 * core/engine/experience.ts).
 *
 * The owner, 2026-11-08: «Joe learns by himself from his work: asked what he
 * did before, he does it at once». What Joe learned shows here: each way that
 * worked, whether Joe does it again with no AI or only gives it to the AI as an
 * example, how often it was done again, what it saved; and what did not work.
 * He can make Joe forget any of it.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Smartphone, Monitor, Trash2, Zap, BookOpen } from 'lucide-react';
import { API_URL } from '../config';

interface RecipeRow {
    id: string; request: string; target: 'phone' | 'computer'; replayable: boolean; whyNot?: string;
    replays: number; replayWins: number; failsInARow: number; shown: number; savedUsd: number;
    createdAt: number; lastAt: number; summary: string; steps: number;
}
interface LessonRow { id: string; request: string; target: 'phone' | 'computer'; reason: string; at: number }
interface Book {
    learning: boolean; replaying: boolean; recipes: RecipeRow[]; lessons: LessonRow[];
    totals: { recipes: number; replayable: number; replays: number; replayWins: number; savedUsd: number; lessons: number };
}

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}`, 'Content-Type': 'application/json' });

const ExperiencePanel: React.FC<{ t: (k: string, f: string) => string; lang: string }> = ({ t, lang }) => {
    const [book, setBook] = useState<Book | null>(null);
    const [busy, setBusy] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/experience`, { headers: auth() });
            const d = await res.json();
            if (d?.ok) setBook(d as Book);
        } catch { /* the book stays as it was */ }
    }, []);

    useEffect(() => {
        void load();
        const every = window.setInterval(load, 15000);
        return () => window.clearInterval(every);
    }, [load]);

    const forget = async (id: string) => {
        setBusy(id);
        try {
            await fetch(`${API_URL}/experience/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth() });
            await load();
        } finally { setBusy(''); }
    };

    const when = (at: number) => {
        try { return new Date(at).toLocaleDateString(lang || undefined, { day: 'numeric', month: 'short' }); } catch { return ''; }
    };
    const money = (usd: number) => `$${(usd || 0).toFixed(usd >= 1 ? 2 : 3)}`;
    const deviceIcon = (target: string) => (target === 'computer' ? <Monitor size={18} /> : <Smartphone size={18} />);

    if (!book) return <div className="dev-panel"><div className="dev-empty">…</div></div>;

    return (
        <div className="dev-panel exp-panel">
            <div className="dev-hint">{t('exp_how', 'Every task Joe finishes and proves with his checks is kept here as a way that works.')}</div>
            {!book.learning && <div className="dev-warn">{t('exp_off', 'Learning is turned off on this Joe.')}</div>}

            <div className="exp-totals" role="group" aria-label={t('exp_title', 'Joe\'s experience')}>
                <div className="exp-total"><b>{book.totals.recipes}</b><span>{t('exp_learned', 'ways learned')}</span></div>
                <div className="exp-total"><b>{book.totals.replayWins}</b><span>{t('exp_doneAgain', 'done again without the AI')}</span></div>
                <div className="exp-total"><b dir="ltr">{money(book.totals.savedUsd)}</b><span>{t('exp_saved', 'saved')}</span></div>
            </div>

            {book.recipes.length === 0 && <div className="dev-empty">{t('exp_none', 'Nothing learned yet.')}</div>}
            {book.recipes.map(r => (
                <div className="dev-card" key={r.id}>
                    <div className="dev-row">
                        {deviceIcon(r.target)}
                        <div className="dev-text">
                            <span className="dev-name" dir="auto">«{r.request}»</span>
                            <span className="dev-sub">
                                <span className={`exp-tag ${r.replayable ? 'on' : ''}`}>
                                    {r.replayable ? <Zap size={12} /> : <BookOpen size={12} />}
                                    {r.replayable ? t('exp_replayable', 'Done again without the AI') : t('exp_exampleOnly', 'An example for the AI')}
                                </span>
                                {' · '}{r.target === 'computer' ? t('exp_computer', 'computer') : t('exp_phone', 'phone')}
                                {' · '}{r.steps} {t('exp_steps', 'steps')}
                                {r.replays > 0 ? <> · {r.replays} {t('exp_times', 'times')}, {r.replayWins} {t('exp_worked', 'worked')}</> : null}
                                {r.savedUsd > 0 ? <> · {t('exp_saved', 'saved')} <span dir="ltr">{money(r.savedUsd)}</span></> : null}
                                {' · '}{when(r.lastAt)}
                            </span>
                        </div>
                        <button className="dev-btn ghost" disabled={busy === r.id} onClick={() => forget(r.id)} title={t('exp_delete', 'Forget')}>
                            <Trash2 size={15} /><span>{t('exp_delete', 'Forget')}</span>
                        </button>
                    </div>
                </div>
            ))}

            {book.lessons.length > 0 && (
                <>
                    <div className="dev-section-title">{t('exp_lessons', 'What did not work (Joe avoids repeating it)')}</div>
                    {book.lessons.slice(0, 12).map(l => (
                        <div className="dev-card exp-lesson" key={l.id}>
                            <div className="dev-row">
                                {deviceIcon(l.target)}
                                <div className="dev-text">
                                    <span className="dev-name" dir="auto">«{l.request}»</span>
                                    <span className="dev-sub">{when(l.at)}</span>
                                </div>
                                <button className="dev-btn ghost" disabled={busy === l.id} onClick={() => forget(l.id)} title={t('exp_delete', 'Forget')}>
                                    <Trash2 size={15} /><span>{t('exp_delete', 'Forget')}</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
};

export default ExperiencePanel;
