/**
 * «احفظ بيانات عملي» — the chat face of Joe's business memory.
 *
 * Save, show, clear. Parsing is deterministic (no model ever reads the
 * user's phone number), storage is on disk, and every builder consults the
 * profile from then on — real contact data in every site, never a
 * placeholder again.
 */
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { getProfile, setProfile, clearProfile, parseProfileText, formatProfile } from '../../../core/profile/business-profile';

export class BusinessProfileTool extends BaseTool {
    name = 'business_profile';
    description = 'Save, show or clear the user\'s real business details (brand, phone, email, socials) — injected into every future build.';
    version = '1.0.0';
    tags = ['profile', 'memory', 'business'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            request: { type: 'string', description: 'The user\'s message, e.g. «احفظ بيانات عملي: الجوال 05…»' },
        },
        required: ['request'],
    };
    permissions: ToolPermission[] = ['read', 'write'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 20;
    auditFields = [];   // the profile carries personal contact data — keep it out of audit logs

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const request = String(input?.request || '').trim();
        const sessionId = context?.sessionId;

        if (/(امسح|احذف|أزل|ازل|clear|delete)/i.test(request) && /(بيانات|ملف|profile)/i.test(request)) {
            clearProfile(sessionId);
            return { ok: true, output: { message: '🗑️ مُسحت بيانات عملك — الأبنية القادمة تعود للوضع العام بلا بيانات تواصل.' }, logs: [] } as any;
        }

        if (/(احفظ|خزن|خزّن|سجل|سجّل|save|remember)/i.test(request)) {
            const patch = parseProfileText(request);
            if (!Object.keys(patch).length) {
                return {
                    ok: true,
                    output: { message: '📇 لم أتعرف على أي حقل. الصيغة: «احفظ بيانات عملي: الاسم مطعم الريف، الجوال 0501234567، البريد hi@reef.sa، انستغرام reef_rest»' },
                    logs: [],
                } as any;
            }
            const saved = setProfile(sessionId, patch);
            return {
                ok: true,
                output: { message: `✅ حُفظت وستُحقن في كل بناء قادم تلقائياً.\n\n${formatProfile(saved)}`, profile: saved },
                logs: ['business profile saved — deterministic parse, no model'],
            } as any;
        }

        return { ok: true, output: { message: formatProfile(getProfile(sessionId)), profile: getProfile(sessionId) }, logs: [] } as any;
    }
}
