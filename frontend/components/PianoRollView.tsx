'use client';

import { useProjectStore } from '@/stores/projectStore';
import { Tool } from '@/types/project';
import { useState, useRef, useEffect } from 'react';

const NOTES = [
  'C7', 'B6', 'A#6', 'A6', 'G#6', 'G6', 'F#6', 'F6', 'E6', 'D#6', 'D6', 'C#6', 'C6',
  'B5', 'A#5', 'A5', 'G#5', 'G5', 'F#5', 'F5', 'E5', 'D#5', 'D5', 'C#5', 'C5',
  'B4', 'A#4', 'A4', 'G#4', 'G4', 'F#4', 'F4', 'E4', 'D#4', 'D4', 'C#4', 'C4',
  'B3', 'A#3', 'A3', 'G#3', 'G3', 'F#3', 'F3', 'E3', 'D#3', 'D3', 'C#3', 'C3',
  'B2', 'A#2', 'A2', 'G#2', 'G2', 'F#2', 'F2', 'E2', 'D#2', 'D2', 'C#2', 'C2',
];

const TOOLS = [
  'select',
  'draw',
  'erase',
  'slice',
];

const SNAPGRID_TO_FRACTION: { [key: string]: number } = {
  '1/4': 4,
  '1/8': 8,
  '1/16': 16,
  '1/32': 32,
};

const NOTE_TO_MIDI: { [key: string]: number } = {};
NOTES.forEach((note, index) => {
  NOTE_TO_MIDI[note] = 24 + (NOTES.length - 1 - index);
});

