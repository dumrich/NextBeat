'use client';

import { useState, useEffect } from 'react';
import { Trash2, Volume2, Palette, Edit, Copy } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import type { Track } from '@/types/project';

interface TrackSettingsModalProps {
  isOpen: boolean;
  track: Track | null;
  onClose: () => void;
}

export default function TrackSettingsModal({ isOpen, track, onClose }: TrackSettingsModalProps) {
  const { updateTrack, deleteTrack, addTrack } = useProjectStore();
  const [newName, setNewName] = useState('');
  const [velocity, setVelocity] = useState(50);

  useEffect(() => {
    if (track) {
      setNewName(track.name);
      setVelocity(Math.round(track.volume * 100));
    }
  }, [track]);

  if (!isOpen || !track) return null;

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete "${track.name}"?`)) {
      deleteTrack(track.id);
      onClose();
    }
  };

  const handleRename = () => {
    if (newName.trim() && newName !== track.name) {
      updateTrack(track.id, { name: newName.trim() });
    }
  };

  const handleVelocityChange = (newVelocity: number) => {
    const clampedVelocity = Math.max(0, Math.min(100, newVelocity));
    setVelocity(clampedVelocity);
    updateTrack(track.id, { volume: clampedVelocity / 100 });
  };

  const handleColorChange = (color: string) => {
    updateTrack(track.id, { color });
  };

  const presetColors = [
    '#3b82f6', // blue
    '#8b5cf6', // purple
    '#10b981', // green
    '#f59e0b', // amber
    '#ec4899', // pink
    '#f97316', // orange
    '#ef4444', // red
    '#6b7280', // gray
  ];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Track Settings</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Track Name Display */}
          <div className="flex items-center gap-3">
            <div
              className="w-6 h-6 rounded flex-shrink-0"
              style={{ backgroundColor: track.color }}
            />
            <span className="text-lg font-medium text-white">{track.name}</span>
          </div>

          {/* Rename Section */}
          <div>
            <label className="flex items-center gap-2 mb-2 text-sm text-zinc-300">
              <Edit className="w-4 h-4" />
              Track Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') {
                  setNewName(track.name);
                }
              }}
              onBlur={handleRename}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
            />
          </div>

          {/* Volume Control */}
          <div>
            <label className="flex items-center gap-2 mb-2 text-sm text-zinc-300">
              <Volume2 className="w-4 h-4" />
              Volume: {velocity}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={velocity}
              onChange={(e) => handleVelocityChange(parseInt(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Color Picker */}
          <div>
            <label className="flex items-center gap-2 mb-3 text-sm text-zinc-300">
              <Palette className="w-4 h-4" />
              Track Color
            </label>
            <div className="grid grid-cols-4 gap-3">
              {presetColors.map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorChange(color)}
                  className={`w-12 h-12 rounded border-2 transition ${
                    track.color === color ? 'border-white scale-110' : 'border-zinc-600 hover:border-zinc-400'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-2 border-t border-zinc-700">
            <button
              onClick={() => {
                const newTrackId = `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                addTrack({
                  ...track,
                  id: newTrackId,
                  name: `${track.name} (Copy)`,
                  mixerChannelId: null,
                });
                onClose();
              }}
              className="w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-sm text-zinc-300 hover:text-white flex items-center gap-2 transition"
            >
              <Copy className="w-4 h-4" />
              Duplicate Track
            </button>

            <button
              onClick={handleDelete}
              className="w-full px-4 py-2 bg-red-900/20 hover:bg-red-900/30 rounded text-sm text-red-400 hover:text-red-300 flex items-center gap-2 transition"
            >
              <Trash2 className="w-4 h-4" />
              Delete Track
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
