import React, { useState, useEffect } from 'react';
import { BoardNoteData } from '../types';
import { Trash2 } from 'lucide-react';

interface BoardNoteProps {
    note: BoardNoteData;
    onUpdate: (id: string, text: string) => void;
    onDelete: (id: string) => void;
    onBringToFront: () => void;
}

const BoardNote: React.FC<BoardNoteProps> = ({ note, onUpdate, onDelete, onBringToFront }) => {
    const [text, setText] = useState(note.text);

    useEffect(() => {
        setText(note.text);
    }, [note.text]);

    const handleDragStart = (e: React.DragEvent) => {
        onBringToFront();
        e.dataTransfer.setData('noteId', note.id);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        e.dataTransfer.setData('offsetX', (e.clientX - rect.left).toString());
        e.dataTransfer.setData('offsetY', (e.clientY - rect.top).toString());
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleBlur = () => {
        if (text !== note.text) {
            onUpdate(note.id, text);
        }
    };

    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onMouseDown={onBringToFront}
            className="absolute w-56 h-56 rounded-tr-3xl rounded-bl-3xl rounded-br-md rounded-tl-md shadow-lg group select-none flex flex-col p-1 cursor-grab active:cursor-grabbing transform rotate-1 transition-transform hover:rotate-0"
            style={{
                left: `${note.position.x}px`,
                top: `${note.position.y}px`,
                zIndex: note.zIndex || 1,
                backgroundColor: note.color || '#ff69b4', // reflexní růžová
                boxShadow: '4px 6px 15px rgba(0,0,0,0.3), inset 0 0 20px rgba(0,0,0,0.05)'
            }}
        >
            {/* Header/Drag Handle area */}
            <div className="flex justify-end p-1 h-6 shrink-0 relative z-10">
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
                    className="w-6 h-6 bg-black/20 text-black/60 hover:text-red-600 hover:bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                    title="Smazat poznámku"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 px-3 pb-3 -mt-4 relative relative z-0">
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onBlur={handleBlur}
                    placeholder="Napiš poznámku..."
                    className="w-full h-full bg-transparent border-none outline-none resize-none text-slate-800 font-medium text-base leading-relaxed placeholder:text-slate-800/40"
                    onMouseDown={(e) => {
                        // Allow clicking into the textarea without triggering drag
                        e.stopPropagation();
                        onBringToFront();
                    }}
                />
            </div>

            {/* Folded corner effect */}
            <div
                className="absolute bottom-0 right-0 w-6 h-6"
                style={{
                    background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.1) 50%)',
                    borderTopLeftRadius: '4px'
                }}
            />
        </div>
    );
};

export default BoardNote;