export default function PianoRollView() {
  const { 
    project, 
    selectedTool, 
    selectedTrackId, 
    setSelectedTool, 
    snapGrid, 
    songLength,
    addMidiClip,
    updateMidiClip,
    addArrangementClip,
  } = useProjectStore();
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastProcessedCell, setLastProcessedCell] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  if (!project) return null;

  const selectedTrack = selectedTrackId ? project.tracks.find((t) => t.id === selectedTrackId) : null;
  
  // Find the first MIDI clip for the selected track
  const trackMidiClips = selectedTrack
    ? project.arrangementClips
        .filter((c) => c.trackId === selectedTrack.id && c.clipType === 'midi')
        .map((c) => project.midiClips.find((mc) => mc.id === c.clipDataId))
        .filter((mc): mc is NonNullable<typeof mc> => mc !== undefined)
    : [];
  
  const activeClip = selectedClip 
    ? project.midiClips.find((c) => c.id === selectedClip)
    : trackMidiClips[0] || null;

  const ticksPerBar = 1920;
  const pixelsPerBar = (24 * 4) / SNAPGRID_TO_FRACTION[snapGrid];
  const noteHeight = 24;
  const totalNotesHeight = NOTES.length * noteHeight;
  const ticksPerStep = ticksPerBar / SNAPGRID_TO_FRACTION[snapGrid];

  // Ensure we have a clip to work with
  const ensureActiveClip = () => {
    if (!selectedTrack) return null;
    
    if (activeClip) return activeClip;
    
    // Create a new clip if none exists
    const newClipId = `clip-${Date.now()}`;
    const newClip = {
      id: newClipId,
      trackId: selectedTrack.id,
      startBar: 0,
      lengthBars: songLength,
      notes: [],
    };
    
    addMidiClip(newClip);
    
    const newArrangementClip = {
      id: `arr-${Date.now()}`,
      trackId: selectedTrack.id,
      startBar: 0,
      lengthBars: songLength,
      clipType: 'midi' as const,
      clipDataId: newClipId,
    };
    
    addArrangementClip(newArrangementClip);
    setSelectedClip(newClipId);
    
    return newClip;
  };

  // Get cell key for tracking processed cells during drag
  const getCellKey = (noteIndex: number, tick: number): string => {
    return `${noteIndex}-${tick}`;
  };

  // Add note at a specific position
  const addNoteAtPosition = (noteIndex: number, tick: number) => {
    const clip = ensureActiveClip();
    if (!clip) return;

    const pitch = NOTE_TO_MIDI[NOTES[noteIndex]];
    const noteDuration = ticksPerStep; // One grid step duration
    
    // Check if note already exists at this exact position
    const existingNote = clip.notes.find(
      (n) => n.pitch === pitch && Math.abs(n.startTick - tick) < ticksPerStep / 2
    );
    
    if (!existingNote) {
      const newNote = {
        pitch,
        startTick: tick,
        durationTick: noteDuration,
        velocity: 100,
        channel: 0,
      };
      
      updateMidiClip(clip.id, {
        notes: [...clip.notes, newNote],
      });
    }
  };

  // Remove note at a specific position
  const removeNoteAtPosition = (noteIndex: number, tick: number) => {
    const clip = activeClip;
    if (!clip) return;

    const pitch = NOTE_TO_MIDI[NOTES[noteIndex]];
    
    // Find and remove notes at this position
    const updatedNotes = clip.notes.filter(
      (n) => !(n.pitch === pitch && Math.abs(n.startTick - tick) < ticksPerStep / 2)
    );
    
    if (updatedNotes.length !== clip.notes.length) {
      updateMidiClip(clip.id, { notes: updatedNotes });
    }
  };

  const handleMouseDown = (noteIndex: number, tick: number) => {
    if (!selectedTrack || (selectedTool !== 'draw' && selectedTool !== 'erase')) return;
    
    setIsDragging(true);
    setLastProcessedCell(null);
    
    const clip = ensureActiveClip();
    if (!clip) return;

    const cellKey = getCellKey(noteIndex, tick);
    setLastProcessedCell(cellKey);

    if (selectedTool === 'draw') {
      addNoteAtPosition(noteIndex, tick);
    } else if (selectedTool === 'erase') {
      removeNoteAtPosition(noteIndex, tick);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !gridRef.current || !selectedTrack) return;
    if (selectedTool !== 'draw' && selectedTool !== 'erase') return;

    const rect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate note index from Y position
    const noteIndex = Math.floor(y / noteHeight);
    if (noteIndex < 0 || noteIndex >= NOTES.length) return;

    // Calculate step index from X position
    const stepIndex = Math.floor(x / pixelsPerBar);
    if (stepIndex < 0 || stepIndex >= songLength * SNAPGRID_TO_FRACTION[snapGrid]) return;

    // Calculate tick for this step
    const tick = (stepIndex * ticksPerBar) / SNAPGRID_TO_FRACTION[snapGrid];
    const cellKey = getCellKey(noteIndex, tick);

    // Only process if we haven't already processed this cell
    if (cellKey !== lastProcessedCell) {
      setLastProcessedCell(cellKey);

      if (selectedTool === 'draw') {
        addNoteAtPosition(noteIndex, tick);
      } else if (selectedTool === 'erase') {
        removeNoteAtPosition(noteIndex, tick);
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setLastProcessedCell(null);
  };

  // Update activeClip reference when project updates
  useEffect(() => {
    if (selectedClip) {
      const clip = project.midiClips.find((c) => c.id === selectedClip);
      if (!clip) setSelectedClip(null);
    } else if (selectedTrack && trackMidiClips.length > 0) {
      const firstArrClip = project.arrangementClips.find(
        (c) => c.trackId === selectedTrack.id && c.clipType === 'midi'
      );
      if (firstArrClip) {
        setSelectedClip(firstArrClip.clipDataId);
      }
    }
  }, [project.midiClips, project.arrangementClips, selectedTrack, selectedClip, trackMidiClips]);

  return (
    <div className="h-full bg-black flex flex-col">
      {/* Toolbar */}
      <div className="h-10 bg-zinc-900 border-b border-zinc-700 flex items-center gap-2 px-4 flex-shrink-0">
        <div className="flex-1 text-sm text-zinc-400">
          {selectedTrack ? `Editing: ${selectedTrack.name}` : 'No track selected'}
        </div>
        {TOOLS.map((tool) => (
          <button key={tool} className={`px-3 py-1 rounded text-sm ${
            selectedTool === tool 
              ? 'bg-zinc-700' 
              : 'bg-zinc-800 hover:bg-zinc-700'
          }`} 
          onClick={() => setSelectedTool(tool as Tool)}
        >
          {tool.charAt(0).toUpperCase() + tool.slice(1)}
        </button>
        ))}
      </div>

      {/* Piano Roll Grid */}
      <div className="flex-1 overflow-y-auto overflow-x-auto">
        {!selectedTrack ? (
          <div className="h-full flex items-center justify-center text-zinc-500">
            <div className="text-center">
              <p className="text-lg mb-2">No track selected</p>
              <p className="text-sm">Select a track in the Playlist to start editing</p>
            </div>
          </div>
        ) : (
          <div className="flex" style={{ height: totalNotesHeight }}>
          {/* Piano Keys */}
          <div className="w-16 bg-zinc-900 border-r border-zinc-700 flex-shrink-0" style={{ height: totalNotesHeight }}>
            {NOTES.map((note, index) => {
              const isBlack = note.includes('#');
              return (
                <div
                  key={index}
                  className={`border-b border-zinc-800 flex items-center justify-center text-xs ${
                    isBlack ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-900 text-zinc-300'
                  }`}
                  style={{ height: `${noteHeight}px` }}
                >
                  {note}
                </div>
              );
            })}
          </div>

          {/* Note Grid */}
          <div className="flex-1 relative" style={{ height: totalNotesHeight }}>
            {/* Grid Lines */}
            {Array.from({ length: songLength * SNAPGRID_TO_FRACTION[snapGrid] }, (_, i) => (
              <div
                key={i}
                className="absolute border-l border-zinc-800"
                style={{ left: `${pixelsPerBar * i}px`, height: '100%' }}
              />
            ))}

            {/* Notes */}
            {activeClip && (() => {
              const clip = activeClip;
              if (!clip) return null;
              const ticksPerStep = ticksPerBar / SNAPGRID_TO_FRACTION[snapGrid];
              return clip.notes.map((note, index) => {
                const noteIndex = NOTES.findIndex((n) => NOTE_TO_MIDI[n] === note.pitch);
                if (noteIndex === -1) return null;
                const stepPosition = note.startTick / ticksPerStep;
                const stepDuration = note.durationTick / ticksPerStep;
                return (
                  <div
                    key={index}
                    className="absolute bg-blue-500 border border-blue-400 cursor-move"
                    style={{
                      top: `${noteIndex * noteHeight}px`,
                      left: `${stepPosition * pixelsPerBar}px`,
                      width: `${stepDuration * pixelsPerBar}px`,
                      height: `${noteHeight - 2}px`,
                    }}
                  />
                );
              });
            })()}

            {/* Clickable Grid */}
            <div 
              ref={gridRef}
              className="absolute inset-0"
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onMouseMove={handleMouseMove}
            >
              {NOTES.map((_, noteIndex) => (
                <div 
                  key={noteIndex} 
                  className="absolute w-full" 
                  style={{ top: `${noteIndex * noteHeight}px`, height: `${noteHeight}px` }}
                >
                  {Array.from({ length: songLength * SNAPGRID_TO_FRACTION[snapGrid] }, (_, stepIndex) => {
                    const tick = (stepIndex * ticksPerBar) / SNAPGRID_TO_FRACTION[snapGrid];
                    return (
                      <div
                        key={stepIndex}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleMouseDown(noteIndex, tick);
                        }}
                        className={`absolute border-b border-r border-zinc-800 ${
                          selectedTool === 'draw' || selectedTool === 'erase'
                            ? 'hover:bg-zinc-900/50 cursor-crosshair'
                            : 'hover:bg-zinc-900/30 cursor-pointer'
                        }`}
                        style={{
                          left: `${stepIndex * pixelsPerBar}px`,
                          width: `${pixelsPerBar}px`,
                          height: '100%',
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
