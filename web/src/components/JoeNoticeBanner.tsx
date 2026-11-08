/**
 * JOE TELLS THE OWNER, WHEREVER HE IS IN JOE: «A REPLY ARRIVED FROM …».
 *
 * The owner, 2026-11-08: «I want Joe to follow, in the background, whether a
 * reply arrives from the people he emailed, and tell me». Joe writes the
 * reply into the chat the email came from (MailWatchService); this notice is
 * for when the owner is in another chat, or the page was in the background.
 * It sits in the header's free middle, beside the update notice, in the
 * page's own flow (never over the controls), and opens that chat in one press.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Smartphone, X } from 'lucide-react';
import { SocketService, type JoeNotice } from '../services/socket';

export default function JoeNoticeBanner() {
    const { t } = useTranslation();
    const [notices, setNotices] = useState<JoeNotice[]>([]);

    useEffect(() => SocketService.subscribeNotices(n => {
        if (!n || !['mail_reply', 'phone_lost', 'phone_back'].includes(String(n.kind))) return;
        //  The phone came back: the «phone lost» notice goes, and the news that it is back shows.
        setNotices(list => [...list.filter(x => !(x.kind !== 'mail_reply' && n.kind !== 'mail_reply')
            && !(x.chatId === n.chatId && x.who === n.who && x.subject === n.subject && x.kind === n.kind)), n].slice(-3));
    }), []);

    const n = notices[notices.length - 1];
    if (!n) return null;
    const dismiss = () => setNotices(list => list.slice(0, -1));
    const open = () => {
        if (n.chatId) window.dispatchEvent(new CustomEvent('joe:open-session', { detail: { id: n.chatId } }));
        dismiss();
    };
    const who = n.who || n.address || '';
    //  The phone the watch reads from was lost, or came back (MailWatchService, 2026-11-08).
    const phone = n.kind === 'phone_lost' ? t('notice_phoneLost') : n.kind === 'phone_back' ? t('notice_phoneBack') : '';
    return (
        <div className={`joe-notice-banner${n.kind === 'phone_lost' ? ' is-warning' : ''}`} role="status" aria-live="polite">
            {phone ? <Smartphone size={15} aria-hidden="true" className="joe-notice-icon" /> : <Mail size={15} aria-hidden="true" className="joe-notice-icon" />}
            <span className="joe-notice-text" title={phone || (n.subject ? `${who} — ${n.subject}` : who)}>
                {phone || t('notice_mailReplyFrom', { who })}
                {!phone && n.subject ? <span className="joe-notice-subject"> — {n.subject}</span> : null}
            </span>
            {n.chatId ? (
                <button type="button" className="joe-notice-open" onClick={open}>{t('notice_openChat')}</button>
            ) : null}
            <button type="button" className="joe-notice-close" aria-label={t('notice_dismiss')} title={t('notice_dismiss')} onClick={dismiss}>
                <X size={14} aria-hidden="true" />
            </button>
        </div>
    );
}
