'use client';

import { useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';

type InstrumentType = 'instrument' | 'drums' | 'automation';

interface AvailableTrack {
  id: string;
  name: string;
  type: InstrumentType;
  color: string;
  description?: string;
}

const AVAILABLE_TRACKS: AvailableTrack[] = [
  { id: 'piano', name: 'Piano', type: 'instrument', color: '#3b82f6', description: 'Acoustic piano' },
  { id: 'synth', name: 'Synthesizer', type: 'instrument', color: '#8b5cf6', description: 'Digital synthesizer' },
  { id: 'bass', name: 'Bass', type: 'instrument', color: '#10b981', description: 'Electric bass' },
  { id: 'guitar', name: 'Guitar', type: 'instrument', color: '#f59e0b', description: 'Electric guitar' },
  { id: 'strings', name: 'Strings', type: 'instrument', color: '#ec4899', description: 'String ensemble' },
  { id: 'brass', name: 'Brass', type: 'instrument', color: '#f97316', description: 'Brass section' },
  { id: 'drums', name: 'Drum Kit', type: 'drums', color: '#ef4444', description: 'Drum machine' },
  { id: 'percussion', name: 'Percussion', type: 'drums', color: '#dc2626', description: 'Percussion instruments' },
  { id: 'automation', name: 'Automation', type: 'automation', color: '#6b7280', description: 'Automation lane' },
];

interface TrackBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TrackBrowserModal({ isOpen, onClose }: TrackBrowserModalProps) {
  const { addTrack } = useProjectStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<InstrumentType | 'all'>('all');

  if (!isOpen) return null;

  const handleAddTrack = (track: AvailableTrack) => {
    addTrack({
      id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: track.name,
      color: track.color,
      type: track.type,
      channelRackIds: [],
      instrument: track.id,
      mixerChannelId: null,
      mute: false,
      solo: false,
      arm: false,
      volume: 0.5,
      pan: 0,
    });
    onClose();
  };

  const filteredTracks = AVAILABLE_TRACKS.filter((track) => {
    const matchesSearch = track.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      track.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedType === 'all' || track.type === selectedType;
    return matchesSearch && matchesType;
  });

  const getTypeLabel = (type: InstrumentType) => {
    switch (type) {
      case 'instrument':
        return 'Instrument';
      case 'drums':
        return 'Drums';
      case 'automation':
        return 'Automation';
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Add Track</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Search and Filters */}
        <div className="p-4 border-b border-zinc-700 space-y-3">
          <input
            type="text"
            placeholder="Search tracks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedType('all')}
              className={`px-3 py-1 rounded text-xs transition ${
                selectedType === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSelectedType('instrument')}
              className={`px-3 py-1 rounded text-xs transition ${
                selectedType === 'instrument'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              Instruments
            </button>
            <button
              onClick={() => setSelectedType('drums')}
              className={`px-3 py-1 rounded text-xs transition ${
                selectedType === 'drums'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              Drums
            </button>
            <button
              onClick={() => setSelectedType('automation')}
              className={`px-3 py-1 rounded text-xs transition ${
                selectedType === 'automation'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              Automation
            </button>
          </div>
        </div>

        {/* Track List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredTracks.length === 0 ? (
            <div className="text-center text-zinc-500 py-8">
              No tracks found matching your search.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTracks.map((track) => (
                <button
                  key={track.id}
                  onClick={() => handleAddTrack(track)}
                  className="w-full p-3 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 hover:border-zinc-600 transition flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded flex-shrink-0"
                      style={{ backgroundColor: track.color }}
                    />
                    <div className="text-left">
                      <div className="text-white font-medium group-hover:text-blue-400 transition">
                        {track.name}
                      </div>
                      {track.description && (
                        <div className="text-xs text-zinc-400">{track.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500 bg-zinc-700 px-2 py-1 rounded">
                    {getTypeLabel(track.type)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
