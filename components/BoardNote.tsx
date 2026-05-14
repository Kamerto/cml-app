import React, { useState, useEffect } from 'react';
import { BoardNoteData, BoardNoteItem } from '../types';
import { Trash2, Plus, ChevronUp, ChevronDown } from 'lucide-react';

interface BoardNoteProps {
    note: BoardNoteData;
    onUpdate: (id: string, items: BoardNoteItem[]) => void;
    onDelete: (id: string) => void;
    onBringToFront: () => void;
}

const BoardNote: React.FC<BoardNoteProps> = ({ note, onUpdate, onDelete, onBringToFront }) => {
    const [items, setItems] = useState<BoardNoteItem[]>(note.items || []);

    useEffect(() => {
        setItems(note.items || []);
    }, [note.items]);

    const save = (newItems: BoardNoteItem[]) => {
        setItems(newItems);
        onUpdate(note.id, newItems);
    };

    const addItem = () => {
        save([...items, { id: Math.random().toString(36).substring(2, 9), text: '', done: false }]);
    };

    const updateItem = (itemId: string, text: string) => {
        save(items.map(i => i.id === itemId ? { ...i, text } : i));
    };

    const toggleItem = (itemId: string) => {
        save(items.map(i => i.id === itemId ? { ...i, done: !i.done } : i));
    };

    const deleteItem = (itemId: string) => {
        save(items.filter(i => i.id !== itemId));
    };

    const moveItem = (index: number, dir: 'up' | 'down') => {
        const next = [...items];
        const swap = dir === 'up' ? index - 1 : index + 1;
        if (swap < 0 || swap >= next.length) return;
        [next[index], next[swap]] = [next[swap], next[index]];
        save(next);
    };

    const handleDragStart = (e: React.DragEvent) => {
        onBringToFront();
        e.dataTransfer.setData('noteId', note.id);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        e.dataTransfer.setData('offsetX', (e.clientX - rect.left).toString());
        e.dataTransfer.setData('offsetY', (e.clientY - rect.top).toString());
        e.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div
            onMouseDown={onBringToFront}
            className="absolute rounded-tr-3xl rounded-bl-3xl rounded-br-md rounded-tl-md shadow-lg group select-none flex flex-col transform rotate-1 transition-transform hover:rotate-0 w-56"
            style={{
                left: `${note.position.x}px`,
                top: `${note.position.y}px`,
                zIndex: note.zIndex || 1,
                backgroundColor: note.color || '#ff69b4',
                boxShadow: '4px 6px 15px rgba(0,0,0,0.3), inset 0 0 20px rgba(0,0,0,0.05)'
            }}
        >
            {/* Header – přetahovací oblast + tlačítka */}
            <div
                draggable
                onDragStart={handleDragStart}
                className="flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing"
            >
                <button
                    onClick={(e) => { e.stopPropagation(); addItem(); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="w-6 h-6 bg-black/20 hover:bg-black/35 text-black/70 rounded-full flex items-center justify-center transition-all"
                    title="Přidat položku"
                >
                    <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="w-6 h-6 bg-black/20 text-black/60 hover:text-red-600 hover:bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                    title="Smazat kartičku"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Seznam položek */}
            <div className="px-2 pb-4 flex flex-col gap-1.5">
                {items.length === 0 && (
                    <p className="text-center text-black/30 text-xs py-2 italic">Klikni + pro přidání...</p>
                )}
                {items.map((item, index) => (
                    <div key={item.id} className="flex items-start gap-1 group/item">
                        {/* Šipky pro přeřazení */}
                        <div className="flex flex-col shrink-0 mt-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
                            <button
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); moveItem(index, 'up'); }}
                                disabled={index === 0}
                                className="h-3.5 flex items-center justify-center text-black/40 hover:text-black/80 disabled:opacity-20"
                            >
                                <ChevronUp className="w-3 h-3" />
                            </button>
                            <button
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); moveItem(index, 'down'); }}
                                disabled={index === items.length - 1}
                                className="h-3.5 flex items-center justify-center text-black/40 hover:text-black/80 disabled:opacity-20"
                            >
                                <ChevronDown className="w-3 h-3" />
                            </button>
                        </div>

                        {/* Checkbox */}
                        <input
                            type="checkbox"
                            checked={item.done}
                            onChange={() => toggleItem(item.id)}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="mt-1 shrink-0 cursor-pointer accent-black/60 w-3.5 h-3.5"
                        />

                        {/* Text */}
                        <textarea
                            value={item.text}
                            onChange={(e) => {
                                updateItem(item.id, e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = e.target.scrollHeight + 'px';
                            }}
                            onMouseDown={(e) => { e.stopPropagation(); onBringToFront(); }}
                            placeholder="Poznámka..."
                            rows={1}
                            className={`flex-1 bg-transparent border-none outline-none resize-none text-slate-800 font-medium text-sm leading-relaxed placeholder:text-black/30 overflow-hidden min-w-0 ${item.done ? 'line-through opacity-50' : ''}`}
                            style={{ minHeight: '22px' }}
                        />

                        {/* Smazat položku */}
                        <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                            className="mt-1 shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity text-black/40 hover:text-red-600"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    </div>
                ))}
            </div>

            {/* Přehnutý roh */}
            <div
                className="absolute bottom-0 right-0 w-6 h-6 pointer-events-none"
                style={{
                    background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.1) 50%)',
                    borderTopLeftRadius: '4px'
                }}
            />
        </div>
    );
};

export default BoardNote;
