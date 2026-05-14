import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Search,
  Settings, X, Printer, Trash2,
  Loader2, MapPin, Zap, Navigation,
  Layers, Maximize, Minimize, LogOut, ClipboardList, ClipboardCheck, ClipboardPaste,
  StickyNote, Calendar
} from 'lucide-react';
import { JobData, JobStatus, PrintItem, BoardNoteData, BoardNoteItem } from './types';

import JobCard from './components/JobCard';
import JobFormModal from './components/JobFormModal';
import BoardNote from './components/BoardNote';
import { GoogleGenAI, Type } from '@google/genai';

// Centrální fallback funkce pro Gemini
const GEMINI_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

async function geminiWithFallback(apiKey: string, params: any): Promise<any> {
  let lastError: any;
  for (const model of GEMINI_MODELS) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({ model, ...params });
      return response;
    } catch (e: any) {
      const msg = (e?.message || String(e)).toLowerCase();
      const isRetryable = msg.includes('503') || msg.includes('unavailable') ||
        msg.includes('quota') || msg.includes('overloaded') ||
        msg.includes('high demand') || msg.includes('429') ||
        msg.includes('exhausted');
      console.warn(`Model ${model} selhal:`, msg);
      lastError = e;
      if (!isRetryable) throw e;
    }
  }
  throw lastError;
}
import { onSnapshot, collection, query, addDoc, deleteDoc, getDocs, where, serverTimestamp, updateDoc, doc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth, db, PUBLIC_ORDERS_COLLECTION, BOARD_CARDS_COLLECTION, BOARD_NOTES_COLLECTION } from './firebase';

const EMAILS_COLLECTION = import.meta.env.VITE_MOCK_MODE === 'true' ? 'zakazka_emails_sandbox' : 'zakazka_emails';
import LoginPage from './components/LoginPage';

