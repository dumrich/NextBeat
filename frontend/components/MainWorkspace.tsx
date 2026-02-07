'use client';

import { useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import PlaylistView from './PlaylistView';
import PianoRollView from './PianoRollView';
import TrackBrowserModal from './TrackBrowserModal';

export default function MainWorkspace() {
  const { currentView } = useProjectStore();
  const [isTrackModalOpen, setIsTrackModalOpen] = useState(false);

  const renderView = () => {
    switch (currentView) {
      case 'playlist':
        return <PlaylistView />;
      case 'pianoRoll':
        return <PianoRollView />;
      default:
        return <PlaylistView />;
    }
  };

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden h-full">
        {/* View Tabs */}
        <div className="h-10 bg-zinc-900 border-b border-zinc-700 flex items-center gap-1 px-2 flex-shrink-0">
          <ViewTab view="playlist" label="Playlist" />
          <ViewTab view="pianoRoll" label="Piano Roll" />
          <div className="ml-auto">
            <button
              onClick={() => setIsTrackModalOpen(true)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition"
            >
              + Add Track
            </button>
          </div>
        </div>

        {/* View Content */}
        <div className="flex-1 min-h-0">{renderView()}</div>
      </div>
      <TrackBrowserModal
        isOpen={isTrackModalOpen}
        onClose={() => setIsTrackModalOpen(false)}
      />
    </>
  );
}

function ViewTab({ view, label }: { view: string; label: string }) {
  const { currentView, setCurrentView } = useProjectStore();
  return (
    <button
      onClick={() => setCurrentView(view as any)}
      className={`px-4 py-2 text-sm transition ${
        currentView === view
          ? 'bg-zinc-800 text-white border-b-2 border-blue-500'
          : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
      }`}
    >
      {label}
    </button>
  );
}
