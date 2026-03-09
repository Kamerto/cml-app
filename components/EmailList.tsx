import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { JobEmail } from '../types';
import { Mail, Loader2, AlertTriangle, Copy, Check, Link, X, ChevronDown, Trash2 } from 'lucide-react';

const EMAILS_COLLECTION = import.meta.env.VITE_MOCK_MODE === 'true'
    ? 'zakazka_emails_sandbox'
    : 'zakazka_emails';

interface EmailListProps {
    jobId: string;
    outlookId?: string;
}

// Modální okno s celým textem mailu
const formatEmailPreview = (text: string) => {
    // Rozdělí řetězec na jednotlivé zprávy podle "From:"
    const parts = text.split(/(?=From:\s)/);
    return parts.map((part, i) => {
        // Odděl hlavičku od těla
        const lines = part.split(/\s{2,}|\n/).filter(l => l.trim());
        const headerLines: string[] = [];
        const bodyLines: string[] = [];
        let inBody = false;

        lines.forEach(line => {
            if (/^(From|Sent|To|Cc|Subject):/.test(line.trim())) {
                headerLines.push(line.trim());
            } else {
                inBody = true;
                if (inBody) bodyLines.push(line.trim());
            }
        });

        return (
            <div key={i} className={`${i > 0 ? 'mt-4 pt-4 border-t border-slate-700/50' : ''}`}>
                {headerLines.length > 0 && (
                    <div className="mb-2 space-y-0.5">
                        {headerLines.map((h, j) => (
                            <p key={j} className="text-[10px] font-mono text-slate-500">{h}</p>
                        ))}
                    </div>
                )}
                <div className="space-y-1">
                    {bodyLines.map((line, j) => (
                        <p key={j} className="text-xs text-slate-300 leading-relaxed">{line}</p>
                    ))}
                </div>
            </div>
        );
    });
};

const EmailModal: React.FC<{ email: JobEmail; onClose: () => void }> = ({ email, onClose }) => {
    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div
                className="relative z-10 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-700/50">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <Mail className="w-4 h-4 text-purple-400 shrink-0" />
                            <h3 className="text-sm font-black text-slate-200 truncate">
                                {email.subject || '(bez předmětu)'}
                            </h3>
                        </div>
                        {email.sender && (
                            <p className="text-[11px] text-slate-400 font-medium">Od: {email.sender}</p>
                        )}
                        {email.received_at && (
                            <p className="text-[10px] text-slate-600 font-mono mt-0.5">{email.received_at}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Tělo mailu */}
                <div className="flex-1 overflow-y-auto p-5">
                    {email.preview
                        ? formatEmailPreview(email.preview)
                        : <p className="text-sm text-slate-500 italic">Žádný obsah k zobrazení.</p>
                    }
                </div>
            </div>
        </div>
    );
};

