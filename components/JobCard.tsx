import React from 'react';
import { JobData, JobStatus } from '../types';
import { Trash2, MapPin, FileText, Cpu, Zap, Folder } from 'lucide-react';
import { COLUMNS } from '../constants';

interface JobCardProps {
  job: JobData;
  onClick: () => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: JobStatus) => void;
}

const STAGE_LABELS: Record<string, string> = {
  studio: "Studio",
  print: "Tisk",
  bookbinding: "Knihárna",
  completed: "Hotovo",
};



const JobCard: React.FC<JobCardProps> = ({ job, onClick, onDelete, onStatusChange }) => {
  const statusConfig = COLUMNS.find(c => c.id === job.status);

  const districtMatch = job.address?.match(/Praha\s*(\d{1,2})/i);
  const district = districtMatch ? `Praha ${districtMatch[1]}` : null;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('jobId', job.id);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    e.dataTransfer.setData('offsetX', (e.clientX - rect.left).toString());
    e.dataTransfer.setData('offsetY', (e.clientY - rect.top).toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const getStatusIcon = (id: JobStatus) => {
    switch (id) {
      case JobStatus.INQUIRY: return <FileText className="w-3.5 h-3.5" />;
      case JobStatus.PRODUCTION: return <Zap className="w-3.5 h-3.5" />;
      case JobStatus.READY_FOR_PROD: return <Cpu className="w-3.5 h-3.5" />;
      case JobStatus.EXPRESS: return <Zap className="w-3.5 h-3.5" />;
      default: return <FileText className="w-3.5 h-3.5" />;
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        return dateStr.split('-').reverse().slice(0, 2).join('.');
      }
      return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const getStyle = (): React.CSSProperties => {
    if (job.status === JobStatus.READY_FOR_PROD) {
      const hasOfset = job.technology?.includes('OFSET');
      const hasDigi = job.technology?.includes('DIGI');

      if (hasOfset && hasDigi) {
        return { background: 'linear-gradient(to right, #f97316 50%, #0ea5e9 50%)' };
      } else if (hasOfset) {
        return { backgroundColor: '#f97316' };
      } else if (hasDigi) {
        return { backgroundColor: '#0ea5e9' };
      }
    }
    return {};
  };

  const getBgClass = () => {
    if (job.status === JobStatus.READY_FOR_PROD) return '';
    if (job.isFolder) return 'bg-amber-600/90';
    return statusConfig?.color || 'bg-slate-700';
  };

  const textColorClass = 'text-white';
  const subTextColorClass = 'text-white/90';

  const dateToDisplay = job.deadline ? formatDate(job.deadline) : formatDate(job.dateReceived);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={onClick}
      className={`
        absolute w-48 h-48 p-3 rounded-2xl cursor-grab active:cursor-grabbing 
        transition-all shadow-xl group select-none flex flex-col border-2 border-white/20
        ${getBgClass()}
        ${job.isFolder ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950' : ''}
        ${job.isNew ? 'animate-pulse brightness-125 ring-4 ring-purple-400 shadow-[0_0_30px_8px_rgba(168,85,247,0.6)] ring-offset-2 ring-offset-slate-950' : ''}
      `}
      style={{
        left: `${job.position.x}px`,
        top: `${job.position.y}px`,
        ...getStyle()
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(job.id); }}
        className="absolute -top-2 -right-2 w-7 h-7 bg-black/40 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md border border-white/20 shadow-lg z-10"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      {/* Header Row: ID, Tech Badges, Date */}
      <div className="flex items-center justify-between w-full mb-1 shrink-0">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <div className={`px-2 py-0.5 rounded-lg ${textColorClass} text-[14px] font-black uppercase tracking-tighter truncate ${!job.jobId ? 'bg-amber-500/30 ring-1 ring-amber-400/40 text-amber-100' : 'bg-black/10 ring-1 ring-white/10'}`}>
            {job.jobId || 'ID?'}
          </div>

          <div className="flex gap-0.5 shrink-0">
            {job.technology && job.technology.length > 0 ? (
              job.technology.map(tech => (
                <div key={tech} className="px-1 py-0.5 rounded bg-white/20 text-[8px] font-black text-white uppercase border border-white/10 leading-none">
                  {tech.substring(0, 3)}
                </div>
              ))
            ) : null}
          </div>
        </div>

        <div className={`text-[13px] font-black ${textColorClass} drop-shadow-sm whitespace-nowrap ml-1 flex items-center gap-2`}>
          <span className={!dateToDisplay ? 'bg-amber-500/30 px-1 rounded ring-1 ring-amber-400/40' : ''}>
            {dateToDisplay || '--.--'}
          </span>
        </div>
      </div>

      {/* District Metadata & Tracking */}
      <div className="flex justify-end gap-1 mb-1 h-3.5 shrink-0">
        {job.isTracked && job.trackingStage && job.trackingStage !== 'completed' && (
          <div className="px-1.5 rounded bg-emerald-500/20 text-emerald-300 text-[8px] font-black uppercase flex items-center gap-1 border border-emerald-500/30">
            {STAGE_LABELS[job.trackingStage] || job.trackingStage}
          </div>
        )}
        {job.isFolder && (
          <div className="px-1.5 py-0.5 rounded bg-amber-400 text-black text-[7px] font-black uppercase flex items-center gap-1">
            <Folder className="w-1.5 h-1.5" /> SLOŽKA ({job.items.length})
          </div>
        )}
        {district && !job.isFolder && (
          <div className="px-1 py-0.5 rounded bg-black/20 text-[7px] font-black text-white uppercase flex items-center gap-0.5 border border-white/10">
            <MapPin className="w-1.5 h-1.5" /> {district}
          </div>
        )}
      </div>

      {/* Main Content Area - Separated from Tech Badges */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-black/10 rounded-xl p-2 border border-white/5 space-y-1">
        <h4 className={`font-black text-[15px] ${textColorClass} leading-tight line-clamp-2 ${!job.customer ? 'bg-amber-500/30 text-amber-100' : ''}`}>
          {job.customer || 'ZÁKAZNÍK?'}
        </h4>
        <p className={`text-[9px] ${subTextColorClass} truncate font-bold uppercase tracking-tight opacity-70 italic ${!job.jobName ? 'text-amber-200/50' : ''}`}>
          {job.jobName || 'Název zakázky?'}
        </p>

        {job.items && job.items.length > 0 && (
          <div className="mt-auto pt-1">
            <div className="bg-white/90 rounded-lg px-2 py-1 shadow-sm">
              <p className="text-[10px] font-black text-slate-900 truncate leading-none">
                {job.items[0].description || 'Bez popisu'}
                {job.items.length > 1 && <span className="ml-1 text-[8px] text-slate-600 font-bold">+{job.items.length - 1}</span>}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className={`pt-2 border-t border-white/10 shrink-0 mt-1`}>
        <div className="flex justify-between bg-black/20 p-0.5 rounded-lg gap-0.5">
          {COLUMNS.map(col => (
            <button
              key={col.id}
              title={col.title}
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange(job.id, col.id);
              }}
              className={`
                flex-1 flex items-center justify-center p-1 rounded-md transition-all
                ${job.status === col.id
                  ? 'bg-white text-slate-900 shadow-inner scale-105'
                  : 'text-white/30 hover:text-white hover:bg-white/10'
                }
              `}
            >
              {getStatusIcon(col.id)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default JobCard;