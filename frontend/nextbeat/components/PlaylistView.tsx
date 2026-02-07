'use client';

import { useProjectStore } from '@/stores/projectStore';
import { useState } from 'react';
import { Settings } from 'lucide-react';
import TrackSettingsModal from './TrackSettingsMenu';

export default function PlaylistView() {
  const { project, playheadPosition, updateTrack, selectedTrackId, setSelectedTrackId } = useProjectStore();
  const [zoom, setZoom] = useState(1);
  const [scrollX, setScrollX] = useState(0);
  const [settingsTrackId, setSettingsTrackId] = useState<string | null>(null);

  if (!project) return null;

  const barsToPixels = (bars: number) => bars * 100 * zoom;
  const pixelsToBars = (pixels: number) => pixels / (100 * zoom);

  const handleClipClick = (clipId: string) => {
    // Handle clip selection
  };

  const handleClipDrag = (clipId: string, newStartBar: number) => {
    // Handle clip movement
  };

  return (
    <div className="h-full bg-black flex flex-col">
      {/* Timeline Header */}
      <div className="h-12 bg-zinc-900 border-b border-zinc-700 flex items-center flex-shrink-0">
        <div className="w-48 border-r border-zinc-700 px-4 text-sm text-zinc-400">Timeline</div>
        <div className="flex-1 relative overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              transform: `translateX(-${scrollX}px)`,
            }}
          >
            {Array.from({ length: 32 }, (_, i) => (
              <div
                key={i}
                className="absolute border-l border-zinc-700"
                style={{ left: `${barsToPixels(i)}px`, height: '100%' }}
              >
                <span className="absolute top-1 left-1 text-xs text-zinc-500">{i + 1}</span>
              </div>
            ))}
            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white z-10"
              style={{ left: `${barsToPixels(playheadPosition)}px` }}
            />
          </div>
        </div>
      </div>

      {/* Tracks */}
      <div className="flex-1 overflow-auto">
        {project.tracks.map((track) => {
          const trackClips = project.arrangementClips.filter((c) => c.trackId === track.id);
          return (
            <div 
              key={track.id} 
              className={`h-20 border-b border-zinc-800 flex cursor-pointer transition ${
                selectedTrackId === track.id ? 'bg-zinc-950' : ''
              }`}
              onClick={() => setSelectedTrackId(track.id)}
            >
              {/* Track Header */}
              <div className={`w-48 border-r border-zinc-700 p-2 flex items-center gap-2 flex-shrink-0 relative transition ${
                selectedTrackId === track.id 
                  ? 'bg-zinc-800 border-blue-500' 
                  : 'bg-zinc-900'
              }`}>
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: track.color }}
                />
                <span className="text-sm text-white flex-1 truncate">{track.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateTrack(track.id, { mute: !track.mute });
                  }}
                  className={`text-xs font-medium transition px-1.5 py-0.5 rounded ${
                    track.mute
                      ? 'bg-red-600 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                  title="Mute"
                >
                  M
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateTrack(track.id, { solo: !track.solo });
                  }}
                  className={`text-xs font-medium transition px-1.5 py-0.5 rounded ${
                    track.solo
                      ? 'bg-yellow-600 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                  title="Solo"
                >
                  S
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSettingsTrackId(track.id);
                  }}
                  className="text-zinc-400 hover:text-white transition p-1"
                  title="Track Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>

              {/* Track Content */}
              <div className="flex-1 relative overflow-hidden">
                <div
                  className="absolute inset-0"
                  style={{
                    transform: `translateX(-${scrollX}px)`,
                  }}
                >
                  {/* Grid Lines */}
                  {Array.from({ length: 32 }, (_, i) => (
                    <div
                      key={i}
                      className="absolute border-l border-zinc-800"
                      style={{ left: `${barsToPixels(i)}px`, height: '100%' }}
                    />
                  ))}

                  {/* Clips */}
                  {trackClips.map((clip) => {
                    const clipData = clip.clipType === 'midi'
                      ? project.midiClips.find((c) => c.id === clip.clipDataId)
                      : null;
                    return (
                      <div
                        key={clip.id}
                        onClick={() => handleClipClick(clip.id)}
                        className="absolute top-2 bottom-2 bg-blue-600 hover:bg-blue-500 border border-blue-400 rounded cursor-move flex items-center px-2"
                        style={{
                          left: `${barsToPixels(clip.startBar)}px`,
                          width: `${barsToPixels(clip.lengthBars)}px`,
                        }}
                      >
                        <span className="text-xs text-white truncate">
                          {clip.clipType === 'midi' ? 'MIDI' : 'Pattern'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Zoom Controls */}
      <div className="h-8 bg-zinc-900 border-t border-zinc-700 flex items-center justify-end px-4 gap-2 flex-shrink-0">
        <button
          onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
          className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-sm"
        >
          −
        </button>
        <span className="text-xs text-zinc-400">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(Math.min(4, zoom + 0.25))}
          className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-sm"
        >
          +
        </button>
      </div>

      {/* Track Settings Modal */}
      <TrackSettingsModal
        isOpen={settingsTrackId !== null}
        track={settingsTrackId ? project.tracks.find((t) => t.id === settingsTrackId) || null : null}
        onClose={() => setSettingsTrackId(null)}
      />
    </div>
  );
}