const CopyButton: React.FC<{ entryId: string; storeId?: string }> = ({ entryId, storeId }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(entryId);
            setCopied(true);
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

const EmailList: React.FC<EmailListProps> = ({ jobId, outlookId }) => {
    const [emails, setEmails] = useState<JobEmail[]>([]);
    const [loading, setLoading] = useState(true);
    const [openEmail, setOpenEmail] = useState<JobEmail | null>(null);

    const handleDeleteEmail = async (emailId: string) => {
        if (!confirm('Opravdu chcete tento e-mail smazat z této zakázky?')) return;
        try {
            await deleteDoc(doc(db, EMAILS_COLLECTION, emailId));
        } catch (e: any) {
            alert('Chyba při mazání e-mailu: ' + (e?.message || String(e)));
        }
    };

    const linkId = outlookId || jobId;

    useEffect(() => {
        if (!linkId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const q = query(
            collection(db, EMAILS_COLLECTION),
            where('zakazka_id', 'in', [jobId, outlookId].filter(Boolean))
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
    }, [jobId, outlookId]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Načítám e-maily...</span>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Modální okno */}
            {openEmail && (
                <EmailModal email={openEmail} onClose={() => setOpenEmail(null)} />
            )}

            {/* Outlook Pairing ID Section */}
            <div className="p-4 bg-sky-900/10 border border-sky-500/20 rounded-2xl">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <Link className="w-3.5 h-3.5 text-sky-400" />
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Propojení zakázky s Outlookem</span>
                        </div>
                        <div className="font-mono text-sm font-bold text-sky-400 truncate">
                            {outlookId ? outlookId : (jobId ? `${jobId} (PŘES ČÍSLO)` : 'ZATÍM NEPROPOJENO')}
                        </div>
                        <p className="text-[10px] text-slate-600 mt-1">
                            💡 Toto ID použijte v makru při <strong className="text-slate-500">posílání</strong> e-mailu (ne pro otevření).
                        </p>
                    </div>

                    {linkId && (
                        <button
                            type="button"
                            title="Použijte při odesílání mailu z Outlooku – pro přiřazení k zakázce"
                            onClick={() => {
                                navigator.clipboard.writeText(linkId);
                                alert(
                                    'Zkopírováno ID propojení: ' + linkId + '\n\n' +
                                    'Použijte toto ID při POSÍLÁNÍ e-mailu z Outlooku makrem – aby se mail přiřadil k zakázce.\n\n' +
                                    '⚠️ POZOR: Pro OTEVŘÍT existujícího e-mailu použijte tlačítko "KOPÍROVAT ID" u konkrétního e-mailu níže.'
                                );
                            }}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black bg-sky-600 hover:bg-sky-500 text-white active:scale-95 shadow-lg shadow-sky-900/20 transition-all uppercase shrink-0"
                        >
                            <Copy className="w-3.5 h-3.5" />
                            Kopírovat link
                        </button>
                    )}
                </div>
            </div>

            {emails.length === 0 && (
                <div className="p-6 bg-slate-800/20 border-2 border-dashed border-slate-700/50 rounded-2xl text-center">
                    <Mail className="w-8 h-8 text-slate-700 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-bold text-slate-500">Žádné propojené e-maily</p>
                    <p className="text-[11px] text-slate-600 mt-1">
                        Pošlete e-mail z Outlooku s ID zakázky <span className="font-mono text-slate-500">{jobId}</span> pro automatické propojení.
                    </p>
                </div>
            )}

            <div className="flex items-center gap-2 mb-1 pt-2">
                <Mail className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                    Párované e-maily ({emails.length})
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
                        <div className="flex flex-col gap-1.5 shrink-0">
                            {/* Tlačítko zobrazit mail */}
                            <button
                                type="button"
                                onClick={() => setOpenEmail(email)}
                                className="flex items-center gap-1 px-3 py-2.5 rounded-xl text-[10px] font-black transition-all bg-slate-700 hover:bg-slate-600 text-slate-200 active:scale-95"
                                title="Zobrazit celý text mailu"
                            >
                                <ChevronDown className="w-3.5 h-3.5" />
                                ZOBRAZIT
                            </button>
                            {email.entry_id ? (
                                <CopyButton entryId={email.entry_id} storeId={email.store_id} />
                            ) : (
                                <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black bg-slate-700 text-slate-500 cursor-not-allowed shrink-0">
                                    <Copy className="w-3.5 h-3.5" />
                                    CHYBÍ ID
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleDeleteEmail(email.id); }}
                                className="flex items-center gap-1 px-3 py-2 text-[10px] font-black transition-all text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-xl"
                                title="Smazat email"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                SMAZAT
                            </button>
                        </div>
                    </div>
                </div>
            ))}

            <div className="p-4 bg-purple-900/10 border border-purple-500/20 rounded-xl">
                <p className="text-[11px] text-purple-300 leading-relaxed">
                    <strong className="text-purple-400">💡 Jak otevřít konkrétní email v Outlooku:</strong><br />
                    U každého e-mailu níže klikněte na <strong>KOPÍROVAT ID</strong> → V Outlooku <strong>Alt+F8</strong> → Spusťte makro <strong>OtevritEmailZAplikace</strong>
                </p>
            </div>
        </div>
    );
};

export default EmailList;
