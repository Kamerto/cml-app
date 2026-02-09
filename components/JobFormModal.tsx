
import React, { useState, useRef, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  X, Save, Printer, Trash2, Plus,
  Hash, MapPin, ChevronRight,
  Calendar, Building, FileText, Cpu, Sparkles, Bot, Loader2,
  CheckCircle2, List, Zap, Map, Settings, Wand2, Merge,
  Maximize, Layers, Scissors, Truck, Mail
} from 'lucide-react';
import { JobData, PrintItem, JobStatus, JobEmail } from '../types';
import { PAPER_TYPES, BINDING_TYPES, LAMINA_TYPES, COLUMNS } from '../constants';
import { GoogleGenAI, Type } from '@google/genai';

interface JobFormModalProps {
  job: JobData;
  onClose: () => void;
  onSave: (data: JobData) => void;
  onDelete: (id: string) => void;
}

const SUGGESTIONS = {
  itemType: ['Vizitky', 'Letáky', 'Plakáty', 'Katalogy', 'Brožury', 'Samolepky', 'Pozvánky', 'Pohlednice', 'Bloky', 'Desky', 'Roll-up', 'Banner', 'Kalendáře', 'Knihy', 'PFka'],
  size: ['SRA3', 'A3', 'A4', 'A5', 'A6', '90x50', '85x55', 'DL'],
  colors: ['4/4', '4/0', '1/1', '1/0', '4/1', '5/0'],
  paper: PAPER_TYPES,
  weight: ['80g', '90g', '115g', '135g', '170g', '250g', '300g', '350g'],
  binding: BINDING_TYPES,
  lamination: LAMINA_TYPES,
  processing: ['Ořez', 'Lepení', 'Číslování', 'Bigování', 'Skládání', 'Děrování', 'Perforace'],
  cooperation: ['Výsek', 'Parciální lak', 'Zlatoražba', 'Stříbroražba', 'Slepotisk', 'Gravírování', 'Číslování', 'Děrování']
};

const isFieldEmpty = (value: any) => {
  if (value === '' || value === null || value === undefined || value === 0) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'string' && value.toLowerCase() === 'null') return true;
  return false;
};

const getFieldStyle = (value: any) => {
  return isFieldEmpty(value)
    ? 'bg-amber-900/30 border-amber-500/20 text-amber-100 placeholder:text-amber-500/30 shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)]'
    : 'bg-slate-900 border-slate-700 text-slate-200';
};

const getIconStyle = (value: any) => {
  return isFieldEmpty(value)
    ? 'text-amber-500/60'
    : 'text-purple-400';
};

// Component for auto-expanding textarea
const AutoExpandingTextarea: React.FC<{
  value: string;
  onChange: (val: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  minRows?: number;
}> = ({ value, onChange, onFocus, onBlur, placeholder, className, minRows = 1 }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      className={`${className} overflow-hidden resize-none`}
      rows={minRows}
    />
  );
};

