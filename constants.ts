import { JobStatus, Column, JobData } from './types';

export const COLUMNS: Column[] = [
  {
    id: JobStatus.INQUIRY,
    title: 'Poptávky',
    color: 'bg-emerald-400',
    borderColor: 'border-emerald-300',
    accentColor: 'text-white'
  },
  {
    id: JobStatus.PRODUCTION,
    title: 'Kalkulace',
    color: 'bg-emerald-800',
    borderColor: 'border-emerald-600',
    accentColor: 'text-emerald-50'
  },
  {
    id: JobStatus.READY_FOR_PROD,
    title: 'Výroba',
    color: 'bg-slate-700',
    borderColor: 'border-slate-500',
    accentColor: 'text-slate-50'
  },
  {
    id: JobStatus.EXPRESS,
    title: 'Expres',
    color: 'bg-red-600',
    borderColor: 'border-red-400',
    accentColor: 'text-red-50'
  },
  {
    id: JobStatus.COMPLETED,
    title: 'Hotovo',
    color: 'bg-purple-600',
    borderColor: 'border-purple-400',
    accentColor: 'text-purple-50'
  }
];

export const INITIAL_JOBS: JobData[] = [];

export const PAPER_TYPES = ['Křída Lesk', 'Křída Mat', 'Ofset', 'Samolepka', 'Grafický', 'Olin'];
export const BINDING_TYPES = ['Bez vazby', 'V1 na 2 skoby', 'V1 na 4 skoby', 'V1 s očky', 'V2 lepená', 'V4 šitá', 'V8 šitá v deskách', 'Kroužková', 'Twin-wire'];
export const LAMINA_TYPES = ['Bez lamina', 'Lesk 1/0', 'Lesk 1/1', 'Mat 1/0', 'Mat 1/1', 'Matné Antiscratch 1/0', 'Matné Antiscratch 1/1', 'SoftTouch 1/0', 'SoftTouch 1/1'];
export const ICONS = ['FileText', 'Printer', 'Sticker', 'Book', 'Package', 'Briefcase', 'Mail'];