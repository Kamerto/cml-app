import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { JobEmail } from '../types';
import { Mail, Loader2, AlertTriangle, Copy, Check } from 'lucide-react';

const EMAILS_COLLECTION = 'zakazka_emails';

interface EmailListProps {
    jobId: string;
}

const CopyButton: React.FC<{ entryId: string; storeId?: string }> = ({ entryId, storeId }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(entryId);
            setCopied(true);

            // Show instructions after copying
            setTimeout(() => {
                alert(
                    '✅ Entry ID zkopírováno!\n\n' +
                    'JAK OTEVŘÍT EMAIL:\n' +
                    '1. V Outlooku stiskněte Alt+F8\n' +
                    '2. Vyberte "OtevritEmailZAplikace"\n' +
                    '3. Klikněte OK\n' +
                    '4. Vložte Entry ID (Ctrl+V)\n' +
                    (storeId ? '5. Vložte Store ID nebo nechte prázdné\n' : '5. Store ID nechte prázdné\n') +
                    '6. Email se otevře!'
                );
            }, 100);

            setTimeout(() => setCopied(false), 3000);
        } catch {
            // fallback
            const el = document.createElement('textarea');
            el.value = entryId;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
        }
    };

    return (
        <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-3 py-2.5 rounded-xl text-[10px] font-black transition-all shrink-0 bg-purple-600 hover:bg-purple-500 text-white active:scale-95 shadow-lg"
            title="Zkopírovat Entry ID pro otevření makrem v Outlooku"
        >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'ZKOPÍROVÁNO' : 'KOPÍROVAT ID'}
        </button>
    );
};

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
            {emails.map(email => (
                <div
                    key={email.id}
                    className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 hover:bg-slate-800/70 transition-all"
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
                            {!email.entry_id && (
                                <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-500">
                                    <AlertTriangle className="w-3 h-3" />
                                    <span>Chybí Entry ID – nelze otevřít v Outlooku</span>
                                </div>
                            )}
                        </div>
                        {email.entry_id ? (
                            <div className="flex flex-col gap-1.5 shrink-0">
                                <CopyButton entryId={email.entry_id} storeId={email.store_id} />
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black bg-slate-700 text-slate-500 cursor-not-allowed shrink-0">
                                <Copy className="w-3.5 h-3.5" />
                                CHYBÍ ID
                            </div>
                        )}
                    </div>
                </div>
            ))}
            <div className="p-4 bg-purple-900/10 border border-purple-500/20 rounded-xl">
                <p className="text-[11px] text-purple-300 leading-relaxed">
                    <strong className="text-purple-400">💡 Jak otevřít email:</strong><br />
                    Klikněte na <strong>KOPÍROVAT ID</strong> → V Outlooku <strong>Alt+F8</strong> → Spusťte makro <strong>OtevritEmailZAplikace</strong>
                </p>
            </div>
        </div>
    );
};

export default EmailList;
