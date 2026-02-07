'use client';

import { useEffect } from 'react';
import TransportBar from '@/components/TransportBar';
import MainWorkspace from '@/components/MainWorkspace';
import AgentPanel from '@/components/AgentPanel';
import BottomBar from '@/components/BottomBar';
import { useProjectStore } from '@/stores/projectStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useInstruments } from '@/hooks/useInstruments';

export default function DAW() {
  const { project, addTrack, selectedTrackId, setSelectedTrackId } = useProjectStore();
  useKeyboardShortcuts();
  
  // Initialize synthesizers for all tracks
  useInstruments(project?.tracks || []);

  // Initialize with a default track if none exist
  useEffect(() => {
    if (project && project.tracks.length === 0) {
      addTrack({
        id: 'track-1',
        name: 'Piano',
        color: '#3b82f6',
        type: 'instrument',
        channelRackIds: [],
        instrument: 'piano', // Assign default piano instrument
        mixerChannelId: null,
        mute: false,
        solo: false,
        arm: false,
        volume: 0.5,
        pan: 0,
      });
    }
  }, [project, addTrack]);

  // Auto-select first track if none is selected
  useEffect(() => {
    if (project && project.tracks.length > 0 && !selectedTrackId) {
      setSelectedTrackId(project.tracks[0].id);
    }
  }, [project, selectedTrackId, setSelectedTrackId]);

  return (
    <div className="h-screen w-screen bg-zinc-900 text-white font-sans flex flex-col overflow-hidden">
      {/* Top Transport Bar */}
      <TransportBar />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Center Workspace */}
        <div className="flex-1 min-w-0">
          <MainWorkspace />
        </div>

        <div className="w-1 bg-zinc-800 hover:bg-zinc-700 transition cursor-col-resize flex-shrink-0" />

        {/* Right Agent Panel */}
        <div className="w-80 flex-shrink-0">
          <AgentPanel />
        </div>
      </div>

      {/* Bottom Options Bar */}
      <BottomBar />
    </div>
  );
}