const SuggestionInput: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  columns?: number;
  icon?: React.ReactNode;
  dropDirection?: 'up' | 'down';
  multiline?: boolean;
}> = ({ label, value, onChange, suggestions, placeholder, className, columns = 2, icon, dropDirection = 'up', multiline = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentValues = (value || '').split(', ').map(v => v.trim()).filter(Boolean);

  const toggleValue = (s: string) => {
    if (currentValues.includes(s)) {
      onChange(currentValues.filter(v => v !== s).join(', '));
    } else {
      onChange([...currentValues, s].join(', '));
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 flex justify-between items-center tracking-wider">
        <span className="flex items-center gap-1.5">
          {icon && <span className={getIconStyle(value)}>{icon}</span>}
          {label}
        </span>
        <button type="button" onClick={() => setIsOpen(!isOpen)} className="text-slate-600 hover:text-purple-400 transition-colors">
          <List className="w-3.5 h-3.5" />
        </button>
      </label>

      {multiline ? (
        <AutoExpandingTextarea
          value={value || ''}
          onChange={onChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder || '---'}
          className={`w-full border rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-purple-500 outline-none transition-all ${getFieldStyle(value)} min-h-[44px]`}
        />
      ) : (
        <input
          type="text"
          className={`w-full border rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-purple-500 outline-none transition-all ${getFieldStyle(value)} h-[44px]`}
          value={value || ''}
          placeholder={placeholder || '---'}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
        />
      )}

      {isOpen && (suggestions.length > 0) && (
        <div
          className={`absolute z-50 ${dropDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'} w-full bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-2 grid gap-1 animate-in fade-in slide-in-from-${dropDirection === 'up' ? 'bottom' : 'top'}-2`}
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {suggestions.map(s => {
            const isSelected = currentValues.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleValue(s)}
                className={`text-[11px] font-bold text-left px-3 py-2 rounded-lg transition-all truncate ${isSelected
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'hover:bg-slate-700 text-slate-300 hover:text-white'
                  }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const JobFormModal: React.FC<JobFormModalProps> = ({ job, onClose, onSave, onDelete }) => {
  const [formData, setFormData] = useState<JobData>(() => ({
    ...job,
    jobId: job.jobId || '',
    customer: job.customer || '',
    jobName: job.jobName || '',
    address: job.address || '',
    generalNotes: job.generalNotes || '',
    bindingType: job.bindingType || '',
    laminationType: job.laminationType || '',
    processing: job.processing || '',
    cooperation: job.cooperation || '',
    shippingNotes: job.shippingNotes || '',
    items: (job.items || []).map(item => ({
      ...item,
      description: item.description || '',
      quantity: item.quantity || 0,
      size: item.size || '',
      colors: item.colors || '',
      techSpecs: item.techSpecs || '',
      paperType: item.paperType || '',
      paperWeight: item.paperWeight || '',
      numberOfPages: item.numberOfPages || 0
    })),
    technology: Array.isArray(job.technology) ? job.technology : [job.technology].filter(Boolean) as ('DIGI' | 'OFSET')[]
  }));

  const [activeTab, setActiveTab] = useState<'details' | 'production'>(
    (job.status === JobStatus.PRODUCTION || job.status === JobStatus.EXPRESS || job.status === JobStatus.READY_FOR_PROD) ? 'production' : 'details'
  );

  const [isAiFilling, setIsAiFilling] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [showAiInput, setShowAiInput] = useState(false);
  const [itemAiInputId, setItemAiInputId] = useState<string | null>(null);
  const [itemAiText, setItemAiText] = useState('');
  const [showPrintEdit, setShowPrintEdit] = useState(false);
  const [extraPrintNote, setExtraPrintNote] = useState('');
  const [relatedEmails, setRelatedEmails] = useState<JobEmail[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);

  useEffect(() => {
    if (!formData.jobId || activeTab !== 'details') return;

    setLoadingEmails(true);
    const emailsQuery = query(
      collection(db, 'zakazka_emails'),
      where('zakazka_id', '==', formData.jobId),
      orderBy('created_at', 'desc')
    );

    const unsubscribe = onSnapshot(emailsQuery, (snapshot) => {
      const emails: JobEmail[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as JobEmail));
      setRelatedEmails(emails);
      setLoadingEmails(false);
    }, (error) => {
      console.error('Error listening to emails:', error);
      setLoadingEmails(false);
    });

    return () => unsubscribe();
  }, [formData.jobId, activeTab]);

  const updateItem = (id: string, field: keyof PrintItem, val: any) => {
    setFormData(prev => ({ ...prev, items: prev.items.map(i => i.id === id ? { ...i, [field]: val } : i) }));
  };

  const addItem = () => {
    const newItem: PrintItem = {
      id: Math.random().toString(36).substring(2, 11),
      description: '',
      quantity: 0,
      size: '',
      colors: '',
      techSpecs: '',
      stockFormat: '',
      paperType: '',
      paperWeight: '',
      itemsPerSheet: '',
      numberOfPages: 0
    };
    setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
  };

  const removeItem = (id: string) => {
    if (formData.items.length > 1) {
      setFormData(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));
    }
  };

  const handleMergeItems = (criteria: 'all' | 'format' | 'quantity') => {
    const groups: Record<string, PrintItem[]> = {};
    formData.items.forEach(item => {
      let key = '';
      if (criteria === 'all') {
        key = `${item.paperType}-${item.paperWeight}-${item.size}-${item.colors}`.toLowerCase();
      } else if (criteria === 'format') {
        key = `${item.size}`.toLowerCase();
      } else if (criteria === 'quantity') {
        key = `${item.quantity}`;
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    const mergedItems: PrintItem[] = Object.values(groups).map(group => {
      if (group.length === 1) return group[0];
      const first = group[0];
      const totalQuantity = group.reduce((sum, it) => sum + (it.quantity || 0), 0);
      const combinedDescription = group.map(it => `${it.description || 'Položka'} (${it.quantity}ks)`).join('\n');
      const combinedSpecs = group.map(it => it.techSpecs).filter(Boolean).join('\n');
      return { ...first, description: combinedDescription, quantity: totalQuantity, techSpecs: combinedSpecs };
    });
    setFormData(prev => ({ ...prev, items: mergedItems }));
  };

  const toggleTechnology = (tech: 'DIGI' | 'OFSET') => {
    setFormData(prev => {
      const current = prev.technology || [];
      const updated = current.includes(tech) ? current.filter(t => t !== tech) : [...current, tech];
      return { ...prev, technology: updated };
    });
  };

  const handleStatusChange = (status: JobStatus) => {
    setFormData(prev => ({ ...prev, status }));
    if (status === JobStatus.INQUIRY) {
      setActiveTab('details');
    } else {
      setActiveTab('production');
    }
  };

  const handleOpenMaps = () => {
    if (formData.address) window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formData.address)}`, '_blank');
  };

  const handleAiFillTech = async () => {
    if (!aiInput) return;
    setIsAiFilling(true);

    const sanitize = (val: any) => {
      if (val === null || val === undefined) return '';
      const s = String(val).trim();
      if (s.toLowerCase() === 'null') return '';
      return s;
    };

    try {
      const apiKey = localStorage.getItem('cml_gemini_key') || import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
        alert("Není nastaven API klíč. Prosím nastavte ho v hlavním nastavení Tabule (ikona ozubeného kočko v záhlaví).");
        setIsAiFilling(false);
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analýza technické části poptávky. 
DŮLEŽITÉ: 
1. Pro barevnost (colors) používej VŽDY technický zápis (např. '4/4', '4/0'). 
2. Do poznámek (techSpecs) NEPIŠ věci, které už jsou v jiných polích (např. nepiš název tiskoviny nebo barevnost, pokud už je to v 'description' nebo 'colors'). Poznámka obsahuje JEN doplňující instrukce.
3. Pokud pro pole nemáš data, použij prázdný řetězec "", nikdy nevracej "null" nebo null.

Text: "${aiInput}"`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              bindingType: { type: Type.STRING },
              laminationType: { type: Type.STRING },
              cooperation: { type: Type.STRING },
              processing: { type: Type.STRING },
              address: { type: Type.STRING },
              shippingNotes: { type: Type.STRING },
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
                    paperWeight: { type: Type.STRING },
                    techSpecs: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });
      if (response.text) {
        const parsed = JSON.parse(response.text);

        const sanitizedData: any = {
          bindingType: sanitize(parsed.bindingType),
          laminationType: sanitize(parsed.laminationType),
          cooperation: sanitize(parsed.cooperation),
          processing: sanitize(parsed.processing),
          address: sanitize(parsed.address),
          shippingNotes: sanitize(parsed.shippingNotes)
        };

        if (parsed.items && Array.isArray(parsed.items)) {
          sanitizedData.items = parsed.items.map((it: any) => ({
            id: Math.random().toString(36).substring(2, 11),
            description: sanitize(it.description),
            quantity: Number(it.quantity) || 0,
            size: sanitize(it.size),
            colors: sanitize(it.colors),
            paperType: sanitize(it.paperType),
            paperWeight: sanitize(it.paperWeight),
            techSpecs: sanitize(it.techSpecs)
          }));
        }

        setFormData(prev => ({ ...prev, ...sanitizedData }));
        setShowAiInput(false);
      }
    } catch (e) { alert('Chyba AI.'); } finally { setIsAiFilling(false); }
  };

  const handleAiFillSingleItem = async (itemId: string) => {
    if (!itemAiText.trim()) return;
    setIsAiFilling(true);

    const sanitize = (val: any) => {
      if (val === null || val === undefined) return '';
      const s = String(val).trim();
      if (s.toLowerCase() === 'null') return '';
      return s;
    };

    try {
      const apiKey = localStorage.getItem('cml_gemini_key') || import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
        alert("Není nastaven API klíč. Prosím nastavte ho v hlavním nastavení Tabule.");
        setIsAiFilling(false);
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyzuj tento text a extrahuj specifikaci JEDNÉ tiskové položky do JSON. 
DŮLEŽITÉ: 
1. Pro barevnost (colors) používej VŽDY technický zápis (např. '4/4', '4/0'). 
2. Do poznámek (techSpecs) NEPIŠ věci, které už jsou v jiných polích. 
3. Pokud pro pole nemáš data, použij prázdný řetězec "", nikdy nevracej "null" nebo null.

Text: "${itemAiText}"`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              size: { type: Type.STRING },
              colors: { type: Type.STRING },
              paperType: { type: Type.STRING },
              paperWeight: { type: Type.STRING },
              techSpecs: { type: Type.STRING },
              numberOfPages: { type: Type.NUMBER }
            }
          }
        }
      });

      if (response.text) {
        const data = JSON.parse(response.text);
        setFormData(prev => ({
          ...prev,
          items: prev.items.map(it => it.id === itemId ? {
            ...it,
            description: sanitize(data.description),
            quantity: Number(data.quantity) || 0,
            size: sanitize(data.size),
            colors: sanitize(data.colors),
            paperType: sanitize(data.paperType),
            paperWeight: sanitize(data.paperWeight),
            techSpecs: sanitize(data.techSpecs),
            numberOfPages: Number(data.numberOfPages) || 0
          } : it)
        }));
        setItemAiInputId(null);
        setItemAiText('');
      }
    } catch (e) {
      alert('Chyba AI při analýze položky.');
    } finally {
      setIsAiFilling(false);
    }
  };

  const handleOpenInPytlik = () => {
    // Namapování dat z CML na formát AI Pytlíku (všechna pole dle getInitialData)
    const pytlikData = {
      id: Math.random().toString(),
      jobId: formData.jobId || '',
      customer: formData.customer || '',
      jobName: formData.jobName || '',
      dateReceived: new Date().toLocaleDateString('cs-CZ'),
      deadline: formData.deadline || '',
      technology: formData.technology && formData.technology.length > 0 ? (formData.technology[0].includes('OFSET') ? 'OFSET' : 'DIGI') : 'DIGI',
      items: formData.items.map(item => ({
        id: Math.random().toString(),
        description: item.description || '',
        quantity: Number(item.quantity) || 0,
        size: item.size || '',
        colors: item.colors || '',
        techSpecs: item.techSpecs || '',
        stockFormat: item.stockFormat || '',
        paperType: item.paperType || '',
        paperWeight: item.paperWeight || '',
        numberOfPages: item.numberOfPages || '',
        paperSplit: false,
        stickerType: '',
        stickerKind: '',
        netToNet: false,
        itemsPerSheet: '',
        extras: '',
        isSelected: false
      })),
      bindingType: formData.bindingType || '',
      bindingOther: '',
      laminationType: formData.laminationType || '',
      laminationSides: '',
      laminationOther: '',
      finishingType: formData.processing || '',
      finishingOther: '',
      shippingNotes: formData.shippingNotes || '',
      cooperationNotes: formData.cooperation || '',
      addressNotes: formData.address || ''
    };

    // Zakódujeme pomocí Base64 pro maximální spolehlivost při přenosu v URL
    const jsonStr = JSON.stringify(pytlikData);
    const encodedData = btoa(unescape(encodeURIComponent(jsonStr)));

    const pytlikUrl = `https://el-pytlik.vercel.app/?jobData=${encodedData}`;

    window.open(pytlikUrl, '_blank');
  };

  const handleResetForm = () => {
    if (confirm('Opravdu chcete vymazat všechna pole v tomto formuláři? Tato akce je nevratná.')) {
      setFormData({
        ...formData,
        jobId: '',
        customer: '',
        jobName: '',
        address: '',
        deadline: '',
        technology: [],
        items: [{
          id: Math.random().toString(36).substring(2, 11),
          description: '',
          quantity: 0,
          size: '',
          colors: '',
          techSpecs: '',
          stockFormat: '',
          paperType: '',
          paperWeight: '',
          itemsPerSheet: '',
          numberOfPages: 0
        }],
        bindingType: '',
        laminationType: '',
        processing: '',
        cooperation: '',
        shippingNotes: '',
        generalNotes: '',
        tags: []
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[3000] flex items-center justify-center p-4 print:p-0 print:bg-white print:block">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 print:hidden">
        <header className="bg-slate-800 border-b border-slate-700 px-8 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-xl border border-slate-700">
              <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">CML Bag 2.1</span>
            </div>
            <div className="flex flex-col">
              <h2 className={`font-black text-xl truncate max-w-[180px] md:max-w-md leading-none tracking-tight ${!formData.customer ? 'text-amber-500 italic' : 'text-slate-100'}`}>
                {formData.customer || 'Klient není zadán!'}
              </h2>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`text-xs font-bold ${!formData.jobName ? 'text-amber-600/70' : 'text-slate-500'}`}>
                  {formData.jobName || 'Název zakázky chybí...'}
                </span>
                {formData.jobId && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(formData.jobId);
                      alert('ID zkopírováno: ' + formData.jobId);
                    }}
                    className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-700/50 hover:bg-purple-500/20 text-slate-400 hover:text-purple-300 rounded text-[10px] font-mono transition-colors border border-slate-700 hover:border-purple-500/30"
                    title="Kliknutím zkopírujete ID pro Outlook"
                  >
                    <Hash className="w-3 h-3" />
                    {formData.jobId}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleResetForm} className="flex items-center gap-2.5 px-6 py-3 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white rounded-2xl text-[10px] font-black border border-red-500/30 active:scale-95 transition-all">
              <Trash2 className="w-4 h-4" /> VYMAZAT FORMULÁŘ
            </button>
            <button onClick={() => onSave(formData)} className="flex items-center gap-2.5 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-xs font-black shadow-xl shadow-purple-950/40 active:scale-95 transition-all">
              <Save className="w-4.5 h-4.5" /> <span className="hidden md:inline">ULOŽIT DO TABULE</span><span className="md:hidden">ULOŽIT</span>
            </button>
            <div className="flex items-center gap-2 ml-1 border-l border-slate-700/50 pl-4">
              <button onClick={() => onDelete(formData.id)} className="p-2.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-colors"><Trash2 className="w-5 h-5" /></button>
              <button onClick={onClose} className="p-2.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded-xl transition-colors"><X className="w-7 h-7" /></button>
            </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <aside className="w-60 bg-slate-900/50 border-r border-slate-800/80 p-5 space-y-3 shrink-0 overflow-y-auto">
            <div className="text-[10px] font-black text-slate-600 uppercase mb-4 px-3 tracking-widest">Fáze zakázky</div>
            {COLUMNS.map(col => {
              const isActive = formData.status === col.id;
              let customStyle: React.CSSProperties = {};

              if (isActive && col.id === JobStatus.READY_FOR_PROD) {
                const hasOfset = formData.technology?.includes('OFSET');
                const hasDigi = formData.technology?.includes('DIGI');

                if (hasOfset && hasDigi) {
                  customStyle = { background: 'linear-gradient(to right, #f97316, #0ea5e9)' };
                } else if (hasOfset) {
                  customStyle = { backgroundColor: '#f97316' };
                } else if (hasDigi) {
                  customStyle = { backgroundColor: '#0ea5e9' };
                }
              }

              return (
                <button
                  key={col.id}
                  onClick={() => handleStatusChange(col.id)}
                  className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl text-sm font-black transition-all border-2 ${isActive
                    ? `${customStyle.background || customStyle.backgroundColor ? '' : col.color} border-white text-white shadow-lg`
                    : `bg-slate-800/40 border-transparent text-slate-500 hover:bg-slate-800 hover:text-slate-300`
                    }`}
                  style={customStyle}
                >
                  {isActive ? <CheckCircle2 className="w-4.5 h-4.5" /> : <FileText className="w-4.5 h-4.5 opacity-40" />}
                  {col.title}
                </button>
              );
            })}

          </aside>

          <div className="flex-1 overflow-y-auto p-10 bg-slate-900/30 custom-scrollbar">
            {activeTab === 'details' ? (
              <div className="max-w-3xl space-y-8 animate-in fade-in slide-in-from-left-4">

                {/* ID ZAKÁZKY - PŘESUNUTO SEM PRO VIDITELNOST */}
                <div className="p-5 bg-slate-800/50 border border-slate-700/50 rounded-2xl flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 flex items-center gap-2 tracking-widest">
                      <Hash className={`w-3.5 h-3.5 text-purple-400`} /> Číslo zakázky (ID) - pro Outlook
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-2 text-sm font-mono font-bold text-slate-300 focus:ring-0 cursor-copy"
                        value={formData.jobId || 'Bude vygenerováno po uložení...'}
                        onClick={(e) => {
                          if (formData.jobId) {
                            navigator.clipboard.writeText(formData.jobId);
                            (e.target as HTMLInputElement).select();
                          }
                        }}
                        placeholder="OUT-XXXX..."
                      />
                      {formData.jobId && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(formData.jobId);
                            alert('Zkopírováno!');
                          }}
                          className="px-4 py-2 bg-purple-600/20 hover:bg-purple-600 text-purple-400 hover:text-white rounded-xl text-xs font-black transition-all border border-purple-500/30"
                        >
                          KOPIROVAT
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1.5 ml-1">
                      Toto ID zadejte do Outlook makra pro přiřazení e-mailu.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-600 uppercase mb-3 flex items-center gap-2 tracking-widest">
                    <Building className={`w-4 h-4 transition-all duration-300 ${getIconStyle(formData.customer)}`} /> Zákazník / Firma
                  </label>
                  <input
                    type="text"
                    className={`w-full border rounded-2xl px-7 py-5 text-2xl font-black focus:ring-4 focus:ring-purple-500/20 outline-none transition-all ${getFieldStyle(formData.customer)}`}
                    value={formData.customer || ''}
                    onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                    placeholder="KDO TO OBJEDNÁVÁ?..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-600 uppercase mb-3 flex items-center gap-2 tracking-widest">
                    <FileText className={`w-4 h-4 transition-all duration-300 ${getIconStyle(formData.jobName)}`} /> Název zakázky
                  </label>
                  <input
                    type="text"
                    className={`w-full border rounded-2xl px-7 py-5 text-xl font-bold focus:ring-4 focus:ring-purple-500/20 outline-none transition-all ${getFieldStyle(formData.jobName)}`}
                    value={formData.jobName || ''}
                    onChange={(e) => setFormData({ ...formData, jobName: e.target.value })}
                    placeholder="CO SE BUDE TISKNOUT?..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-600 uppercase mb-3 flex items-center gap-2 tracking-widest">
                    <Sparkles className={`w-4 h-4 transition-all duration-300 ${getIconStyle(formData.generalNotes)}`} /> Interní poznámky k zakázce
                  </label>
                  <AutoExpandingTextarea
                    minRows={6}
                    className={`w-full border rounded-2xl px-7 py-5 text-base font-medium focus:ring-4 focus:ring-purple-500/20 outline-none transition-all ${getFieldStyle(formData.generalNotes)}`}
                    value={formData.generalNotes || ''}
                    onChange={(val) => setFormData({ ...formData, generalNotes: val })}
                    placeholder="Doplňující informace pro kolegy..."
                  />
                </div>

                {/* Související e-maily section */}
                <div className="mt-8 border-t border-slate-800/50 pt-8">
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-xs font-black text-slate-600 uppercase flex items-center gap-2 tracking-widest">
                      <Mail className="w-4 h-4 text-purple-400" /> Související e-maily
                    </label>
                    {loadingEmails && (
                      <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        AKTUALIZUJI...
                      </div>
                    )}
                  </div>

                  {relatedEmails.length > 0 ? (
                    <div className="space-y-3">
                      {relatedEmails.map(email => (
                        <div
                          key={email.id}
                          className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 hover:bg-slate-800/70 transition-all group animate-in slide-in-from-top-2"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Mail className="w-4 h-4 text-purple-400 shrink-0" />
                                <h4 className="text-sm font-bold text-slate-200 truncate">{email.subject}</h4>
                              </div>
                              {email.preview && (
                                <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">{email.preview}</p>
                              )}
                              <p className="text-[10px] text-slate-600 mt-2 font-mono">
                                {new Date(email.created_at).toLocaleString('cs-CZ')}
                              </p>
                            </div>
                            <a
                              href={`outlook:${email.entry_id}`}
                              className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white rounded-xl text-xs font-black transition-all shrink-0 border border-blue-500/20 active:scale-95 shadow-lg shadow-blue-900/10"
                              title="Otevřít v Outlooku (Desktop)"
                              onClick={(e) => {
                                // Prevent default handling if needed, or add logic
                                // Pro web to nefunguje, ale pro desktop ano.
                              }}
                            >
                              <Mail className="w-3.5 h-3.5" />
                              OTEVŘÍT
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-slate-800/20 border-2 border-dashed border-slate-700/50 rounded-2xl p-8 text-center">
                      <Mail className="w-10 h-10 text-slate-700 mx-auto mb-3 opacity-50" />
                      <p className="text-sm font-bold text-slate-500">Žádné propojené e-maily</p>
                      <p className="text-[11px] text-slate-600 mt-1 max-w-[240px] mx-auto">
                        Tato sekce se automaticky zaktualizuje, jakmile na zakázku pošlete e-mail z Outlooku.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-10 pb-12 animate-in fade-in slide-in-from-right-4">
                <div className="grid grid-cols-2 gap-8 p-7 bg-slate-800/30 border border-slate-700/50 rounded-3xl shadow-inner">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 flex items-center gap-2 tracking-widest">
                      <Hash className={`w-3.5 h-3.5 ${getIconStyle(formData.jobId)}`} /> Číslo zakázky (ID)
                    </label>
                    <input
                      type="text"
                      className={`w-full border rounded-xl px-5 py-3 text-sm font-bold focus:ring-2 focus:ring-purple-500 transition-all ${getFieldStyle(formData.jobId)}`}
                      value={formData.jobId || ''}
                      onChange={(e) => setFormData({ ...formData, jobId: e.target.value })}
                      placeholder="Např. 2024-001"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 flex items-center gap-2 tracking-widest">
                      <Calendar className={`w-3.5 h-3.5 ${getIconStyle(formData.deadline)}`} /> Požadovaný termín
                    </label>
                    <input
                      type="date"
                      className={`w-full border rounded-xl px-5 py-3 text-sm font-bold focus:ring-2 focus:ring-purple-500 outline-none transition-all ${getFieldStyle(formData.deadline)}`}
                      value={formData.deadline || ''}
                      onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-3 flex items-center gap-2 tracking-widest">
                      <Cpu className={`w-4 h-4 ${getIconStyle(formData.technology)}`} /> Způsob výroby (Technologie)
                    </label>
                    <div className={`flex gap-2.5 max-w-sm p-1.5 rounded-2xl transition-all ${formData.technology.length === 0 ? 'bg-amber-500/10 border border-dashed border-amber-500/30 shadow-lg shadow-amber-950/20' : 'bg-slate-800 border border-slate-700'}`}>
                      {['OFSET', 'DIGI'].map((tech: any) => (
                        <button key={tech} onClick={() => toggleTechnology(tech)} className={`flex-1 px-5 py-3 rounded-xl font-black border-2 transition-all text-xs tracking-tighter ${formData.technology?.includes(tech) ? (tech === 'DIGI' ? 'bg-sky-500 border-sky-300 text-white shadow-lg' : 'bg-orange-600 border-orange-400 text-white shadow-lg') : 'bg-slate-800 border-slate-700 text-slate-600 hover:border-slate-600'}`}>
                          {tech}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => handleMergeItems('all')} disabled={formData.items.length < 2} className="flex items-center gap-2.5 text-[9px] font-black uppercase text-amber-500 bg-amber-500/5 px-4 py-2.5 rounded-xl border border-amber-500/20 hover:bg-amber-500/10 transition-all disabled:opacity-20" title="Sdruží položky se stejným papírem, formátem i barevností"><Merge className="w-3.5 h-3.5" /> Sdružit vše</button>
                    <button onClick={() => handleMergeItems('format')} disabled={formData.items.length < 2} className="flex items-center gap-2.5 text-[9px] font-black uppercase text-amber-500 bg-amber-500/5 px-4 py-2.5 rounded-xl border border-amber-500/20 hover:bg-amber-500/10 transition-all disabled:opacity-20" title="Sdruží položky se stejným formátem"><Maximize className="w-3.5 h-3.5" /> Dle formátu</button>
                    <button onClick={() => handleMergeItems('quantity')} disabled={formData.items.length < 2} className="flex items-center gap-2.5 text-[9px] font-black uppercase text-amber-500 bg-amber-500/5 px-4 py-2.5 rounded-xl border border-amber-500/20 hover:bg-amber-500/10 transition-all disabled:opacity-20" title="Sdruží položky se stejným nákladem"><Zap className="w-3.5 h-3.5" /> Dle nákladu</button>
                    <div className="w-px h-6 bg-slate-700 mx-1 hidden lg:block"></div>
                    <button onClick={() => setShowAiInput(!showAiInput)} className="flex items-center gap-2.5 text-[9px] font-black uppercase text-amber-500 bg-amber-500/5 px-4 py-2.5 rounded-xl border border-amber-500/20 hover:bg-amber-500/10 transition-all"><Sparkles className="w-3.5 h-3.5" /> AI Pomocník</button>
                    <button onClick={addItem} className="flex items-center gap-2.5 text-[9px] font-black uppercase text-purple-400 bg-purple-400/5 px-4 py-2.5 rounded-xl border border-purple-500/20 hover:bg-purple-400/10 transition-all"><Plus className="w-4 h-4" /> Přidat položku</button>
                  </div>
                </div>

                {showAiInput && (
                  <div className="bg-slate-800 border-2 border-amber-500/30 rounded-3xl p-6 shadow-2xl space-y-4 animate-in slide-in-from-top-6">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-amber-500 flex items-center gap-2 tracking-widest"><Bot className="w-5 h-5" /> AI CHYTRÝ IMPORT</span>
                      <button onClick={() => setShowAiInput(false)} className="text-slate-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                    </div>
                    <textarea className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-5 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-amber-500/50 min-h-[140px]" placeholder="Sem vložte text poptávky nebo specifikaci k rozklíčování..." value={aiInput} onChange={(e) => setAiInput(e.target.value)} />
                    <div className="flex justify-end">
                      <button disabled={!aiInput || isAiFilling} onClick={handleAiFillTech} className="flex items-center gap-2.5 px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white text-xs font-black rounded-xl disabled:opacity-50 shadow-lg tracking-widest uppercase">
                        {isAiFilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Analyzovat & Vyplnit
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-8">
                  {formData.items.map((item, idx) => (
                    <div key={item.id} className={`bg-slate-800/40 border-2 rounded-3xl p-7 relative group transition-all duration-300 ${itemAiInputId === item.id ? 'border-amber-500 ring-4 ring-amber-500/10' : 'border-slate-700 hover:bg-slate-800/70 shadow-xl'}`}>
                      <div className="absolute top-4 right-4 flex items-center gap-2 z-30">
                        <button
                          onClick={(e) => { e.stopPropagation(); setItemAiInputId(itemAiInputId === item.id ? null : item.id); }}
                          className={`p-1.5 rounded-lg transition-all ${itemAiInputId === item.id ? 'bg-amber-500 text-white shadow-lg' : 'text-amber-500 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20'}`}
                          title="AI Upravit položku"
                        >
                          <Wand2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                          className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                          title="Smazat položku"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-start gap-4 mb-6">
                        <span className="text-[10px] font-black bg-slate-900 text-slate-500 w-8 h-8 flex items-center justify-center rounded-xl border border-slate-700 shrink-0">#{idx + 1}</span>
                        <div className="flex-1 pr-20">
                          <SuggestionInput
                            label="Co je to za položku?"
                            value={item.description || ''}
                            onChange={(val) => updateItem(item.id, 'description', val)}
                            suggestions={SUGGESTIONS.itemType}
                            icon={<FileText className="w-3.5 h-3.5" />}
                            placeholder="Vizitky, Letáky, Katalogy..."
                            multiline={true}
                            className="w-full"
                            dropDirection="down"
                            columns={3}
                          />
                        </div>
                      </div>

                      {itemAiInputId === item.id && (
                        <div className="mb-6 p-4 bg-amber-500/5 border border-amber-500/30 rounded-2xl animate-in slide-in-from-top-4 duration-200">
                          <div className="flex items-center gap-2 mb-3 text-[10px] font-black text-amber-500 uppercase tracking-widest">
                            <Sparkles className="w-3 h-3" /> AI Specifikace této položky
                          </div>
                          <div className="flex gap-2">
                            <textarea
                              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:ring-1 focus:ring-amber-500 outline-none resize-none min-h-[60px]"
                              placeholder="Např: 200ks, křída mat 300g, barevnost 4/0, formát A5..."
                              value={itemAiText}
                              onChange={(e) => setItemAiText(e.target.value)}
                            />
                            <button
                              onClick={() => handleAiFillSingleItem(item.id)}
                              disabled={!itemAiText.trim() || isAiFilling}
                              className="px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-xl transition-all disabled:opacity-50 flex items-center justify-center shadow-lg"
                            >
                              {isAiFilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-5 h-5" />}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        <div>
                          <label className="block text-[10px] font-black text-slate-600 uppercase mb-2 flex items-center gap-2">
                            <Zap className={`w-3.5 h-3.5 ${getIconStyle(item.quantity)}`} /> Náklad (ks)
                          </label>
                          <input
                            type="number"
                            className={`w-full border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 focus:ring-purple-500 outline-none transition-all ${getFieldStyle(item.quantity)}`}
                            value={item.quantity === 0 ? '' : item.quantity}
                            onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                          />
                        </div>
                        <SuggestionInput label="Rozměr (mm)" value={item.size || ''} onChange={(val) => updateItem(item.id, 'size', val)} suggestions={SUGGESTIONS.size} icon={<Maximize className="w-3.5 h-3.5" />} />
                        <SuggestionInput label="Barevnost" value={item.colors || ''} onChange={(val) => updateItem(item.id, 'colors', val)} suggestions={SUGGESTIONS.colors} icon={<Zap className="w-3.5 h-3.5" />} />
                        <div>
                          <label className="block text-[10px] font-black text-slate-600 uppercase mb-2 flex items-center gap-2">
                            <Layers className={`w-3.5 h-3.5 ${getIconStyle(item.numberOfPages)}`} /> Počet stran
                          </label>
                          <input
                            type="number"
                            className={`w-full border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 focus:ring-purple-500 transition-all ${getFieldStyle(item.numberOfPages)}`}
                            value={item.numberOfPages === 0 ? '' : item.numberOfPages}
                            onChange={(e) => updateItem(item.id, 'numberOfPages', parseInt(e.target.value) || 0)}
                          />
                        </div>
                        <SuggestionInput label="Typ papíru" value={item.paperType || ''} onChange={(val) => updateItem(item.id, 'paperType', val)} suggestions={SUGGESTIONS.paper} icon={<FileText className="w-3.5 h-3.5" />} />
                        <SuggestionInput label="Gramáž (g)" value={item.paperWeight || ''} onChange={(val) => updateItem(item.id, 'paperWeight', val)} suggestions={SUGGESTIONS.weight} icon={<Cpu className="w-3.5 h-3.5" />} />
                        <div className="lg:col-span-2 xl:col-span-2">
                          <label className="block text-[10px] font-black text-slate-600 uppercase mb-2 flex items-center gap-2">
                            <Settings className={`w-3.5 h-3.5 ${getIconStyle(item.techSpecs)}`} /> Specifikace / Ořez / Poznámka k položce
                          </label>
                          <input
                            type="text"
                            className={`w-full border rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-purple-500 transition-all ${getFieldStyle(item.techSpecs)}`}
                            value={item.techSpecs || ''}
                            onChange={(e) => updateItem(item.id, 'techSpecs', e.target.value)}
                            placeholder="Atypický ořez, dírky, bigování v ohybu..."
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-10 border-t border-slate-800 space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <SuggestionInput
                      label="Knihařské zpracování"
                      value={formData.processing || ''}
                      onChange={(val) => setFormData({ ...formData, processing: val })}
                      suggestions={SUGGESTIONS.processing}
                      columns={1}
                      icon={<Scissors className="w-4 h-4" />}
                      multiline={true}
                      placeholder="Vyberte jedno nebo více..."
                    />
                    <SuggestionInput
                      label="Vazba"
                      value={formData.bindingType || ''}
                      onChange={(val) => setFormData({ ...formData, bindingType: val })}
                      suggestions={SUGGESTIONS.binding}
                      columns={1}
                      icon={<Layers className="w-4 h-4" />}
                      multiline={true}
                      placeholder="Vyberte jedno nebo více..."
                    />
                    <SuggestionInput
                      label="Laminace"
                      value={formData.laminationType || ''}
                      onChange={(val) => setFormData({ ...formData, laminationType: val })}
                      suggestions={SUGGESTIONS.lamination}
                      columns={1}
                      icon={<Zap className="w-4 h-4" />}
                      multiline={true}
                      placeholder="Vyberte jedno nebo více..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-slate-800/50">
                    <div className="flex flex-col">
                      <label className="block text-[10px] font-black text-slate-600 uppercase mb-2 flex items-center gap-2 tracking-widest">
                        <MapPin className={`w-4 h-4 transition-all duration-300 ${getIconStyle(formData.address)}`} /> Dodací adresa
                      </label>
                      <div className="flex gap-3 items-start h-full">
                        <AutoExpandingTextarea
                          value={formData.address || ''}
                          onChange={(val) => setFormData({ ...formData, address: val })}
                          placeholder="KAM MÁME ZÁSILKU DORUČIT?..."
                          className={`flex-1 border rounded-2xl px-5 py-3.5 text-sm font-bold focus:ring-2 focus:ring-purple-500 transition-all min-h-[44px] ${getFieldStyle(formData.address)}`}
                        />
                        <button type="button" disabled={!formData.address} onClick={handleOpenMaps} className={`p-4 rounded-2xl border transition-all shrink-0 h-[44px] flex items-center justify-center ${formData.address ? 'bg-purple-600/10 border-purple-500/50 text-purple-400 hover:bg-purple-600/20' : 'bg-slate-900 border-slate-700 text-slate-700'}`}>
                          <Map className="w-6 h-6" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-8">
                      <div className="flex flex-col h-full">
                        <label className="block text-[10px] font-black text-slate-600 uppercase mb-2 flex items-center gap-2 tracking-widest">
                          <Truck className={`w-4 h-4 transition-all duration-300 ${getIconStyle(formData.shippingNotes)}`} /> Expedice & Balení
                        </label>
                        <AutoExpandingTextarea
                          value={formData.shippingNotes || ''}
                          onChange={(val) => setFormData({ ...formData, shippingNotes: val })}
                          placeholder="Způsob dopravy, specifické balení, štítkování..."
                          className={`w-full border rounded-2xl px-5 py-3.5 text-sm font-bold focus:ring-2 focus:ring-purple-500 outline-none transition-all ${getFieldStyle(formData.shippingNotes)} min-h-[44px] flex-1`}
                          minRows={1}
                        />
                      </div>

                      <SuggestionInput
                        label="Externí Kooperace"
                        value={formData.cooperation || ''}
                        onChange={(val) => setFormData({ ...formData, cooperation: val })}
                        suggestions={SUGGESTIONS.cooperation}
                        columns={1}
                        icon={<Merge className="w-4 h-4" />}
                        dropDirection="down"
                        multiline={true}
                        placeholder="Zajištění výseku, parciálu, ražby..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="bg-slate-800 border-t border-slate-700 px-10 py-6 flex items-center justify-between shrink-0">
          <div className="flex gap-4">
            <button
              onClick={() => setShowPrintEdit(true)}
              className="flex items-center gap-3 px-6 py-3 bg-slate-100 hover:bg-white text-slate-900 rounded-2xl text-sm font-black transition-all shadow-lg active:scale-95"
            >
              <Printer className="w-5 h-5 opacity-60" /> Tisk souhrnu
            </button>
            <button
              onClick={handleOpenInPytlik}
              className="flex items-center gap-3 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-sm font-black transition-all shadow-lg active:scale-95 shadow-purple-900/40"
            >
              <FileText className="w-5 h-5" /> TISK ZAKÁZKOVÉHO LISTU (AI PYTLÍK)
            </button>
          </div>
          <div className="flex gap-4">
            <button onClick={onClose} className="px-8 py-3 text-sm font-black text-slate-500 hover:text-white transition-colors uppercase tracking-widest">Zrušit změny</button>
          </div>
        </footer>
      </div>

      {/* --- SEKCE PRO TISK SOUHRNU (A4 / Multi-page) --- */}
      <div className="hidden print:block w-full bg-white text-slate-950 font-sans p-8 print:p-0">
        <style dangerouslySetInnerHTML={{
          __html: `
          @media print {
            body { overflow: visible !important; }
            .print-avoid-break { break-inside: avoid; page-break-inside: avoid; }
            .print-row { border-bottom: 2px solid #000; }
          }
        ` }} />
        <div className="flex justify-between items-start border-b-4 border-slate-950 pb-6 mb-8">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter mb-2 text-slate-950">SOUHRN ZAKÁZKY</h1>
            <p className="text-xl font-bold text-slate-900">{formData.customer || '---'}</p>
            <p className="text-lg text-slate-700">{formData.jobName || '---'}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Termín / Deadline</p>
            <p className="text-2xl font-black text-slate-950">{formData.deadline || '---'}</p>
            {formData.jobId && <p className="text-md font-mono mt-2 bg-slate-100 px-3 py-1 inline-block border border-slate-200">ID: {formData.jobId}</p>}
          </div>
        </div>

        <table className="w-full border-collapse mb-10 border-2 border-slate-950">
          <thead>
            <tr className="bg-slate-100">
              <th className="border-2 border-slate-950 px-4 py-3 text-left text-[10px] font-black uppercase">Název</th>
              <th className="border-2 border-slate-950 px-3 py-3 text-center text-[10px] font-black uppercase">Formát</th>
              <th className="border-2 border-slate-950 px-3 py-3 text-center text-[10px] font-black uppercase w-16">Barvy</th>
              <th className="border-2 border-slate-950 px-4 py-3 text-center text-[10px] font-black uppercase w-24">Náklad</th>
              <th className="border-2 border-slate-950 px-4 py-3 text-left text-[10px] font-black uppercase">Papír</th>
              <th className="border-2 border-slate-950 px-3 py-3 text-center text-[10px] font-black uppercase">Gramáž</th>
            </tr>
          </thead>
          <tbody>
            {formData.items.map((item) => (
              <React.Fragment key={item.id}>
                <tr className="print-avoid-break border-t-2 border-slate-950">
                  <td className="border-2 border-slate-950 px-4 py-3 font-bold text-sm text-slate-950 whitespace-pre-wrap">{item.description || '---'}</td>
                  <td className="border-2 border-slate-950 px-3 py-3 text-center font-bold text-sm text-slate-950">{item.size || '---'}</td>
                  <td className="border-2 border-slate-950 px-3 py-3 text-center font-bold text-sm text-slate-900 whitespace-nowrap">{item.colors || '---'}</td>
                  <td className="border-2 border-slate-950 px-4 py-3 text-center font-black text-base text-slate-950">{item.quantity ? `${item.quantity} ks` : '---'}</td>
                  <td className="border-2 border-slate-950 px-4 py-3 italic text-sm text-slate-800">{item.paperType || '---'}</td>
                  <td className="border-2 border-slate-950 px-3 py-3 text-center font-bold text-sm text-slate-950 whitespace-nowrap">{item.paperWeight || '---'}</td>
                </tr>
                {item.techSpecs && (
                  <tr className="print-avoid-break">
                    <td colSpan={6} className="border-2 border-slate-950 bg-slate-50 px-4 py-2 text-xs font-medium italic text-slate-700 whitespace-pre-wrap">
                      <span className="font-black uppercase pr-2 text-[9px] not-italic text-slate-400">Poznámka k položce:</span> {item.techSpecs}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {/* Finishing Details */}
        <div className="grid grid-cols-2 gap-10 border-t-2 border-slate-100 pt-8 mt-4 print-avoid-break">
          <div className="space-y-6">
            <div>
              <h4 className="text-[10px] font-black uppercase text-slate-400 mb-3 leading-none tracking-widest">Knihárna & Zpracování</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Vazba</p>
                  <p className="text-sm font-black text-slate-900">{formData.bindingType || '---'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Laminace</p>
                  <p className="text-sm font-black text-slate-900">{formData.laminationType || '---'}</p>
                </div>
              </div>
              {formData.processing && (
                <div className="mt-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-2">Ostatní Zpracování</p>
                  <p className="text-sm font-medium text-slate-900 italic leading-relaxed whitespace-pre-wrap">{formData.processing}</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-50 p-6 rounded-xl border-2 border-dashed border-slate-200">
              <h4 className="text-[10px] font-black uppercase text-slate-500 mb-3 leading-none tracking-widest">Expedice & Balení</h4>
              <p className="text-sm font-bold text-slate-900 whitespace-pre-wrap leading-relaxed">{formData.shippingNotes || '---'}</p>
            </div>
            {formData.cooperation && (
              <div className="p-4 border border-amber-200 bg-amber-50/30 rounded-xl">
                <h4 className="text-[9px] font-black uppercase text-amber-600 mb-1 leading-none">Externí kooperace</h4>
                <p className="text-sm font-bold text-amber-900">{formData.cooperation}</p>
              </div>
            )}
          </div>
        </div>

        {formData.address && (
          <div className="mt-10 pt-6 border-t border-slate-100 print-avoid-break">
            <h4 className="text-[10px] font-black uppercase text-slate-400 mb-2">Doručovací adresa / Kontakt</h4>
            <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl">
              <p className="text-lg font-black whitespace-pre-wrap italic">{formData.address}</p>
            </div>
          </div>
        )}

        {formData.generalNotes && (
          <div className="mt-8 pt-6 border-t border-slate-100 print-avoid-break">
            <h4 className="text-[10px] font-black uppercase text-slate-400 mb-2 leading-none">Obecná poznámka k zakázce</h4>
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{formData.generalNotes}</p>
          </div>
        )}

        {extraPrintNote && (
          <div className="mt-8 pt-6 border-t-4 border-slate-950 print-avoid-break bg-slate-50 p-6">
            <h4 className="text-[12px] font-black uppercase text-slate-950 mb-3 leading-none">Dodatečné informace k tisku</h4>
            <p className="text-base text-slate-950 leading-relaxed whitespace-pre-wrap font-bold">{extraPrintNote}</p>
          </div>
        )}

        <div className="mt-20 border-t border-slate-100 pt-4 flex justify-between items-center opacity-50">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">CML BOARD • {formData.jobId || 'SOUHRN'}</p>
          <p className="text-[8px] font-bold text-slate-400">{new Date().toLocaleString('cs-CZ')}</p>
        </div>
      </div>

      {/* --- MODAL PRO EDITACI PŘED TISKEM (TABULKOVÝ EDITOR) --- */}
      {showPrintEdit && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[4000] flex items-center justify-center p-0 md:p-4 print:hidden animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-6xl h-full md:h-[95vh] rounded-none md:rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <header className="bg-slate-800 px-8 py-5 border-b border-slate-700 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <div className="bg-purple-600 p-2 rounded-lg"><Printer className="w-5 h-5 text-white" /></div>
                <div>
                  <h3 className="text-xl font-black text-white leading-none">Úprava souhrnu před tiskem</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1.5 outline-none">Zde můžete doladit údaje, které se objeví na papíře</p>
                </div>
              </div>
              <button onClick={() => setShowPrintEdit(false)} className="text-slate-500 hover:text-white transition-colors bg-slate-700/50 p-2 rounded-xl">
                <X className="w-6 h-6" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              {/* Hlavička zakázky */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-800/30 p-6 rounded-2xl border border-slate-700/50">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">Zákazník</label>
                  <input
                    type="text"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white focus:ring-2 focus:ring-purple-500 outline-none"
                    value={formData.customer}
                    onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">Název zakázky</label>
                  <input
                    type="text"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white focus:ring-2 focus:ring-purple-500 outline-none"
                    value={formData.jobName}
                    onChange={(e) => setFormData({ ...formData, jobName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">Termín</label>
                  <input
                    type="text"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white focus:ring-2 focus:ring-purple-500 outline-none"
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  />
                </div>
              </div>

              {/* Tabulka položek */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-purple-400 uppercase tracking-widest flex items-center gap-2">
                  <Layers className="w-4 h-4" /> Položky k tisku (Editovatelné)
                </h4>
                <div className="border border-slate-700 rounded-2xl overflow-hidden bg-slate-950 shadow-2xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-800/80 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="px-4 py-4 border-r border-slate-700">Název / Popis položky</th>
                        <th className="px-4 py-4 border-r border-slate-700 w-28">Formát</th>
                        <th className="px-4 py-4 border-r border-slate-700 w-24 text-center">Barvy</th>
                        <th className="px-4 py-4 border-r border-slate-700 w-28 text-center">Náklad</th>
                        <th className="px-4 py-4 border-r border-slate-700">Papír</th>
                        <th className="px-4 py-4 w-24 text-center">Gramáž</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.items.map((item, idx) => (
                        <tr key={item.id} className="border-t border-slate-700 hover:bg-slate-800/30 transition-colors">
                          <td className="p-1 border-r border-slate-700">
                            <textarea
                              className="w-full bg-transparent border-none px-3 py-2 text-sm text-white font-bold resize-none focus:ring-1 focus:ring-purple-500 rounded outline-none h-14"
                              value={item.description}
                              onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                            />
                          </td>
                          <td className="p-1 border-r border-slate-700">
                            <input
                              className="w-full bg-transparent border-none px-3 py-2 text-sm text-white font-bold focus:ring-1 focus:ring-purple-500 rounded outline-none text-center"
                              value={item.size}
                              onChange={(e) => updateItem(item.id, 'size', e.target.value)}
                            />
                          </td>
                          <td className="p-1 border-r border-slate-700">
                            <input
                              className="w-full bg-transparent border-none px-3 py-2 text-sm text-white font-bold focus:ring-1 focus:ring-purple-500 rounded outline-none text-center"
                              value={item.colors}
                              onChange={(e) => updateItem(item.id, 'colors', e.target.value)}
                            />
                          </td>
                          <td className="p-1 border-r border-slate-700">
                            <div className="flex items-center">
                              <input
                                type="number"
                                className="w-full bg-transparent border-none px-3 py-2 text-sm text-white font-black focus:ring-1 focus:ring-purple-500 rounded outline-none text-center"
                                value={item.quantity || ''}
                                placeholder="0"
                                onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                              />
                              <span className="text-[10px] text-slate-500 pr-2">ks</span>
                            </div>
                          </td>
                          <td className="p-1 border-r border-slate-700">
                            <input
                              className="w-full bg-transparent border-none px-3 py-2 text-sm text-white italic focus:ring-1 focus:ring-purple-500 rounded outline-none"
                              value={item.paperType}
                              onChange={(e) => updateItem(item.id, 'paperType', e.target.value)}
                            />
                          </td>
                          <td className="p-1">
                            <input
                              className="w-full bg-transparent border-none px-3 py-2 text-sm text-white font-bold focus:ring-1 focus:ring-purple-500 rounded outline-none text-center"
                              value={item.paperWeight}
                              onChange={(e) => updateItem(item.id, 'paperWeight', e.target.value)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Poznámky a doplňky */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Knihárna & Zpracování</h4>
                  <div className="bg-slate-800/20 p-5 rounded-2xl border border-slate-700/50 space-y-4">
                    <div>
                      <label className="block text-[9px] font-black text-slate-600 uppercase mb-1.5 ml-1">Vazba</label>
                      <input
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:ring-1 focus:ring-purple-500"
                        value={formData.bindingType}
                        onChange={(e) => setFormData({ ...formData, bindingType: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-slate-600 uppercase mb-1.5 ml-1">Laminace</label>
                      <input
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:ring-1 focus:ring-purple-500"
                        value={formData.laminationType}
                        onChange={(e) => setFormData({ ...formData, laminationType: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-slate-600 uppercase mb-1.5 ml-1">Ostatní zpracování</label>
                      <textarea
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:ring-1 focus:ring-purple-500 h-20 resize-none font-medium italic"
                        value={formData.processing}
                        onChange={(e) => setFormData({ ...formData, processing: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                      <Printer className="w-4 h-4" /> Doplňující info k tomuto tisku
                    </h4>
                    <textarea
                      className="w-full h-32 bg-slate-900 border-2 border-amber-600/30 rounded-2xl p-5 text-slate-100 font-bold focus:ring-2 focus:ring-amber-500 outline-none resize-none shadow-inner"
                      placeholder="NAPŘ: ZABALIT DO KRABIC PO 100 KS, NEBO ČÍSLOVAT OD 1001..."
                      value={extraPrintNote}
                      onChange={(e) => setExtraPrintNote(e.target.value)}
                    />
                    <p className="text-[10px] text-slate-500 italic px-2">Tyto žluté informace se neuloží k zakázce, jsou jen pro tento tisk.</p>
                  </div>

                  <div className="bg-slate-800/30 p-5 rounded-2xl border border-slate-700/50">
                    <label className="block text-[9px] font-black text-slate-600 uppercase mb-1.5 ml-1 leading-none">Doručovací adresa</label>
                    <textarea
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-bold italic outline-none focus:ring-1 focus:ring-purple-500 h-16 resize-none"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            <footer className="bg-slate-800 px-10 py-6 border-t border-slate-700 flex justify-between items-center shrink-0">
              <button
                onClick={() => setShowPrintEdit(false)}
                className="px-8 py-3 text-sm font-black text-slate-500 hover:text-white transition-colors uppercase tracking-widest bg-slate-700/30 rounded-xl"
              >
                ZRUŠIT
              </button>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    // Uložíme lokálně do parenta Tabule, aby změny zůstaly v systému
                    onSave(formData);
                    setShowPrintEdit(false);
                    setTimeout(() => window.print(), 100);
                  }}
                  className="flex items-center gap-3 px-8 py-4 bg-slate-100 hover:bg-white text-slate-900 rounded-2xl text-sm font-black shadow-xl active:scale-95 transition-all"
                >
                  <Save className="w-5 h-5 opacity-40 text-purple-600" /> ULOŽIT DO TABULE & TISKNOUT
                </button>

                <button
                  onClick={() => {
                    setShowPrintEdit(false);
                    setTimeout(() => window.print(), 100);
                  }}
                  className="flex items-center gap-3 px-10 py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-sm font-black shadow-xl shadow-purple-950/40 active:scale-95 transition-all border-b-4 border-purple-800"
                >
                  <Printer className="w-5 h-5" /> JEN TISKNOUT
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobFormModal;
