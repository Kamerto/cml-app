export enum JobStatus {
  INQUIRY = 'Poptávka',
  PRODUCTION = 'Kalkulace',
  READY_FOR_PROD = 'Výroba',
  EXPRESS = 'Expres',
  COMPLETED = 'Hotovo'
}

export interface PrintItem {
  id: string;
  description: string;
  quantity: number;
  size: string;
  colors: string;
  techSpecs: string;
  stockFormat: string;
  paperType: string;
  paperWeight: string;
  itemsPerSheet: string;
  numberOfPages: number;
}

export interface JobData {
  fireId?: string; // ID v soukromé kolekci (Tabule)
  publicFireId?: string; // ID ve společné kolekci (Fronta/orders)
  id: string;
  jobId: string;
  customer: string;
  jobName: string;
  address?: string;
  distance?: string;
  dateReceived: string;
  deadline: string;
  technology: ('DIGI' | 'OFSET')[];
  status: JobStatus;
  items: PrintItem[];
  bindingType: string;
  laminationType: string;
  processing: string; // Knihařské zpracování
  cooperation: string; // Kooperace
  shippingNotes: string;
  generalNotes?: string;
  icon?: string;
  position: { x: number; y: number };
  tags?: string[];
  isFolder?: boolean;
  trackingStage?: 'studio' | 'print' | 'bookbinding' | 'completed';
  isTracked?: boolean;
  lastEmailEntryId?: string;
  entry_id?: string;
  store_id?: string;
  outlookId?: string;
  isNew?: boolean;
  zIndex?: number;
}

export interface Column {
  id: JobStatus;
  title: string;
  color: string;
  borderColor: string;
  accentColor: string;
}

export interface JobEmail {
  id: string;
  zakazka_id: string;
  subject: string;
  entry_id: string;
  preview: string;
  sender?: string;
  received_at?: string;
  store_id?: string;
  created_at: string;
}