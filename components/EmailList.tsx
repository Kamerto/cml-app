import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { JobEmail } from '../types';
import { Mail, Loader2, ExternalLink } from 'lucide-react';

const EMAILS_COLLECTION = 'zakazka_emails';

interface EmailListProps {
    jobId: string;
}

const EmailList: React.FC<EmailListProps> = ({ jobId }) => {
    const [emails, setEmails] = useState<JobEmail[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jobId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const q = query(
            collection(db, EMAILS_COLLECTION),
            where('zakazka_id', '==', jobId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loaded: JobEmail[] = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as JobEmail));
            // Sort by created_at descending (newest first)
            loaded.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
            setEmails(loaded);
            setLoading(false);
        }, (error) => {
            console.error('Chyba při načítání e-mailů:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [jobId]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Načítám e-maily...</span>
            </div>
        );
    }

    if (emails.length === 0) {
        return (
            <div className="p-6 bg-slate-800/20 border-2 border-dashed border-slate-700/50 rounded-2xl text-center">
                <Mail className="w-8 h-8 text-slate-700 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-bold text-slate-500">Žádné propojené e-maily</p>
                <p className="text-[11px] text-slate-600 mt-1">
                    Pošlete e-mail z Outlooku s ID zakázky <span className="font-mono text-slate-500">{jobId}</span> pro automatické propojení.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
                <Mail className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                    E-maily ({emails.length})
                </span>
            </div>
            {emails.map(email => {
                const outlookHref = `outlook:${email.entry_id}${email.store_id ? `?storeid=${email.store_id}` : ''}`;
                return (
                    <div
                        key={email.id}
                        className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 hover:bg-slate-800/70 transition-all group"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <Mail className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                    <h4 className="text-sm font-bold text-slate-200 truncate">{email.subject || '(bez předmětu)'}</h4>
                                </div>
                                {email.sender && (
                                    <p className="text-[11px] text-slate-400 font-medium mb-1">Od: {email.sender}</p>
                                )}
                                {email.preview && (
                                    <p className="text-xs text-slate-500 line-clamp-2 italic border-l-2 border-slate-700 pl-3">
                                        {email.preview}
                                    </p>
                                )}
                                {email.received_at && (
                                    <p className="text-[10px] text-slate-600 mt-1 font-mono">{email.received_at}</p>
                                )}
                            </div>
                            <a
                                href={outlookHref}
                                className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black transition-all shrink-0 shadow-lg shadow-blue-900/30 active:scale-95"
                                title={`Otevřít v Outlooku${email.store_id ? ` (Store: ${email.store_id.substring(0, 8)}...)` : ''}`}
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                                OUTLOOK
                            </a>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default EmailList;
