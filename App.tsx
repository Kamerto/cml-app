
import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Search,
  Settings, X, Printer, Trash2,
  Loader2, MapPin, Zap, Navigation,
  Layers, Maximize, Minimize, FolderSync, LogOut, ClipboardList, ClipboardCheck, ClipboardPaste,
  StickyNote
} from 'lucide-react';
import { JobData, JobStatus, PrintItem, BoardNoteData } from './types';
import { INITIAL_JOBS } from './constants';
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

const EMAILS_COLLECTION = 'zakazka_emails';
import LoginPage from './components/LoginPage';

const App: React.FC = () => {
  const VERSION = 'v2.7.13-UNIFIED';
  const [jobs, setJobs] = useState<JobData[]>(() => {
    const saved = localStorage.getItem('cml_jobs_v3');
    return saved ? JSON.parse(saved) : INITIAL_JOBS;
  });
  const [notes, setNotes] = useState<BoardNoteData[]>(() => {
    const saved = localStorage.getItem('cml_notes_v1');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [manualApiKey, setManualApiKey] = useState(() => localStorage.getItem('cml_gemini_key') || '');
  const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true';
  console.log("APP.TSX: MOCK_MODE =", MOCK_MODE);

  const [user, setUser] = useState<User | null>(MOCK_MODE ? { email: 'mock@cml.local' } as any : null);
  const [isAuthLoading, setIsAuthLoading] = useState(!MOCK_MODE);

  const workspaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('cml_jobs_v3', JSON.stringify(jobs));
  }, [jobs]);

  useEffect(() => {
    localStorage.setItem('cml_notes_v1', JSON.stringify(notes));
  }, [notes]);

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

  const saveToFirebase = async (job: JobData) => {
    if (!job.jobId) return;
    try {
      // 1. AKTUALIZACE SOUKROMÉ TABULE (BOARD_CARDS_COLLECTION)
      let currentFireId = job.fireId;
      if (currentFireId) {
        // Máme ID, updatujeme přímo
        await updateDoc(doc(db, BOARD_CARDS_COLLECTION, currentFireId), { ...job, lastUpdated: serverTimestamp() });
        console.log('Firebase BOARD UPDATE (Direct):', job.jobId);
      } else {
        // Nemáme ID, musíme najít nebo vytvořit
        const boardQuery = query(collection(db, BOARD_CARDS_COLLECTION), where('jobId', '==', job.jobId));
        const boardSnap = await getDocs(boardQuery);
        if (!boardSnap.empty) {
          currentFireId = boardSnap.docs[0].id;
          await updateDoc(boardSnap.docs[0].ref, { ...job, lastUpdated: serverTimestamp() });
          console.log('Firebase BOARD UPDATE (Query):', job.jobId);
        } else {
          const newDoc = await addDoc(collection(db, BOARD_CARDS_COLLECTION), { ...job, created_at: serverTimestamp() });
          currentFireId = newDoc.id;
          console.log('Firebase BOARD CREATE:', job.jobId);
        }
      }

      // 2. AKTUALIZACE SPOLEČNÉ FRONTY (PUBLIC_ORDERS_COLLECTION / orders)
      // UNIFIED ID STRATEGY: Použijeme stejné ID dokumentu jako v Tabuli
      if (job.isTracked && currentFireId) {
        // Použijeme setDoc místo addDoc, aby ID bylo stejné jako na Tabuli
        const publicDocRef = doc(db, PUBLIC_ORDERS_COLLECTION, currentFireId);

        // --- MAPPING FOR QUEUE APP COMPATIBILITY ---
        const queueMapping = {
          orderNumber: job.jobId || (job as any).orderNumber || "",
          clientName: job.customer ? (job.customer + (job.jobName ? " / " + job.jobName : "")) : ((job as any).clientName || ""),
          currentStage: job.trackingStage || (job as any).currentStage || "studio",
          printType: Array.isArray(job.technology) ? job.technology : ((job as any).printType || [])
        };

        await setDoc(publicDocRef, {
          ...job,
          ...queueMapping,
          fireId: currentFireId, // Zde to slouží jako odkaz zpět k tabuli
          lastUpdated: serverTimestamp()
        });
        console.log('Firebase PUBLIC SYNC (Unified ID + Mapping):', job.jobId);
      }
    } catch (e) {
      console.error('Chyba při ukládání do Firebase:', e);
    }
  };

  // Smazání zakázky z Firebase
  const deleteFromFirebase = async (jobId: string, orderId: string, fireId?: string) => {
    try {
      // 1. Smazat z BOARD kolekce
      if (fireId) {
        await deleteDoc(doc(db, BOARD_CARDS_COLLECTION, fireId));
        // S Unified ID strategií zkusíme smazat i z PUBLIC se stejným ID
        await deleteDoc(doc(db, PUBLIC_ORDERS_COLLECTION, fireId));
        console.log('Smazáno z obou kolekcí (Unified Doc ID):', fireId);
      } else {
        // Fallback pro staré verze
        const qb = query(collection(db, BOARD_CARDS_COLLECTION), where("jobId", "==", orderId || jobId));
        const sb = await getDocs(qb);
        sb.forEach(d => deleteDoc(d.ref));

        const qp = query(collection(db, PUBLIC_ORDERS_COLLECTION), where("jobId", "==", orderId || jobId));
        const sp = await getDocs(qp);
        sp.forEach(d => deleteDoc(d.ref));
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

      // CSS max z-index is ~2.1 billion. Cap timestamps to 1 billion.
      const newZIndex = Date.now() % 1000000000;
      if (job.zIndex === newZIndex) return prev;

      const updatedJob = { ...job, zIndex: newZIndex };
      saveToFirebase(updatedJob);
      return prev.map(j => j.id === id ? updatedJob : j);
    });
  };

  // Aktualizuje zakazka_id v emailech když se TEMP ID změní na reálné
  const updateEmailsJobId = async (oldJobId: string, newJobId: string) => {
    if (!oldJobId || !newJobId || oldJobId === newJobId) return;
    try {
      const { getDocs: _getDocs, updateDoc: _updateDoc, query: _query, collection: _collection, where: _where } = await import('firebase/firestore');
      const q = _query(_collection(db, EMAILS_COLLECTION), _where('zakazka_id', '==', oldJobId));
      const snapshot = await _getDocs(q);
      const updates = snapshot.docs.map(doc => _updateDoc(doc.ref, { zakazka_id: newJobId }));
      await Promise.all(updates);
      if (updates.length > 0) {
        console.log(`✉️ Přepojena ${updates.length} e-mailů: ${oldJobId} → ${newJobId}`);
      }
    } catch (e) {
      console.error('Chyba při přepojování e-mailů:', e);
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

          if (change.type === 'added') {
            if (index === -1) {
              newNotes.push({ ...data, id: change.doc.id });
            }
          }
          if (change.type === 'modified') {
            if (index !== -1) {
              newNotes[index] = { ...data, id: change.doc.id };
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

        changes.forEach(change => {
          const data = change.doc.data() as JobData;
          // Ignorujeme, pokud data nejsou validní JobData (např. chybí jobId nebo je to ghost ID)
          const checkId = (data.jobId || '').toLowerCase().trim();
          if (!checkId || checkId === '???' || checkId === 'id?' || checkId === 'null' || checkId === 'undefined' || checkId === 'nan') return;

          // Hledáme, zda už zakázku máme (podle interního Firestore ID)
          const index = newJobs.findIndex(j => j.fireId === change.doc.id);

          if (change.type === 'added') {
            if (index === -1) {
              // NOVÁ ZAKÁZKA (přišla z webhooku/jiného klienta)
              // Musíme zajistit, že má všechny potřebné fieldy pro UI
              const newJob: JobData = {
                ...data,
                fireId: change.doc.id,
                id: Math.random().toString(36).substring(2, 11), // Vygenerujeme lokální ID pro React key
                // Pokud chybí, doplníme defaulty
                status: data.status || JobStatus.INQUIRY,
                position: data.position || { x: 100, y: 100 },
                items: data.items || [],
                technology: data.technology || [],
                dateReceived: data.dateReceived || new Date().toISOString().split('T')[0],
                zIndex: data.zIndex || Date.now()
              };
              newJobs = [newJob, ...newJobs]; // Přidáme na začátek
              hasChanges = true;
              console.log('📥 Stažena nová zakázka z Firebase:', data.jobId || change.doc.id);
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
                newJobs[index] = { ...current, ...data, fireId: change.doc.id, isNew: current.isNew };
                hasChanges = true;
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

  const getNewJobPosition = () => {
    const ws = workspaceRef.current;
    const scrollX = ws ? ws.scrollLeft : 0;
    const scrollY = ws ? ws.scrollTop : 0;

    let x = scrollX + 60;
    let y = scrollY + 80;
    let hasCollision = true;
    let safetyCounter = 0;

    // Pokud narazíme na jinou zakázku na stejné / blízké pozici, posuneme doprava o šířku karty (cca 240px)
    while (hasCollision && safetyCounter < 50) {
      hasCollision = false;
      for (const job of jobs) {
        // Kontrolujeme překryv karet (karty jsou w-48 ~ 192px, použijeme buffer 210px)
        if (job.position && Math.abs(job.position.x - x) < 210 && Math.abs(job.position.y - y) < 210) {
          hasCollision = true;
          break;
        }
      }
      if (hasCollision) {
        x += 240;
        safetyCounter++;
      }
    }

    return { x, y };
  };

  const handleSmartGrouping = () => {
    // 1. Zjistíme distrikty všech EXPRES zakázek (Kotvy)
    const expressJobs = jobs.filter(j => j.status === JobStatus.EXPRESS && getDistrict(j.address));
    const expressDistricts = new Set(expressJobs.map(j => getDistrict(j.address)));

    if (expressDistricts.size === 0) {
      alert("Pro sdružení dle lokality je nutné mít alespoň jednu zakázku ve stavu EXPRES s platnou adresou v Praze.");
      return;
    }

    // Mapa: Distrikt -> [Seznam zakázek, které tam patří]
    const districtGroups: Record<string, JobData[]> = {};

    // 2. Najdeme všechny zakázky pro dané distrikty (mimo Expres samotných)
    //    Nebo zahrneme i ostatní Expres?
    //    Logika: "Přesunout k sobě". 
    //    Vezmeme hlavní Expres jako kotvu. Ostatní (i další Expres, i běžné) naskládáme k němu.

    jobs.forEach(job => {
      const dist = getDistrict(job.address);
      if (dist && expressDistricts.has(dist)) {
        if (!districtGroups[dist]) districtGroups[dist] = [];
        districtGroups[dist].push(job);
      }
    });

    let movedCount = 0;

    // 3. Pro každý distrikt provedeme přerovnání
    const newPositions = new Map<string, { x: number, y: number }>();

    Object.entries(districtGroups).forEach(([dist, group]) => {
      // Najdeme kotvu (první Expres zakázka v tomto distriktu)
      // Ideálně ta, co je nejvíc vlevo nahoře, nebo prostě první v poli?
      // Zkusíme najít tu, co má status EXPRESS. Pokud jich je víc, vezmeme první.
      const anchor = group.find(j => j.status === JobStatus.EXPRESS) || group[0];

      // Seřadíme zbytek skupiny (všechny kromě kotvy, nebo včetně?)
      // Chceme je naskládat kolem kotvy.
      // Uděláme grid pod kotvou.

      const others = group.filter(j => j.id !== anchor.id);

      if (others.length === 0) return;

      // Layout: Horizontálně DOPRAVA od kotvy, zarovnané na mřížku (40px)
      // Card width (w-48) ~ 192px. Gap ~ 48px -> Pitch = 240px (6 čtverečků mřížky)
      const startX = anchor.position.x + 240;
      const startY = anchor.position.y;
      const gapX = 240;
      const gapY = 240; // Řádkování pro "přelomení" (Wrap)
      const itemsPerRow = 5;

      others.forEach((job, index) => {
        const row = Math.floor(index / itemsPerRow);
        const col = index % itemsPerRow;

        newPositions.set(job.id, {
          x: startX + (col * gapX),
          y: startY + (row * gapY)
        });
        movedCount++;
      });
    });

    if (movedCount === 0) {
      alert("Nenalezeny žádné další zakázky k přeskupení.");
      return;
    }

    // --- COLLISION RESOLUTION ---
    // Musíme zajistit, aby na nových pozicích (newPositions) nebyly žádné jiné zakázky.

    const allMovedIds = new Set<string>();
    Object.values(districtGroups).forEach(group => group.forEach(j => allMovedIds.add(j.id)));

    // Iterativně řešíme kolize - "Push Down"

    const resolvedPositions = new Map(newPositions);

    jobs.forEach(job => {
      // Pokud je zakázka součástí přesouvané skupiny, ignorujeme (její pozice je už v resolvedPositions nebo je kotva)
      if (allMovedIds.has(job.id)) return;

      let currentPos = job.position;
      let hasCollision = true;
      let safetyCounter = 0;

      while (hasCollision && safetyCounter < 50) {
        hasCollision = false;

        // Koliduje s nějakou novou pozicí? (Distance check < 50px)
        for (const [movedId, newPos] of resolvedPositions.entries()) {
          if (Math.abs(currentPos.x - newPos.x) < 50 && Math.abs(currentPos.y - newPos.y) < 50) {
            hasCollision = true;
            break;
          }
        }

        if (hasCollision) {
          // Posunout dolů o jeden řádek (240px)
          currentPos = { ...currentPos, y: currentPos.y + 240 };
          safetyCounter++;
        }
      }

      if (safetyCounter > 0) {
        resolvedPositions.set(job.id, currentPos); // Uložíme novou odsunutou pozici
        movedCount++;
      }
    });

    setJobs(prev => prev.map(job => {
      if (resolvedPositions.has(job.id)) {
        return { ...job, position: resolvedPositions.get(job.id)! };
      }
      return job;
    }));

    alert(`Uspořádáno ${movedCount} zakázek (včetně odsunutí překážejících karet).`);
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
        return {
          ...job,
          position: {
            x: startX + col * stepX,
            y: startY + row * stepY
          }
        };
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
        if (movedJob) saveToFirebase({ ...movedJob, position: { x, y }, isNew: false });
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
      text: '',
      position: pos,
      zIndex: Date.now() % 1000000000
    };
    setNotes(prev => [...prev, newNote]);
    saveNoteToFirebase(newNote);
  };

  const handleUpdateNote = (id: string, text: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, text } : n));
    const note = notes.find(n => n.id === id);
    if (note) saveNoteToFirebase({ ...note, text });
  };

  const handleDeleteNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    deleteNoteFromFirebase(id);
  };

  const handleBringNoteToFront = (id: string) => {
    setNotes(prev => {
      const note = prev.find(n => n.id === id);
      if (!note) return prev;
      const newZIndex = Date.now() % 1000000000;
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
    setSelectedJob(newJob);
    setIsModalOpen(true);
  };

  const handleSaveJob = (data: JobData) => {
    // Pokud se mění z TEMP ID na reálné, přepojujeme emaily
    const previousJob = jobs.find(j => j.id === data.id);
    if (previousJob && previousJob.jobId !== data.jobId) {
      updateEmailsJobId(previousJob.jobId, data.jobId);
    }

    // 1. Lokální update (optimistický)
    setJobs(prev => {
      const exists = prev.find(j => j.id === data.id);
      if (exists) return prev.map(j => j.id === data.id ? { ...data, isNew: false } : j);
      return [{ ...data, isNew: true }, ...prev];
    });

    // 2. Uložení do Firebase (na pozadí)
    saveToFirebase(data);

    setIsModalOpen(false);
    setSelectedJob(null);
  };

  const handleDeleteJob = (id: string) => {
    if (confirm('Smazat zakázku? Smaže se i ze systému "Zakázka na cestě".')) {
      const jobToDelete = jobs.find(j => j.id === id);
      setJobs(prev => prev.filter(j => j.id !== id));
      if (jobToDelete) {
        deleteFromFirebase(id, jobToDelete.jobId || jobToDelete.id, jobToDelete.fireId);
      }
      setIsModalOpen(false);
      setSelectedJob(null);
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
      if (status === JobStatus.READY_FOR_PROD) {
        const jobToOpen = updated.find(j => j.id === id);
        if (jobToOpen) {
          const hasMissingTech = !jobToOpen.technology || jobToOpen.technology.length === 0;
          const hasMissingColors = jobToOpen.items.some(item => !item.colors || item.colors.trim() === '');

          if (hasMissingTech || hasMissingColors) {
            setSelectedJob(jobToOpen);
            setIsModalOpen(true);
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

    return (j.customer || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (j.jobName || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-purple-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
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
          <button onClick={handleSmartGrouping} title="Přesune vizuálně zakázky k Expres zakázkám stejného obvodu" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition-all">
            <FolderSync className="w-4 h-4 text-amber-400" />
            <span className="hidden lg:inline">Sdružit k Expresu</span>
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
        className="flex-1 relative overflow-auto bg-slate-950 p-10"
        style={{
          backgroundImage: 'radial-gradient(circle, #1e293b 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          minWidth: '2000px',
          minHeight: '2000px'
        }}
      >
        {filteredJobs.map(job => (
          <JobCard
            key={job.id}
            job={job}
            onClick={() => {
              bringToFront(job.id);
              setSelectedJob(job);
              setIsModalOpen(true);
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

      {isModalOpen && selectedJob && (
        <JobFormModal
          key={selectedJob.id}
          job={selectedJob}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveJob}
          onDelete={handleDeleteJob}
        />
      )}
    </div>
  );
};

export default App;
