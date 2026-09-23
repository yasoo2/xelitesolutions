import { expectsPersistentRecord, hasNewVisibleFormFeedback, isVisibleFormRefusal, judgeBehaviour } from '../core/quality/behaviour-audit';

const control = (over: any = {}) => ({ label: 'حفظ', kind: 'submit', worked: false, effect: '', ...over });

describe('form evidence is scoped before a submit is called dead', () => {
    it('recognizes a repeated submit after the same responsive form already responded', () => {
        const controls = [control({ bare: 'حفظ', context: 'جوّال:/' })];
        const { findings } = judgeBehaviour(controls as any, {}, [], [{
            label: 'حفظ', fields: 4, filled: 4, effect: 'submitted', scope: 'جوّال:/',
        }] as any);
        expect(findings.some(f => f.code === 'some_dead_controls' || f.code === 'dead_controls')).toBe(false);
    });

    it('does not let desktop form evidence hide a genuinely dead phone submit', () => {
        const controls = [control({ bare: 'حفظ', context: 'جوّال:/' })];
        const { findings } = judgeBehaviour(controls as any, {}, [], [{
            label: 'حفظ', fields: 4, filled: 4, effect: 'submitted', scope: 'desktop:/',
        }] as any);
        expect(findings.some(f => f.code === 'some_dead_controls')).toBe(true);
    });

    it('treats a new visible authentication refusal as a response, not a dead submit', () => {
        const controls = [control({ bare: 'أضف', context: 'desktop:/' })];
        const { findings } = judgeBehaviour(controls as any, {}, [], [{
            label: 'أضف', fields: 4, filled: 4, effect: 'refused', scope: 'desktop:/',
        }] as any);
        expect(findings.some(f => f.code === 'some_dead_controls' || f.code === 'dead_controls')).toBe(false);
        expect(isVisibleFormRefusal('لم يُحفظ التغيير — سجّل الدخول ثم حاول مجدداً.')).toBe(true);
        expect(isVisibleFormRefusal('تم حفظ السجل بنجاح.')).toBe(false);
        expect(hasNewVisibleFormFeedback('', 'هذه الشاشة للمالك وحده.')).toBe(true);
        expect(hasNewVisibleFormFeedback('هذه الشاشة للمالك وحده.', 'هذه الشاشة للمالك وحده.')).toBe(false);
    });

    it('does not demand record persistence from sign-in, but does from data creation', () => {
        expect(expectsPersistentRecord('تسجيل الدخول auth-card')).toBe(false);
        expect(expectsPersistentRecord('Add inventory record form')).toBe(true);
    });
});
