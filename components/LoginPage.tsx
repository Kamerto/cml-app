
import React, { useState } from 'react';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from 'firebase/auth';
import {
    doc,
    getDoc,
    deleteDoc
} from 'firebase/firestore';
import { auth, db, INVITES_COLLECTION } from '../firebase';
import { Printer, AlertTriangle, Loader2 } from 'lucide-react';

const LoginPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleAuthAction = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        if (!auth || !db) {
            setError("Firebase není správně nakonfigurován.");
            setIsLoading(false);
            return;
        }

        try {
            if (isRegistering) {
                if (!inviteCode.trim()) {
                    setError('Kód pozvánky je povinný.');
                    setIsLoading(false);
                    return;
                }
                // Use the invite code as the document ID directly, as per "Zakazka na ceste" logic
                const inviteRef = doc(db, INVITES_COLLECTION, inviteCode.trim());
                const inviteDoc = await getDoc(inviteRef);

                if (!inviteDoc.exists()) {
                    setError('Tento kód pozvánky neexistuje nebo již byl použit.');
                    setIsLoading(false);
                    return;
                }

                await createUserWithEmailAndPassword(auth, email, password);
                await deleteDoc(inviteRef);
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
        } catch (err: any) {
            console.error(err);
            switch (err.code) {
                case 'auth/invalid-email': setError('Neplatný formát e-mailu.'); break;
                case 'auth/user-not-found': setError('Uživatel s tímto e-mailem neexistuje.'); break;
                case 'auth/wrong-password': setError('Nesprávné heslo.'); break;
                case 'auth/invalid-credential': setError('Nesprávný e-mail nebo heslo.'); break;
                case 'auth/email-already-in-use': setError('Tento e-mail je již registrován.'); break;
                case 'auth/weak-password': setError('Heslo musí mít alespoň 6 znaků.'); break;
                default: setError('Nastala chyba. Zkuste to prosím znovu.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 font-sans selection:bg-purple-500/30">
            <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-500">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-8 md:p-10 relative overflow-hidden">
                    {/* Background Glow */}
                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-600/10 blur-[80px] rounded-full"></div>
                    <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-sky-600/10 blur-[80px] rounded-full"></div>

                    <div className="relative z-10">
                        <div className="flex flex-col items-center mb-10">
                            <div className="bg-purple-600 p-4 rounded-2xl shadow-xl shadow-purple-900/40 mb-5 group">
                                <Printer className="w-8 h-8 text-white transition-transform duration-500 group-hover:rotate-12" />
                            </div>
                            <h1 className="text-3xl font-black text-white tracking-tighter uppercase mb-2">CML BOARD</h1>
                            <p className="text-slate-500 text-sm font-medium">
                                {isRegistering ? 'Vytvořte si nový účet' : 'Přihlaste se ke svému účtu'}
                            </p>
                        </div>

                        <form onSubmit={handleAuthAction} className="space-y-5">
                            {isRegistering && (
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 px-1 tracking-widest">Kód pozvánky</label>
                                    <input
                                        type="text"
                                        value={inviteCode}
                                        onChange={(e) => setInviteCode(e.target.value)}
                                        required
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all placeholder:text-slate-600"
                                        placeholder="Např. ABCD-1234"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 px-1 tracking-widest">E-mail</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all placeholder:text-slate-600"
                                    placeholder="vas@email.cz"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 px-1 tracking-widest">Heslo</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all placeholder:text-slate-600"
                                    placeholder="••••••••"
                                />
                            </div>

                            {error && (
                                <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 animate-in slide-in-from-top-2">
                                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                    <p className="text-red-400 text-xs font-semibold leading-relaxed">{error}</p>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3.5 font-black text-sm shadow-xl shadow-purple-900/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    isRegistering ? 'ZAREGISTROVAT SE' : 'PŘIHLÁSIT SE'
                                )}
                            </button>
                        </form>

                        <div className="mt-8 text-center">
                            <p className="text-slate-500 text-xs font-bold">
                                {isRegistering ? 'Už máte účet?' : 'Potřebujete účet?'}
                                <button
                                    onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
                                    className="ml-2 text-purple-400 hover:text-purple-300 transition-colors uppercase tracking-widest text-[10px] font-black"
                                >
                                    {isRegistering ? 'Přihlaste se' : 'Zaregistrujte se'}
                                </button>
                            </p>
                        </div>
                    </div>
                </div>

                <p className="mt-8 text-center text-slate-600 text-[10px] font-black tracking-widest uppercase">
                    © 2026 CALAMARUS DTP & AI STUDIO
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
