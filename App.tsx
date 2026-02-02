
import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, Sparkles,
  Settings, Bot, X, Printer,
  Loader2, MapPin, Zap, Navigation,
  Layers, Maximize, Minimize, FolderSync, LogOut
} from 'lucide-react';
import { JobData, JobStatus, PrintItem } from './types';
import { INITIAL_JOBS } from './constants';
import JobCard from './components/JobCard';
import JobFormModal from './components/JobFormModal';
import { GoogleGenAI, Type } from '@google/genai';
import { onSnapshot, collection, query, addDoc, deleteDoc, getDocs, where, serverTimestamp, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth, db, PUBLIC_ORDERS_COLLECTION } from './firebase';
import LoginPage from './components/LoginPage';

const App: React.FC = () => {
  const [jobs, setJobs] = useState<JobData[]>(() => {
    const saved = localStorage.getItem('cml_jobs_v3');
    return saved ? JSON.parse(saved) : INITIAL_JOBS;
  });
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [manualApiKey, setManualApiKey] = useState(() => localStorage.getItem('cml_gemini_key') || '');
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const workspaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('cml_jobs_v3', JSON.stringify(jobs));
  }, [jobs]);

  useEffect(() => {
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



  // Smazání zakázky z Firebase
  const deleteFromFirebase = async (jobId: string, orderId: string) => {
    try {
      const q = query(collection(db, PUBLIC_ORDERS_COLLECTION), where("orderNumber", "==", orderId || jobId));
      const snaps = await getDocs(q);
      snaps.forEach((doc) => {
        deleteDoc(doc.ref);
      });
      console.log('Zakázka smazána z Firebase:', orderId);
    } catch (e) {
      console.error('Chyba při mazání z Firebase:', e);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // --- FIREBASE SYNC: Naslouchání změnám v "Zakázka na cestě" ---
  useEffect(() => {
    // Vytvoříme listener na celou kolekci 'orders'
    const q = query(collection(db, PUBLIC_ORDERS_COLLECTION));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Získáme mapu: orderNumber -> { currentStage, isCompleted }
      const trackingUpdates = new Map();

      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.orderNumber) {
          trackingUpdates.set(data.orderNumber, {
            stage: data.currentStage,
            isCompleted: data.isCompleted,
            isUrgent: data.isUrgent
          });
        }
      });

      // Aktualizujeme lokální stav jobs, pokud se něco změnilo
      setJobs(currentJobs => {
        let hasChanges = false;
        const updatedJobs = currentJobs.map(job => {
          const update = trackingUpdates.get(job.jobId); // Párujeme podle ID zakázky

          if (update) {
            // Kontrola změny - abychom nerenderovali zbytečně
            if (job.trackingStage !== update.stage ||
              (update.isCompleted && job.status !== JobStatus.COMPLETED) ||
              (!update.isCompleted && job.status === JobStatus.COMPLETED && job.isTracked) ||
              // Sync Urgent FROM Tracking TO Board
              (update.isUrgent && job.status !== JobStatus.EXPRESS && job.status !== JobStatus.COMPLETED) ||
              (!update.isUrgent && job.status === JobStatus.EXPRESS)) {

              hasChanges = true;

              let newStatus = job.status;

              // 1. Completion has highest priority
              if (update.isCompleted) {
                newStatus = JobStatus.COMPLETED;
              } else if (job.status === JobStatus.COMPLETED && !update.isCompleted) {
                // If uncoupled, revert to READY_FOR_PROD
                newStatus = JobStatus.READY_FOR_PROD;
              }
              // 2. Urgent sync (only if not completed)
              else if (update.isUrgent && job.status !== JobStatus.EXPRESS) {
                newStatus = JobStatus.EXPRESS;
              } else if (!update.isUrgent && job.status === JobStatus.EXPRESS) {
                // If urgency removed in tracking, revert to standard production
                newStatus = JobStatus.READY_FOR_PROD;
              }

              return {
                ...job,
                isTracked: true,
                trackingStage: update.stage,
                status: newStatus
              };
            }
          }
          return job;
        });

        return hasChanges ? updatedJobs : currentJobs;
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

  const handleAiImport = async () => {
    if (!aiText.trim()) return;
    setIsAnalyzing(true);

    // Pomocná funkce pro vyčištění dat od AI (převod "null", undefined atd. na prázdný řetězec)
    const sanitize = (val: any) => {
      if (val === null || val === undefined) return '';
      const s = String(val).trim();
      if (s.toLowerCase() === 'null') return '';
      return s;
    };

    try {
      const apiKey = manualApiKey || process.env.API_KEY;
      if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
        alert("Není nastaven API klíč. Prosím nastavte ho v nastavení (ozubené kolečko).");
        setIsSettingsOpen(true);
        setIsAnalyzing(false);
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Převeď následující text poptávky do strukturovaného JSON formátu pro tiskovou zakázku. 
DŮLEŽITÉ: 
1. Pro barevnost (colors) používej VŽDY technický zápis (např. '4/4', '4/0', '1/1', '1/0'). 
2. Do poznámek (generalNotes) NEPIŠ věci, které už jsou v jiných polích (např. nepiš "leták" nebo barevnost, pokud už je to v 'description' nebo 'colors'). Poznámka obsahuje jen unikátní doplňující info.
3. Pokud pro pole nemáš data, použij prázdný řetězec "", nikdy nevracej "null" nebo null.

Text poptávky: "${aiText}"`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              customer: { type: Type.STRING },
              jobName: { type: Type.STRING },
              generalNotes: { type: Type.STRING },
              address: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    description: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    size: { type: Type.STRING },
                    colors: { type: Type.STRING },
                    paperType: { type: Type.STRING },
                    paperWeight: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      if (response.text) {
        const data = JSON.parse(response.text);
        const newJob: JobData = {
          id: Math.random().toString(36).substring(2, 11),
          jobId: '',
          customer: sanitize(data.customer),
          jobName: sanitize(data.jobName),
          address: sanitize(data.address),
          dateReceived: new Date().toISOString().split('T')[0],
          deadline: '',
          technology: [],
          status: JobStatus.INQUIRY,
          position: { x: 150, y: 150 },
          items: (data.items || []).map((it: any) => ({
            id: Math.random().toString(36).substring(2, 11),
            description: sanitize(it.description),
            quantity: Number(it.quantity) || 0,
            size: sanitize(it.size),
            colors: sanitize(it.colors),
            techSpecs: '',
            stockFormat: '',
            paperType: sanitize(it.paperType),
            paperWeight: sanitize(it.paperWeight),
            itemsPerSheet: '',
            numberOfPages: 0
          })) || [],
          bindingType: '',
          laminationType: '',
          processing: '',
          cooperation: '',
          shippingNotes: '',
          generalNotes: sanitize(data.generalNotes),
          icon: 'FileText'
        };
        setJobs(prev => [newJob, ...prev]);
        setIsAiPanelOpen(false);
        setAiText('');
      }
    } catch (e) {
      alert('Chyba při AI analýze: ' + (e instanceof Error ? e.message : 'Neznámá chyba'));
    } finally {
      setIsAnalyzing(false);
    }
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
    const rawOffsetX = e.dataTransfer.getData('offsetX');
    const rawOffsetY = e.dataTransfer.getData('offsetY');

    if (!jobId || !rawOffsetX || !rawOffsetY) return;

    const offsetX = parseFloat(rawOffsetX);
    const offsetY = parseFloat(rawOffsetY);

    if (workspaceRef.current) {
      const rect = workspaceRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - offsetX;
      const y = e.clientY - rect.top - offsetY;
      setJobs(prev => prev.map(job => job.id === jobId ? { ...job, position: { x, y } } : job));
    }
  };

  const handleCreateJob = () => {
    const stepX = 200;
    const stepY = 260;
    const startX = 60;
    const startY = 80;
    const cols = Math.max(3, Math.floor((window.innerWidth - 100) / stepX));
    let pos = { x: 100, y: 100 };

    find_pos: for (let row = 0; row < 100; row++) {
      for (let col = 0; col < cols; col++) {
        const x = startX + col * stepX;
        const y = startY + row * stepY;
        if (!jobs.some(j => Math.abs(j.position.x - x) < 50 && Math.abs(j.position.y - y) < 50)) {
          pos = { x, y };
          break find_pos;
        }
      }
    }

    const newJob: JobData = {
      id: Math.random().toString(36).substring(2, 11),
      jobId: '', customer: '', jobName: '', address: '',
      dateReceived: new Date().toISOString().split('T')[0], deadline: '',
      technology: [], status: JobStatus.INQUIRY, position: pos,
      items: [{ id: Math.random().toString(36).substring(2, 11), description: '', quantity: 0, size: '', colors: '', techSpecs: '', stockFormat: '', paperType: '', paperWeight: '', itemsPerSheet: '', numberOfPages: 0 }],
      bindingType: '', laminationType: '', processing: '', cooperation: '', shippingNotes: '', generalNotes: '', icon: 'FileText'
    };
    setSelectedJob(newJob);
    setIsModalOpen(true);
  };

  const handleSaveJob = (data: JobData) => {
    setJobs(prev => {
      const exists = prev.find(j => j.id === data.id);
      if (exists) return prev.map(j => j.id === data.id ? data : j);
      return [data, ...prev];
    });
    setIsModalOpen(false);
    setSelectedJob(null);

    // Pokud je to nová zakázka (není v prev), mohli bychom ji chtít poslat do Firebase
    // Ale handleSaveJob se volá i při editaci.
    // Pro jednoduchost: Pokud zakázka ještě "nebyla trackovaná" (nemá trackingStage), pošleme ji tam?
    // Nebo raději jen při handleCreateJob? -> Uděláme to chytřeji:
    // Pokud uživatel vytvoří novou zakázku ručně, 'handleCreateJob' jen otevře modal.
    // Teprve tady 'handleSaveJob' ji reálně uloží.
    // Takže musíme zjistit, jestli jde o create nebo update.

    // Zjednodušení: Pokud ID nexistuje v předchozím stavu jobs -> je to nová zakázka -> šup do Firebase
    // ALE `setJobs` používá callback, takže k `prev` se tady nedostaneme snadno outside.
    // Využijeme fakt, že `selectedJob` měl nějaká data při otevření.
    // Pokud editujeme existující, `selectedJob` byl v `jobs`.

    // Kontrola existence v aktuálním `jobs` state před update
    const isNew = !jobs.find(j => j.id === data.id);

  };

  const handleDeleteJob = (id: string) => {
    if (confirm('Smazat zakázku? Smaže se i ze systému "Zakázka na cestě".')) {
      const jobToDelete = jobs.find(j => j.id === id);
      setJobs(prev => prev.filter(j => j.id !== id));
      if (jobToDelete) {
        deleteFromFirebase(id, jobToDelete.jobId || jobToDelete.id);
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
          setSelectedJob(jobToOpen);
          setIsModalOpen(true);
        }
      }
      return updated;
    });
  };

  const filteredJobs = jobs.filter(j =>
    j.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
    j.jobName.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            <h1 className="text-xl font-black text-white tracking-tighter uppercase">CML BOARD</h1>
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
          <button onClick={handleAutoArrange} title="Seskupí zakázky ve stejných rajónech jako jsou ty expresní" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition-all"><MapPin className="w-4 h-4 text-emerald-400" /> <span className="hidden lg:inline">Rajóny Expresu</span></button>
          <button onClick={() => setIsAiPanelOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700"><Bot className="w-4 h-4 text-purple-400" /> <span className="hidden lg:inline">AI Import</span></button>
          <button onClick={handleCreateJob} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black shadow-lg shadow-purple-900/40 active:scale-95 transition-all"><Plus className="w-4 h-4" /> NOVÁ ZAKÁZKA</button>
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
            onClick={() => { setSelectedJob(job); setIsModalOpen(true); }}
            onDelete={handleDeleteJob}
            onStatusChange={handleStatusChangeOnBoard}
          />
        ))}
      </main>

      {isAiPanelOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[2000] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-xl shadow-2xl">
            <h3 className="text-xl font-bold flex items-center gap-3 mb-6"><Sparkles className="w-6 h-6 text-purple-400" /> AI Import</h3>
            <textarea className="w-full h-56 bg-slate-800 border border-slate-700 rounded-2xl p-5 text-sm text-slate-200 focus:ring-2 focus:ring-purple-500 outline-none resize-none" placeholder="Vložte text poptávky..." value={aiText} onChange={(e) => setAiText(e.target.value)} />
            <div className="flex justify-end gap-4 mt-8">
              <button onClick={() => setIsAiPanelOpen(false)} className="px-6 py-2.5 text-sm font-bold text-slate-500">ZRUŠIT</button>
              <button
                onClick={handleAiImport}
                disabled={!aiText.trim() || isAnalyzing}
                className="px-8 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-black disabled:opacity-50 flex items-center gap-2"
              >
                {isAnalyzing && <Loader2 className="w-4 h-4 animate-spin" />}
                IMPORT
              </button>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[2000] flex items-center justify-center p-4">
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

            <div className="flex justify-end mt-10">
              <button onClick={() => setIsSettingsOpen(false)} className="px-10 py-3 bg-purple-600 text-white rounded-xl text-sm font-black shadow-lg hover:bg-purple-500 active:scale-95 transition-all">HOTOVO</button>
            </div>
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