const App: React.FC = () => {
  const VERSION = 'v3.1.1-LIVE';
  // Žádný localStorage — jediný zdroj pravdy je Firebase
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [notes, setNotes] = useState<BoardNoteData[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [minBoardHeight, setMinBoardHeight] = useState(2000);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activePage, setActivePage] = useState<1 | 2>(1);
  const [manualApiKey, setManualApiKey] = useState(() => localStorage.getItem('cml_gemini_key') || '');
  const [aiProvider, setAiProvider] = useState<'gemini' | 'ollama'>(() => (localStorage.getItem('cml_ai_provider') as 'gemini' | 'ollama') || 'gemini');
  const [ollamaModel, setOllamaModel] = useState(() => localStorage.getItem('cml_ollama_model') || 'llama3.1:latest');
  const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true';
  console.log("APP.TSX: MOCK_MODE =", MOCK_MODE);

  const [user, setUser] = useState<User | null>(MOCK_MODE ? { email: 'mock@cml.local' } as any : null);
  const [isAuthLoading, setIsAuthLoading] = useState(!MOCK_MODE);

  const workspaceRef = useRef<HTMLDivElement>(null);
  const selectedJobRef = useRef<JobData | null>(null);

  const openModal = (job: JobData) => {
    selectedJobRef.current = job;
    setSelectedJob(job);
    setIsModalOpen(true);
  };



  useEffect(() => {
    if (MOCK_MODE) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Chyba při odhlašování:', error);
    }
  };

  // --- FIREBASE HELPER FUNKCE --- 

  const saveToFirebase = async (job: JobData, skipPublicSync = false) => {
    if (!job.jobId) return;
    const trimmedId = job.jobId.trim();
    const safeIdCheck = trimmedId.replace(/\//g, '_');
    // Povolíme: platné číslo zakázky (NNNNN_RR), dočasné ID (TEMP-/OUT-/SBX-)
    // Blokujeme: neúplná čísla (jen číslice bez roku, nebo s prázdným rokem)
    const isValidJobNumber = /^\d+_\d{2,}$/.test(safeIdCheck) || /^\d+V\d+_\d{2,}$/i.test(safeIdCheck);
    const isTempId = /^(TEMP|OUT|SBX)-/i.test(trimmedId);
    if (!isValidJobNumber && !isTempId) {
      console.log('⚠️ Přeskočeno uložení — neplatný formát čísla zakázky:', job.jobId);
      return;
    }
    console.log('💾 saveToFirebase:', job.jobId, 'isTracked:', job.isTracked, 'skipPublicSync:', skipPublicSync);
    try {
      // Odstraníme undefined hodnoty které Firebase odmítá.
      // fromQueue: false nezapisujeme — merge: true by přepsal true zpět na false.
      const sanitize = (obj: any) => Object.fromEntries(
        Object.entries(obj).filter(([k, v]) => v !== undefined && !(k === 'fromQueue' && v === false))
      );
      const cleanJob = sanitize(job);

      // 1. AKTUALIZACE SOUKROMÉ TABULE (BOARD_CARDS_COLLECTION)
      // OPRAVA: Použijeme deterministické ID i pro tabuli, aby to sedělo s frontou
      const safeId = job.jobId.trim().replace(/\//g, '_');
      let currentFireId = safeId;
      
      await setDoc(doc(db, BOARD_CARDS_COLLECTION, safeId), { 
        ...cleanJob, 
        fireId: safeId, 
        lastUpdated: serverTimestamp() 
      }, { merge: true });
      
      console.log('Firebase BOARD SYNC (Deterministic ID):', job.jobId);

      // 2. AKTUALIZACE SPOLEČNÉ FRONTY (PUBLIC_ORDERS_COLLECTION / orders)
      // UNIFIED ID STRATEGY: Použijeme stejné ID dokumentu jako v Tabuli
      // Syncujeme pokud je zakázka sledována (isTracked) NEBO pochází z fronty (fromQueue)
      if ((job.isTracked || job.fromQueue) && currentFireId && !skipPublicSync) {
        // Použijeme jobId jako ID dokumentu, aby to sedělo s Frontou (a nedocházelo k duplicitám)
        // OPRAVA: Lomítka v jobId by vytvořila podkolekce, nahradíme je podtržítkem
        const safeDocId = job.jobId.trim().replace(/\//g, '_');
        const publicDocRef = doc(db, PUBLIC_ORDERS_COLLECTION, safeDocId);

        // --- MAPPING FOR QUEUE APP COMPATIBILITY ---
        // Zakázka na cestě ukládá technologii jako 'digital'/'offset', CML interně jako 'DIGI'/'OFSET'
        const toQueueTech = (arr: string[]) => arr.map(t => {
          const u = t.toUpperCase();
          if (u === 'DIGI' || u === 'DIGITAL') return 'digital';
          if (u === 'OFSET' || u === 'OFFSET') return 'offset';
          return t;
        });
        const queueMapping = {
          orderNumber: job.jobId || (job as any).orderNumber || "",
          // clientName = kombinace pro zobrazení, customer = čisté jméno pro sync
          clientName: job.customer ? (job.customer + (job.jobName ? " / " + job.jobName : "")) : ((job as any).clientName || ""),
          customer: job.customer || "",
          currentStage: job.trackingStage || (job as any).currentStage || "studio",
          printType: toQueueTech(Array.isArray(job.technology) ? job.technology : ((job as any).printType || [])),
          technology: Array.isArray(job.technology) ? job.technology : ((job as any).technology || []),
          deadline: job.deadline || "",
          deliveryDate: job.deadline || "",
        };

        await setDoc(publicDocRef, {
          ...cleanJob,
          ...queueMapping,
          fireId: currentFireId,
          lastUpdated: serverTimestamp()
        });
        console.log('Firebase PUBLIC SYNC (Unified ID + Mapping):', job.jobId);

        // Vyčistíme staré duplicitní dokumenty z fronty (původní záznamy bez fireId)
        const dupQuery = query(collection(db, PUBLIC_ORDERS_COLLECTION),
          where('orderNumber', '==', queueMapping.orderNumber));
        const dupSnap = await getDocs(dupQuery);
        dupSnap.docs.forEach(d => {
          if (d.id !== currentFireId) {
            deleteDoc(d.ref);
            console.log('🧹 Smazán duplicitní záznam z fronty:', d.id, '(ponechán:', currentFireId, ')');
          }
        });
      }
      return currentFireId;
    } catch (e) {
      console.error('Chyba při ukládání do Firebase:', e);
    }
  };

  // Smazání zakázky z Firebase
  const deleteFromFirebase = async (jobId: string, orderId: string, fireId?: string, outlookId?: string, skipEmailDeletion = false) => {
    try {
      const id = (orderId || jobId).trim();
      const safeId = id.replace(/\//g, '_');

      // 1. Smazání z tabule
      await deleteDoc(doc(db, BOARD_CARDS_COLLECTION, safeId));
      // Také zkusíme fireId pokud je jiné (pro staré karty)
      if (fireId && fireId !== safeId) {
        await deleteDoc(doc(db, BOARD_CARDS_COLLECTION, fireId));
      }

      // 2. Smazání z veřejné fronty
      await deleteDoc(doc(db, PUBLIC_ORDERS_COLLECTION, safeId));
      if (fireId && fireId !== safeId) {
        await deleteDoc(doc(db, PUBLIC_ORDERS_COLLECTION, fireId));
      }

      console.log('Smazáno z obou kolekcí (Unified Safe ID):', safeId);

      // Vždy také smažeme podle jobId z fronty (pro zakázky importované z fronty)
      const q = query(collection(db, PUBLIC_ORDERS_COLLECTION),
        where('jobId', '==', orderId || jobId));
      const snap = await getDocs(q);
      snap.forEach(d => deleteDoc(d.ref));

      // Také zkusíme orderNumber (fronta může používat jiný klíč)
      const q2 = query(collection(db, PUBLIC_ORDERS_COLLECTION),
        where('orderNumber', '==', orderId || jobId));
      const snap2 = await getDocs(q2);
      snap2.forEach(d => deleteDoc(d.ref));

      console.log('🗑️ Smazáno z fronty podle jobId:', orderId || jobId);

      // Smazání emailů — přeskočíme při přečíslování (maily se přelinkují, nesmazávají)
      if (!skipEmailDeletion) {
        const ids = [orderId, jobId, outlookId].filter(Boolean) as string[];
        for (const id of ids) {
          const eq = query(collection(db, EMAILS_COLLECTION), where('zakazka_id', '==', id));
          const esnap = await getDocs(eq);
          esnap.forEach(d => deleteDoc(d.ref));
        }
        console.log('🗑️ Smazány emaily pro zakázku:', ids.join(', '));
      }
    } catch (e) {
      console.error('Chyba při mazání z Firebase:', e);
    }
  };

  const saveNoteToFirebase = async (note: BoardNoteData) => {
    try {
      const noteRef = doc(db, BOARD_NOTES_COLLECTION, note.id);
      await setDoc(noteRef, { ...note, lastUpdated: serverTimestamp() });
    } catch (e) {
      console.error('Chyba při ukládání poznámky:', e);
    }
  };

  const deleteNoteFromFirebase = async (noteId: string) => {
    try {
      await deleteDoc(doc(db, BOARD_NOTES_COLLECTION, noteId));
    } catch (e) {
      console.error('Chyba při mazání poznámky:', e);
    }
  };

  const cleanupGhostJobs = async () => {
    if (!confirm('Tato akce vymaže všechny poškozené zakázky (otazníky, null, prázdné) z TABULE i z FRONTY. Pokračovat?')) return;
    try {
      const collections = [BOARD_CARDS_COLLECTION, PUBLIC_ORDERS_COLLECTION];
      let total = 0;

      for (const collName of collections) {
        const q1 = query(collection(db, collName), where("jobId", "==", "???"));
        const q2 = query(collection(db, collName), where("jobId", "==", ""));
        const q3 = query(collection(db, collName), where("jobId", "==", "null"));
        const q4 = query(collection(db, collName), where("jobId", "==", "ID?"));
        const q5 = query(collection(db, collName), where("jobId", "==", "undefined"));

        const snaps = await Promise.all([getDocs(q1), getDocs(q2), getDocs(q3), getDocs(q4), getDocs(q5)]);
        const deletePromises = snaps.flatMap(s => s.docs.map(doc => deleteDoc(doc.ref)));
        await Promise.all(deletePromises);
        total += deletePromises.length;
      }

      alert(`Hotovo! Smazáno celkem ${total} poškozených záznamů.`);
    } catch (e) {
      console.error('Chyba při čištění:', e);
      alert('Chyba při čištění databáze.');
    }
  };

  const fixQueueImports = async () => {
    if (!confirm('Zakázky importované z fronty přestanou zpětně zapisovat do fronty. Nic se nesmaže. Pokračovat?')) return;
    try {
      const snap = await getDocs(query(collection(db, BOARD_CARDS_COLLECTION)));
      let fixed = 0;
      for (const d of snap.docs) {
        const data = d.data();
        if (data.isTracked === true) {
          await updateDoc(d.ref, { isTracked: false });
          fixed++;
        }
      }
      alert(`Hotovo! Opraveno ${fixed} zakázek.`);
    } catch (e) {
      console.error(e);
      alert('Chyba.');
    }
  };

  const migrateOldJobs = async () => {
    if (!confirm('Tato akce PŘEMÍSTÍ platné zakázky z původní fronty na Vaši novou Tabuli. Poškozené zakázky budou vymazány. Pokračovat?')) return;
    try {
      const q = query(collection(db, PUBLIC_ORDERS_COLLECTION));
      const snaps = await getDocs(q);
      let count = 0;

      for (const d of snaps.docs) {
        const data = d.data() as any;
        const jobId = (data.jobId || '').toLowerCase().trim();
        const orderNumber = (data.orderNumber || '').toLowerCase().trim();

        const isValidId = (id: string) => id && id !== '???' && id !== 'id?' && id !== 'null' && id !== 'undefined' && id !== 'nan';

        if (isValidId(jobId) || isValidId(orderNumber)) {
          // PŘEMÍSTĚNÍ: Použijeme STEJNÉ ID dokumentu pro Tabuli
          await setDoc(doc(db, BOARD_CARDS_COLLECTION, d.id), {
            ...data,
            fireId: d.id,
            lastUpdated: serverTimestamp()
          });
          count++;
        } else {
          // Smazání poškozených ze staré fronty (orders) - POUZE POKUD NEMÁ ŽÁDNÉ ID
          await deleteDoc(d.ref);
        }
      }
      alert(`Hotovo! Přeneseno ${count} platných zakázek. Poškozené byly odstraněny.`);
    } catch (e) {
      console.error('Chyba při migraci:', e);
      alert('Chyba při migraci/čištění dat.');
    }
  };

  const bringToFront = async (id: string) => {
    setJobs(prev => {
      const job = prev.find(j => j.id === id);
      if (!job) return prev;

      const newZIndex = Date.now();
      if (job.zIndex === newZIndex) return prev;

      const updatedJob = { ...job, zIndex: newZIndex };
      saveToFirebase(updatedJob, true);
      return prev.map(j => j.id === id ? updatedJob : j);
    });
  };

  // Aktualizuje zakazka_id v emailech když se TEMP ID změní na reálné
  const updateEmailsJobId = async (oldJobId: string, newJobId: string, outlookId?: string) => {
    if (!oldJobId || !newJobId || oldJobId === newJobId) return;
    try {
      const { getDocs: _getDocs, updateDoc: _updateDoc, query: _query, collection: _collection, where: _where } = await import('firebase/firestore');

      // Hledáme maily podle starého jobId i podle outlookId (makro může použít buď jedno nebo druhé)
      const searchIds = [oldJobId, outlookId].filter(Boolean) as string[];
      const snapshots = await Promise.all(
        searchIds.map(id => _getDocs(_query(_collection(db, EMAILS_COLLECTION), _where('zakazka_id', '==', id))))
      );

      // Deduplikujeme (jeden mail může mít zakazka_id = outlookId i oldJobId — nesmíme ho aktualizovat dvakrát)
      const seen = new Set<string>();
      const updates: Promise<void>[] = [];
      snapshots.forEach(snapshot => {
        snapshot.docs.forEach(d => {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            // Přelinkujeme na nové číslo zakázky (jobId), aby bylo propojení čitelné
            updates.push(_updateDoc(d.ref, { zakazka_id: newJobId }));
          }
        });
      });

      await Promise.all(updates);
      if (updates.length > 0) {
        console.log(`✉️ Přepojena ${updates.length} e-mailů: [${searchIds.join(', ')}] → ${newJobId}`);
      }
    } catch (e) {
      console.error('Chyba při přepojování e-mailů:', e, 'Col:', EMAILS_COLLECTION);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // --- FIREBASE SYNC NOTES ---
  useEffect(() => {
    const q = query(collection(db, BOARD_NOTES_COLLECTION));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const changes = snapshot.docChanges();
      if (changes.length === 0) return;

      setNotes(currentNotes => {
        let newNotes = [...currentNotes];
        changes.forEach(change => {
          const data = change.doc.data() as BoardNoteData;
          const index = newNotes.findIndex(n => n.id === change.doc.id);

          // Migrace: starý formát měl text: string, nový má items: []
          const migrateNote = (d: BoardNoteData): BoardNoteData => {
            if (!d.items && d.text) {
              return { ...d, items: [{ id: 'migrated', text: d.text, done: false }] };
            }
            return { ...d, items: d.items || [] };
          };

          if (change.type === 'added') {
            if (index === -1) {
              newNotes.push(migrateNote({ ...data, id: change.doc.id }));
            }
          }
          if (change.type === 'modified') {
            if (index !== -1) {
              newNotes[index] = migrateNote({ ...data, id: change.doc.id });
            }
          }
          if (change.type === 'removed') {
            if (index !== -1) {
              newNotes.splice(index, 1);
            }
          }
        });
        return newNotes;
      });
    });

    return () => unsubscribe();
  }, []);

  // --- FIREBASE SYNC: Obousměrná synchronizace ---
  useEffect(() => {
    // Posloucháme primárně 'BOARD_CARDS_COLLECTION' (naše Tabule)
    const q = query(collection(db, BOARD_CARDS_COLLECTION));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Získáme všechny změny
      const changes = snapshot.docChanges();

      if (changes.length === 0) return;

      setJobs(currentJobs => {
        let newJobs = [...currentJobs];
        let hasChanges = false;
        const batchPositions: { x: number, y: number }[] = [];

        changes.forEach(change => {
          const data = change.doc.data() as JobData;
          // Ignorujeme, pokud data nejsou validní JobData (např. chybí jobId nebo je to ghost ID)
          const checkId = (data.jobId || '').toLowerCase().trim();
          if (!checkId || checkId === '???' || checkId === 'id?' || checkId === 'null' || checkId === 'undefined' || checkId === 'nan') return;

          // Hledáme, zda už zakázku máme (podle interního Firestore ID)
          const index = newJobs.findIndex(j => j.fireId === change.doc.id);

          if (change.type === 'added') {
            if (index === -1) {
              // Zkusíme najít duplicitu podle jobId (zabráníme dvojitým kartám)
              const jobIdIndex = newJobs.findIndex(j => j.jobId === data.jobId);
              if (jobIdIndex !== -1) {
                // Karta už existuje - jen aktualizujeme fireId a data
                newJobs[jobIdIndex] = { 
                  ...newJobs[jobIdIndex], 
                  ...data, 
                  fireId: change.doc.id, 
                  id: newJobs[jobIdIndex].id,
                  isNew: newJobs[jobIdIndex].isNew,
                  trackingStage: data.trackingStage || newJobs[jobIdIndex].trackingStage,
                  isTracked: data.isTracked ?? newJobs[jobIdIndex].isTracked,
                  position: newJobs[jobIdIndex].position, // Zachováme lokální pozici
                };
                hasChanges = true;
                console.log('🔗 Propojeno fireId pro existující zakázku:', data.jobId, '→', change.doc.id);
              } else {
                // NOVÁ ZAKÁZKA (přišla z webhooku/jiného klienta)
                // Pokud nemá pozici (nebo má výchozí 100,100), vypočítáme jí tak, aby nepřekryla stávající
                const isDefaultPos = data.position && Math.abs(data.position.x - 100) < 5 && Math.abs(data.position.y - 100) < 5;
                const finalPos = (!data.position || isDefaultPos) ? getNewJobPosition(batchPositions, newJobs) : data.position;
                batchPositions.push(finalPos);

                const newJob: JobData = {
                  ...data,
                  fireId: change.doc.id,
                  id: Math.random().toString(36).substring(2, 11), // Vygenerujeme lokální ID pro React key
                  // Pokud chybí, doplníme defaulty
                  status: data.status || JobStatus.INQUIRY,
                  position: finalPos,
                  items: data.items || [],
                  technology: data.technology || [],
                  dateReceived: data.dateReceived || new Date().toISOString().split('T')[0],
                  zIndex: data.zIndex || Date.now()
                };
                newJobs = [...newJobs, newJob]; // Přidáme na konec (aby byla v DOMu později a tedy nahoře)
                hasChanges = true;
                console.log('📥 Stažena nová zakázka z Firebase:', data.jobId || change.doc.id);
              }
            }
          }

          if (change.type === 'modified') {
            if (index !== -1) {
              const current = newJobs[index];
              // Aktualizujeme vždy, pokud se změnila data (s výjimkou čistě lokálního isNew)
              // Použijeme JSON stringify pro jednoduché porovnání hlubokých změn bez isNew
              const { isNew: _currentIsNew, ...currentPure } = current;
              const { isNew: _dataIsNew, ...dataPure } = data;

              if (JSON.stringify(currentPure) !== JSON.stringify({ ...dataPure, fireId: change.doc.id, id: current.id })) {
                newJobs[index] = { 
                  ...current, 
                  ...data, 
                  fireId: change.doc.id, 
                  isNew: current.isNew,
                  // Synchronizované stavy z výroby bereme prioritně, pokud v dokumentu jsou
                  trackingStage: data.trackingStage ?? current.trackingStage,
                  isTracked: data.isTracked ?? current.isTracked,
                };
                hasChanges = true;

                // Aktualizujeme ref (ale NE state selectedJob — to by zavřelo modal)
                if (selectedJobRef.current?.id === current.id) {
                  selectedJobRef.current = newJobs[index];
                }
                console.log('🔄 Aktualizována zakázka z Firebase:', data.jobId || change.doc.id);
              }
            }
          }

          if (change.type === 'removed') {
            if (index !== -1) {
              // SMAZÁNO JINDE
              newJobs.splice(index, 1);
              hasChanges = true;
              console.log('🗑️ Odstraněna zakázka (sync):', data.jobId);
            }
          }
        });

        return hasChanges ? newJobs : currentJobs;
      });
    }, (error) => {
      console.error("Firebase sync error:", error);
    });

    return () => unsubscribe();
  }, []);

  // --- FIREBASE SYNC: Fronta (PUBLIC_ORDERS) → Tabule (jeden unified listener) ---
  // Princip: tento listener NIKDY nevolá setJobs přímo.
  // Pouze zapisuje do BOARD_CARDS_COLLECTION → board listener pak aktualizuje state.
  useEffect(() => {
    const q = query(collection(db, PUBLIC_ORDERS_COLLECTION));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const changes = snapshot.docChanges();
      if (changes.length === 0) return;

      const addedChanges = changes.filter(c => c.type === 'added');
      const modifiedChanges = changes.filter(c => c.type === 'modified');
      const removedChanges = changes.filter(c => c.type === 'removed');

      const normalizeTech = (arr: string[]) => arr.map((t: string) => {
        const lower = t.toLowerCase();
        if (lower === 'offset' || lower === 'o') return 'OFSET';
        if (lower === 'digital' || lower === 'd') return 'DIGI';
        return t;
      });

      // --- AUTO-IMPORT: Nové zakázky z fronty → Tabule ---
      if (addedChanges.length > 0) {
        const boardSnap = await getDocs(query(collection(db, BOARD_CARDS_COLLECTION)));
        // Indexujeme board karty TŘEMI způsoby pro robustní matching:
        // 1. jobId pole (přesně)  2. safeId z jobId (/ → _)  3. fireId pole
        const toSafe = (s: string) => s.replace(/\//g, '_');
        const boardByJobId = new Map<string, typeof boardSnap.docs[0]>();
        const boardBySafe = new Map<string, typeof boardSnap.docs[0]>();
        boardSnap.docs.forEach(d => {
          const jid = (d.data().jobId || '').trim();
          if (jid) { boardByJobId.set(jid, d); boardBySafe.set(toSafe(jid), d); }
          const fid = (d.data().fireId || '').trim();
          if (fid) boardBySafe.set(fid, d);
        });
        const findBoardDoc = (id: string) =>
          boardByJobId.get(id) || boardBySafe.get(toSafe(id)) || boardBySafe.get(id);

        for (const change of addedChanges) {
          const data = change.doc.data() as any;
          const jobId = (data.jobId || data.orderNumber || '').trim();
          if (!jobId || jobId === '???' || jobId === 'null' || jobId === 'undefined') continue;

          const existingDoc = findBoardDoc(jobId);
          if (existingDoc) {
            // Karta v boardu už existuje — synchronizujeme fromQueue + klíčová pole z fronty
            const existing = existingDoc.data();
            const syncFields: Record<string, any> = { lastUpdated: serverTimestamp() };
            if (!existing.fromQueue) syncFields.fromQueue = true;
            syncFields.trackingStage = data.currentStage || data.trackingStage || existing.trackingStage || 'studio';
            const customer = data.customer || data.clientName;
            if (customer && !existing.customer) syncFields.customer = customer;
            const rawTech = data.printType || data.technology;
            if (rawTech?.length && (!existing.technology || !existing.technology.length)) syncFields.technology = normalizeTech(rawTech);
            const deadline = data.deadline || data.deliveryDate;
            if (deadline && !existing.deadline) syncFields.deadline = deadline;
            updateDoc(existingDoc.ref, syncFields)
              .catch(e => console.warn('❌ fromQueue sync FAIL:', e));
            // Také přidáme do setu aby se nepokusil o duplicitní import
            boardByJobId.set(jobId, existingDoc);
            boardBySafe.set(toSafe(jobId), existingDoc);
            continue;
          }

          const newJob: JobData = {
            id: Math.random().toString(36).substring(2, 11),
            jobId,
            customer: data.customer || data.clientName || '',
            jobName: data.jobName || '',
            address: data.address || '',
            dateReceived: data.dateReceived || new Date().toISOString().split('T')[0],
            deadline: data.deadline || data.deliveryDate || '',
            technology: normalizeTech(data.printType || data.technology || []) as ('DIGI' | 'OFSET' | 'KOOP')[],
            status: data.status || JobStatus.INQUIRY,
            position: { x: 100, y: 100 },
            isNew: false,
            isTracked: false,
            fromQueue: true,
            trackingStage: data.currentStage || data.trackingStage || 'studio',
            zIndex: Date.now(),
            items: data.items || [],
            bindingType: data.bindingType || '',
            laminationType: data.laminationType || '',
            processing: data.processing || '',
            cooperation: data.cooperation || '',
            shippingNotes: data.shippingNotes || '',
            generalNotes: data.generalNotes || '',
            icon: data.icon || 'FileText',
          };

          // Zapíšeme do tabule — board listener zachytí 'added' a přidá do state
          await saveToFirebase(newJob, true);
          boardByJobId.set(jobId, null as any); // Zabránění duplicitám v dávce
          boardBySafe.set(toSafe(jobId), null as any);
          if (data.orderNumber) boardBySafe.set(toSafe(data.orderNumber.trim()), null as any);
          console.log(`✅ Auto-importována zakázka: ${newJob.jobId}`);
        }
      }

      // --- SYNC: Změna dat z fronty → Tabule (stage, zákazník, technologie, termín) ---
      modifiedChanges.forEach(change => {
        const data = change.doc.data() as any;
        const jobId = (data.jobId || data.orderNumber || '').trim();
        if (!jobId) return;

        const syncFields: Record<string, any> = { lastUpdated: serverTimestamp() };
        if (data.currentStage) syncFields.trackingStage = data.currentStage;
        const customer = data.customer || data.clientName;
        if (customer) syncFields.customer = customer;
        const rawTech = data.printType || data.technology;
        if (rawTech?.length) syncFields.technology = normalizeTech(rawTech);
        const deadline = data.deadline || data.deliveryDate;
        if (deadline) syncFields.deadline = deadline;

        const safeJobId = jobId.replace(/\//g, '_');
        // Hledáme kartu přes jobId i přes fireId (robustní pro / vs _ rozdíl)
        Promise.all([
          getDocs(query(collection(db, BOARD_CARDS_COLLECTION), where('jobId', '==', jobId))),
          getDocs(query(collection(db, BOARD_CARDS_COLLECTION), where('fireId', '==', safeJobId))),
        ]).then(([byJobId, byFireId]) => {
          const seen = new Set<string>();
          const allDocs = [...byJobId.docs, ...byFireId.docs].filter(d => {
            if (seen.has(d.id)) return false;
            seen.add(d.id);
            return true;
          });
          if (allDocs.length === 0) {
            console.warn('❌ Orders sync FAIL - karta nenalezena:', jobId);
            return;
          }
          allDocs.forEach(d => updateDoc(d.ref, syncFields));
          console.log(`✅ Orders sync OK: ${jobId}`);
        }).catch(e => console.warn('❌ Orders sync FAIL:', e));
      });

      // --- SMAZÁNÍ z fronty → smaž i z tabule ---
      // Nevyvoláváme setJobs přímo — smazání z BOARD_CARDS zachytí board listener
      // POZOR: Kontrolujeme, zda zakázka SKUTEČNĚ zmizela z fronty (ne jen čištění duplicit)
      removedChanges.forEach(change => {
        const data = change.doc.data() as any;
        const removedJobId = (data.jobId || data.orderNumber || '').trim();
        if (!removedJobId) return;

        // Zkontrolujeme OBOU polí (orderNumber i jobId), aby nechyběl žádný formát
        const q1 = query(collection(db, PUBLIC_ORDERS_COLLECTION), where('orderNumber', '==', removedJobId));
        const q2 = query(collection(db, PUBLIC_ORDERS_COLLECTION), where('jobId', '==', removedJobId));

        Promise.all([getDocs(q1), getDocs(q2)]).then(([snap1, snap2]) => {
          // Filtrujeme smazaný dokument samotný, aby se nepočítal jako "stále existující"
          const remaining = [...snap1.docs, ...snap2.docs].filter(d => d.id !== change.doc.id);

          if (remaining.length > 0) {
            console.log('🧹 Odstraněn duplicát, zakázka stále existuje ve frontě:', removedJobId);
            return;
          }

          console.log('🗑️ Zakázka kompletně smazána z fronty, mažu z tabule:', removedJobId);
          const boardQuery = query(collection(db, BOARD_CARDS_COLLECTION), where('jobId', '==', removedJobId));
          getDocs(boardQuery).then(snap => {
            snap.docs.forEach(d => deleteDoc(d.ref));
          });
        }).catch(e => console.warn('❌ Delete sync FAIL:', e));
      });
    }, (error) => {
      console.error('Firebase orders sync error:', error);
    });

    return () => unsubscribe();
  }, []);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Chyba při vstupu do fullscreenu: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const getNewJobPosition = (extraPositions: { x: number, y: number }[] = [], checkJobs: JobData[] = jobs) => {
    const ws = workspaceRef.current;
    const scrollX = ws ? ws.scrollLeft : 0;
    const scrollY = ws ? ws.scrollTop : 0;

    let x = scrollX + 60;
    let y = scrollY + 80;
    let hasCollision = true;
    let safetyCounter = 0;

    // Pokud narazíme na jinou zakázku na stejné / blízké pozici, posuneme diagonálně (trochu odskočená karta)
    while (hasCollision && safetyCounter < 50) {
      hasCollision = false;

      // Kontrola proti zadaným zakázkám (v snapshotu to jsou ty nové, jinde ty aktuální ze state)
      for (const job of checkJobs) {
        if (job.position && Math.abs(job.position.x - x) < 25 && Math.abs(job.position.y - y) < 25) {
          hasCollision = true;
          break;
        }
      }

      // Kontrola proti nově přidávaným v této dávce
      if (!hasCollision) {
        for (const pos of extraPositions) {
          if (Math.abs(pos.x - x) < 25 && Math.abs(pos.y - y) < 25) {
            hasCollision = true;
            break;
          }
        }
      }

      if (hasCollision) {
        x += 40; // O něco větší diagonální posun, aby to bylo víc vidět (z 35 na 40 px)
        y += 40;
        safetyCounter++;
      }
    }

    return { x, y };
  };

  const handleSortByDeadline = () => {
    const productionJobs = jobs.filter(j => {
      const isInProduction = j.fromQueue === true ||
      j.isTracked === true ||
      (j.trackingStage && j.trackingStage !== '') ||
      j.status === JobStatus.READY_FOR_PROD ||
      j.status === JobStatus.EXPRESS ||
      j.status === JobStatus.COMPLETED;
      return isInProduction;
    });

    if (productionJobs.length === 0) {
      alert('Žádné zakázky ve výrobě k seřazení.');
      return;
    }

    // Seřadíme podle deadline (prázdný deadline jde na konec)
    const sorted = [...productionJobs].sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });

    const CARDS_PER_ROW = 7;
    const startX = 60;
    const startY = 80;
    const colWidth = 220;
    const rowHeight = 220;

    const newPositions = new Map<string, { x: number; y: number }>();

    sorted.forEach((job, index) => {
      const col = index % CARDS_PER_ROW;
      const row = Math.floor(index / CARDS_PER_ROW);
      newPositions.set(job.id, {
        x: startX + col * colWidth,
        y: startY + row * rowHeight
      });
    });

    const numRows = Math.ceil(sorted.length / CARDS_PER_ROW);
    const neededHeight = startY + numRows * rowHeight + 300;
    setMinBoardHeight(Math.max(2000, neededHeight));

    setJobs(prev => prev.map(job => {
      if (newPositions.has(job.id)) {
        const newPos = newPositions.get(job.id)!;
        const updatedJob = { ...job, position: newPos };
        saveToFirebase(updatedJob, true);
        return updatedJob;
      }
      return job;
    }));

    alert(`Seřazeno ${productionJobs.length} zakázek ve výrobě podle termínu.`);
  };

  const getDistrict = (address: string = '') => {
    const match = address.match(/Praha\s*(\d{1,2})/i);
    return match ? `Praha ${match[1]}` : null;
  };

  const handleAutoArrange = () => {
    // 1. Zjistíme distrikty všech EXPRES zakázek
    const expressDistricts = new Set(
      jobs
        .filter(j => j.status === JobStatus.EXPRESS)
        .map(j => getDistrict(j.address))
        .filter(Boolean)
    );

    if (expressDistricts.size === 0) {
      alert("Pro seskupení dle Prahy je nutné mít alespoň jednu EXPRES zakázku s pražskou adresou.");
      return;
    }

    // 2. Rozdělíme zakázky na ty, které budeme hýbat (dotčené) a ty, které zůstanou (nedotčené)
    const affectedJobs = jobs.filter(j => {
      const dist = getDistrict(j.address);
      return dist && expressDistricts.has(dist);
    });

    if (affectedJobs.length === 0) return;

    // Seřadíme dotčené zakázky pro hezký grid
    const sortedAffected = [...affectedJobs].sort((a, b) => {
      const distA = getDistrict(a.address) || '';
      const distB = getDistrict(b.address) || '';
      return distA.localeCompare(distB, undefined, { numeric: true });
    });

    const stepX = 210;
    const stepY = 210;
    const startX = 100;
    const startY = 100;
    const itemsPerRow = 4;

    setJobs(prev => prev.map(job => {
      const idx = sortedAffected.findIndex(j => j.id === job.id);
      if (idx !== -1) {
        // Pouze dotčeným zakázkám změníme pozici
        const row = Math.floor(idx / itemsPerRow);
        const col = idx % itemsPerRow;
        const newPos = {
          x: startX + col * stepX,
          y: startY + row * stepY
        };
        return { ...job, position: newPos };
      }
      return job; // Ostatní zůstanou kde jsou
    }));

    alert(`Přerovnáno ${affectedJobs.length} zakázek patřících do rajónů EXPRES zásilek (${Array.from(expressDistricts).join(', ')}).`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData('jobId');
    const noteId = e.dataTransfer.getData('noteId');
    const rawOffsetX = e.dataTransfer.getData('offsetX');
    const rawOffsetY = e.dataTransfer.getData('offsetY');

    if (!rawOffsetX || !rawOffsetY) return;

    if (!jobId && !noteId) return;

    const offsetX = parseFloat(rawOffsetX);
    const offsetY = parseFloat(rawOffsetY);

    if (workspaceRef.current) {
      const rect = workspaceRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - offsetX;
      const y = e.clientY - rect.top - offsetY;

      if (jobId) {
        setJobs(prev => prev.map(job => job.id === jobId ? { ...job, position: { x, y }, isNew: false } : job));
        const movedJob = jobs.find(j => j.id === jobId);
        if (movedJob) saveToFirebase({ ...movedJob, position: { x, y }, isNew: false }, true);
      } else if (noteId) {
        setNotes(prev => prev.map(note => note.id === noteId ? { ...note, position: { x, y } } : note));
        const movedNote = notes.find(n => n.id === noteId);
        if (movedNote) saveNoteToFirebase({ ...movedNote, position: { x, y } });
      }
    }
  };

  const handleCreateNote = () => {
    const pos = getNewJobPosition();
    const newNote: BoardNoteData = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      items: [],
      position: pos,
      zIndex: Date.now(),
      color: '#ff69b4'
    };
    setNotes(prev => [...prev, newNote]);
    saveNoteToFirebase(newNote);
  };

  const handleUpdateNote = (id: string, items: BoardNoteItem[]) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, items } : n));
    const note = notes.find(n => n.id === id);
    if (note) saveNoteToFirebase({ ...note, items });
  };

  const handleDeleteNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    deleteNoteFromFirebase(id);
  };

  const handleBringNoteToFront = (id: string) => {
    setNotes(prev => {
      const note = prev.find(n => n.id === id);
      if (!note) return prev;
      const newZIndex = Date.now();
      if (note.zIndex === newZIndex) return prev;
      const updatedNote = { ...note, zIndex: newZIndex };
      saveNoteToFirebase(updatedNote);
      return prev.map(n => n.id === id ? updatedNote : n);
    });
  };

  const handleCreateJob = () => {
    const pos = getNewJobPosition();

    const tempId = `TEMP-${Date.now()}`;
    const newJob: JobData = {
      id: Math.random().toString(36).substring(2, 11),
      jobId: tempId, customer: '', jobName: '', address: '',
      dateReceived: new Date().toISOString().split('T')[0], deadline: '',
      technology: [], status: JobStatus.INQUIRY, position: pos,
      isNew: true,
      isTracked: false, // NOVÉ: Nezobrazovat hned ve frontě na cestě
      zIndex: Date.now(),
      items: [{ id: Math.random().toString(36).substring(2, 11), description: '', quantity: 0, size: '', colors: '', techSpecs: '', stockFormat: '', paperType: '', paperWeight: '', itemsPerSheet: '', numberOfPages: 0 }],
      bindingType: '', laminationType: '', processing: '', cooperation: '', shippingNotes: '', generalNotes: '', icon: 'FileText'
    };
    openModal(newJob);
  };

  const handleSaveJob = (data: JobData, shouldClose = true) => {
    // Pokud se mění z TEMP ID na reálné, přepojujeme emaily
    const previousJob = jobs.find(j => j.id === data.id);
    
    // --- PŘEČÍSLOVÁNÍ (Smazání starého záznamu při změně jobId) ---
    if (previousJob && previousJob.jobId && previousJob.jobId !== data.jobId) {
      console.log(`🔄 Přečíslování: Mažu starý záznam ${previousJob.jobId} a vytvářím ${data.jobId}`);
      // skipEmailDeletion = true: maily nepřerušujeme, jen přelinkujeme níže
      deleteFromFirebase(previousJob.jobId, previousJob.jobId, previousJob.fireId, previousJob.outlookId, true);

      // Přelinkujeme maily na nové číslo zakázky (hledáme i podle outlookId)
      updateEmailsJobId(previousJob.jobId, data.jobId, previousJob.outlookId || data.outlookId);
    }

    // 1. Lokální update (optimistický)
    setJobs(prev => {
      const exists = prev.find(j => j.id === data.id);
      if (exists) return prev.map(j => j.id === data.id ? { ...data, isNew: false } : j);
      return [...prev, { ...data, isNew: true }]; // Přidáme na konec
    });

    // 2. Uložení do Firebase (na pozadí)
    saveToFirebase(data).then(fireId => {
      if (fireId) {
        setJobs(prev => prev.map(j => j.id === data.id ? { ...j, fireId } : j));
      }
    });

    if (shouldClose) {
      setIsModalOpen(false);
      setSelectedJob(null);
      selectedJobRef.current = null;
    }
  };

  const handleDeleteJob = (id: string) => {
    if (confirm('Smazat zakázku? Smaže se i ze systému "Zakázka na cestě".')) {
      const jobToDelete = jobs.find(j => j.id === id);
      // Optimisticky odstraníme ze state (board listener potvrdí smazání z Firebase)
      setJobs(prev => prev.filter(j => j.id !== id));
      if (jobToDelete) {
        // Oprava: předáváme jobId (číslo zakázky), ne interní React id
        deleteFromFirebase(jobToDelete.jobId, jobToDelete.jobId, jobToDelete.fireId, jobToDelete.outlookId);
      }
      setIsModalOpen(false);
      setSelectedJob(null);
      selectedJobRef.current = null;
    }
  };

  // Sync Urgent FROM Board TO Tracking
  const updateFirebaseUrgency = async (jobId: string, orderId: string, isUrgent: boolean) => {
    try {
      const q = query(collection(db, PUBLIC_ORDERS_COLLECTION), where("orderNumber", "==", orderId || jobId));
      const snaps = await getDocs(q);

      // Update all matching docs (should be one)
      const updates = snaps.docs.map(doc => updateDoc(doc.ref, { isUrgent }));
      await Promise.all(updates);

      if (updates.length > 0) {
        console.log(`Urgency updated for ${orderId}: ${isUrgent}`);
      }
    } catch (e) {
      console.error('Error updating urgency:', e);
    }
  };

  const handleStatusChangeOnBoard = (id: string, status: JobStatus) => {
    setJobs(prev => {
      const job = prev.find(j => j.id === id);

      // Sync Urgent status to Firebase if tracked
      if (job && (status === JobStatus.EXPRESS || job.status === JobStatus.EXPRESS)) {
        const isNowUrgent = status === JobStatus.EXPRESS;
        updateFirebaseUrgency(job.id, job.jobId || job.id, isNowUrgent);
      }

      const updated = prev.map(j => j.id === id ? { ...j, status } : j);

      // explicitní save pro všechny změny statusu
      const updatedJob = updated.find(j => j.id === id);
      if (updatedJob) saveToFirebase(updatedJob);

      if (status === JobStatus.READY_FOR_PROD) {
        const jobToOpen = updated.find(j => j.id === id);
        if (jobToOpen) {
          const hasMissingTech = !jobToOpen.technology || jobToOpen.technology.length === 0;
          const hasMissingColors = jobToOpen.items.some(item => !item.colors || item.colors.trim() === '');

          if (hasMissingTech || hasMissingColors) {
            openModal(jobToOpen);
          }
        }
      }
      return updated;
    });
  };

  const filteredJobs = jobs.filter(j => {
    // Schováme poškozené zakázky z hlavního zobrazení
    const id = (j.jobId || '').toLowerCase().trim();
    if (!id || id === '???' || id === 'id?' || id === 'null' || id === 'undefined') return false;

    const isInProduction = j.fromQueue === true ||
      j.isTracked === true ||
      (j.trackingStage && j.trackingStage !== '') ||
      j.status === JobStatus.READY_FOR_PROD ||
      j.status === JobStatus.EXPRESS ||
      j.status === JobStatus.COMPLETED;

    if (activePage === 1 && isInProduction) return false;
    if (activePage === 2 && !isInProduction) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const isNumericSearch = /\d/.test(q);
    if (isNumericSearch) {
      return (j.jobId || '').toLowerCase().includes(q) ||
        (j.outlookId || '').toLowerCase().includes(q);
    } else {
      return (j.customer || '').toLowerCase().includes(q) ||
        (j.jobName || '').toLowerCase().includes(q);
    }
  });

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-purple-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage version={VERSION} />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950 font-sans">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between z-50 shadow-2xl">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="bg-purple-600 p-2 rounded-xl"><Printer className="w-5 h-5 text-white" /></div>
            <h1 className="text-xl font-black text-white tracking-tighter uppercase flex items-center gap-2">
              CML BOARD
              <span className="bg-purple-600 text-white text-[10px] px-2 py-0.5 rounded-full shadow-lg shadow-purple-900/50">{VERSION}</span>
            </h1>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" placeholder="Hledat..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-full pl-10 pr-4 py-2 text-sm w-48 lg:w-64 focus:ring-2 focus:ring-purple-500 outline-none text-slate-200" />
          </div>

          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-full p-0.5 gap-0.5">
            <button
              onClick={() => setActivePage(1)}
              className={`px-4 py-1.5 rounded-full text-xs font-black transition-all ${
                activePage === 1 
                  ? 'bg-purple-600 text-white shadow-lg' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              PŘÍPRAVA
            </button>
            <button
              onClick={() => setActivePage(2)}
              className={`px-4 py-1.5 rounded-full text-xs font-black transition-all ${
                activePage === 2 
                  ? 'bg-emerald-600 text-white shadow-lg' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              VÝROBA
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleFullScreen} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition-all">
            {isFullScreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            <span className="hidden xl:inline">{isFullScreen ? 'Zmenšit' : 'Celá obrazovka'}</span>
          </button>
          <button onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition-all" title="Nastavení">
            <Settings className="w-4 h-4 text-slate-400" />
            <span className="hidden xl:inline">Nastavení</span>
          </button>
          <button onClick={handleSortByDeadline} title="Seřadí zakázky ve výrobě do sloupců podle termínu" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition-all">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span className="hidden lg:inline">Srovnat dle termínu</span>
          </button>
          <div className="flex items-center gap-2 ml-1">
            <button onClick={handleCreateNote} className="flex items-center justify-center p-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-lg shadow-amber-900/40 active:scale-95 transition-all w-8 h-8 md:w-auto md:px-4 md:py-2">
              <StickyNote className="w-4 h-4" />
              <span className="hidden md:inline text-xs font-black">POZNÁMKA</span>
            </button>
            <button onClick={handleCreateJob} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black shadow-lg shadow-purple-900/40 active:scale-95 transition-all"><Plus className="w-4 h-4" /> NOVÁ ZAKÁZKA</button>
          </div>
          <div className="w-px h-8 bg-slate-800 mx-1 hidden md:block"></div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white text-xs font-bold border border-red-500/20 transition-all"
            title={`Odhlásit uživatele ${user?.email}`}
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden xl:inline">Odhlásit</span>
          </button>
        </div>
      </header>

      <main
        ref={workspaceRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={`flex-1 relative overflow-auto p-10 ${
          activePage === 1 ? 'bg-slate-950' : 'bg-slate-800'
        }`}
        style={{
          backgroundImage: activePage === 1
            ? 'radial-gradient(circle, #1e293b 1px, transparent 1px)'
            : 'radial-gradient(circle, #334155 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          minWidth: '2000px',
          minHeight: `${minBoardHeight}px`
        }}
      >
        {filteredJobs.map(job => (
          <JobCard
            key={job.id}
            job={job}
            onClick={() => {
              bringToFront(job.id);
              openModal(job);
            }}
            onDelete={handleDeleteJob}
            onStatusChange={handleStatusChangeOnBoard}
            onBringToFront={() => bringToFront(job.id)}
          />
        ))}

        {notes.map(note => (
          <BoardNote
            key={note.id}
            note={note}
            onUpdate={handleUpdateNote}
            onDelete={handleDeleteNote}
            onBringToFront={() => handleBringNoteToFront(note.id)}
          />
        ))}
      </main>



      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[2147483647] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-xl shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold flex items-center gap-3"><Settings className="w-6 h-6 text-slate-400" /> Nastavení</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-500 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2 tracking-widest">Gemini API Klíč</label>
                <input
                  type="password"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-5 py-3 text-sm text-slate-200 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                  placeholder="Vložte svůj API klíč..."
                  value={manualApiKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setManualApiKey(val);
                    localStorage.setItem('cml_gemini_key', val);
                  }}
                />
                <p className="mt-2 text-[10px] text-slate-500 leading-relaxed italic">
                  Klíč se ukládá pouze ve vašem prohlížeči (localStorage). Slouží pro funkci AI Pomocníka v Tabuli.
                </p>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-3 tracking-widest">AI Poskytovatel</label>
                <div className="flex gap-2 p-1.5 bg-slate-800 rounded-2xl border border-slate-700">
                  {(['gemini', 'ollama'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => { setAiProvider(p); localStorage.setItem('cml_ai_provider', p); }}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${aiProvider === p ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    >
                      {p === 'gemini' ? '✦ Gemini API' : '⬡ Ollama (lokální)'}
                    </button>
                  ))}
                </div>
                {aiProvider === 'ollama' && (
                  <div className="mt-3">
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">Lokální model</label>
                    <div className="flex gap-2">
                      {['llama3.1:latest', 'gemma4:e4b', 'gemma2:2b'].map(m => (
                        <button
                          key={m}
                          onClick={() => { setOllamaModel(m); localStorage.setItem('cml_ollama_model', m); }}
                          className={`flex-1 py-2.5 rounded-xl text-xs font-black border transition-all ${ollamaModel === m ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500'}`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600 italic">Ollama musí běžet na localhost:11434. JSON výstupy mohou být méně přesné než u Gemini.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-6 border-t border-slate-800 space-y-3">
              <h4 className="text-[10px] font-black text-slate-500 uppercase mb-4 tracking-widest">Servisní nástroje (Nová verze)</h4>

              <button
                onClick={migrateOldJobs}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-purple-600/10 hover:bg-purple-600 text-purple-500 hover:text-white rounded-2xl text-[11px] font-black border border-purple-500/30 transition-all uppercase tracking-wider"
              >
                <ClipboardList className="w-4 h-4" /> PŘENÉST PLATNÉ ZAKÁZKY ZE STARÉ FRONTY
              </button>

              <button
                onClick={cleanupGhostJobs}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white rounded-2xl text-[11px] font-black border border-red-500/30 transition-all uppercase tracking-wider"
              >
                <Trash2 className="w-4 h-4" /> SMAZAT POŠKOZENÉ ZAKÁZKY Z TABULE
              </button>

              <button
                onClick={fixQueueImports}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white rounded-2xl text-[11px] font-black border border-blue-500/30 transition-all uppercase tracking-wider"
              >
                <ClipboardCheck className="w-4 h-4" /> OPRAVIT IMPORTOVANÉ ZAKÁZKY Z FRONTY
              </button>

              <p className="mt-3 text-[9px] text-slate-600 text-center italic">
                Údržba nové soukromé databáze Tabule.
              </p>
            </div>
          </div>

          <div className="flex justify-end mt-10">
            <button onClick={() => setIsSettingsOpen(false)} className="px-10 py-3 bg-purple-600 text-white rounded-xl text-sm font-black shadow-lg hover:bg-purple-500 active:scale-95 transition-all">HOTOVO</button>
          </div>
        </div>
      )}

      {isModalOpen && (selectedJobRef.current || selectedJob) && (
        <JobFormModal
          key={(selectedJobRef.current || selectedJob)!.id}
          job={(selectedJobRef.current || selectedJob)!}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedJob(null);
            selectedJobRef.current = null;
          }}
          onSave={handleSaveJob}
          onDelete={handleDeleteJob}
          aiProvider={aiProvider}
          ollamaModel={ollamaModel}
          productionCustomers={jobs
            .filter(j => j.status === JobStatus.READY_FOR_PROD && j.customer)
            .map(j => j.customer)
            .filter((v, i, a) => a.indexOf(v) === i)}
          allCustomers={jobs
            .filter(j => j.customer)
            .map(j => j.customer as string)
            .filter((v, i, a) => a.indexOf(v) === i)}
        />
      )}
    </div>
  );
};

export default App;
