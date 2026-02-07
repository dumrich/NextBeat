'use client';

import { useProjectStore } from '@/stores/projectStore';
import { Tool } from '@/types/project';
import { useState, useRef, useEffect } from 'react';
import { useInstruments } from '@/hooks/useInstruments';

const NOTES = [
  'C7',
  'B6', 'A#6', 'A6', 'G#6', 'G6', 'F#6', 'F6', 'E6', 'D#6', 'D6', 'C#6', 'C6',
  'B5', 'A#5', 'A5', 'G#5', 'G5', 'F#5', 'F5', 'E5', 'D#5', 'D5', 'C#5', 'C5',
  'B4', 'A#4', 'A4', 'G#4', 'G4', 'F#4', 'F4', 'E4', 'D#4', 'D4', 'C#4', 'C4',
  'B3', 'A#3', 'A3', 'G#3', 'G3', 'F#3', 'F3', 'E3', 'D#3', 'D3', 'C#3', 'C3',
  'B2', 'A#2', 'A2', 'G#2', 'G2', 'F#2', 'F2', 'E2', 'D#2', 'D2', 'C#2', 'C2',
];

const TOOLS = [
  'select',
  'draw',
  'erase'
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
    playheadPosition,
    isPlaying,
    addMidiClip,
    updateMidiClip,
    updateMidiClipNoHistory,
    addArrangementClip,
    saveHistorySnapshot,
    undo,
    canUndo,
  } = useProjectStore();
  const [isDragging, setIsDragging] = useState(false);
  const [lastProcessedCell, setLastProcessedCell] = useState<string | null>(null);
  const [selectedNoteIndices, setSelectedNoteIndices] = useState<Set<number>>(new Set());
  const [draggedNoteIndex, setDraggedNoteIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [originalNotePosition, setOriginalNotePosition] = useState<{ pitch: number; startTick: number } | null>(null);
  const [originalNotesPositions, setOriginalNotesPositions] = useState<Map<number, { pitch: number; startTick: number }>>(new Map());
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [velocityEditNote, setVelocityEditNote] = useState<{ index: number; velocity: number } | null>(null);
  
  // Sustained note creation state
  const [isCreatingSustainedNote, setIsCreatingSustainedNote] = useState(false);
  const [sustainedNoteStartTick, setSustainedNoteStartTick] = useState<number | null>(null);
  const [sustainedNoteIndex, setSustainedNoteIndex] = useState<number | null>(null); // Index in clip.notes array
  
  // Box selection state
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [boxSelectStart, setBoxSelectStart] = useState<{ x: number; y: number } | null>(null);
  const [boxSelectEnd, setBoxSelectEnd] = useState<{ x: number; y: number } | null>(null);
  
  const gridRef = useRef<HTMLDivElement>(null);
  const dragPositionRef = useRef<{ x: number; y: number } | null>(null);
  const { playNote } = useInstruments(project?.tracks || []);

  if (!project) return null;

  const selectedTrack = selectedTrackId ? project.tracks.find((t) => t.id === selectedTrackId) : null;
  
  // Find the first MIDI clip for the selected track
  const trackMidiClips = selectedTrack
    ? project.arrangementClips
        .filter((c) => c.trackId === selectedTrack.id && c.clipType === 'midi')
        .map((c) => project.midiClips.find((mc) => mc.id === c.clipDataId))
        .filter((mc): mc is NonNullable<typeof mc> => mc !== undefined)
    : [];
  
  // Always use the first MIDI clip for the selected track
  const activeClip = trackMidiClips[0] || null;

  const ticksPerBar = 1920;
  const pixelsPerBar = (24 * 4) / SNAPGRID_TO_FRACTION[snapGrid];
  const noteHeight = 24;
  const totalNotesHeight = NOTES.length * noteHeight;
  const ticksPerStep = ticksPerBar / SNAPGRID_TO_FRACTION[snapGrid];

  // Handle erasing all notes
  const handleEraseAll = () => {
    if (!activeClip) return;
    updateMidiClip(activeClip.id, { notes: [] });
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      // Tool switching shortcuts (only when no modifiers are pressed)
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          setSelectedTool('select');
          return;
        }
        if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          setSelectedTool('draw');
          return;
        }
        if (e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          setSelectedTool('erase');
          return;
        }
      }

      // Undo shortcut (disabled - undo functionality not implemented)
      // if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      //   e.preventDefault();
      //   undo();
      // }

      // Ctrl/Cmd + E: Erase All
      if ((e.metaKey || e.ctrlKey) && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        handleEraseAll();
      }
      
      // Delete selected notes
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedTool === 'select' && selectedNoteIndices.size > 0 && activeClip) {
          e.preventDefault();
          const updatedNotes = activeClip.notes.filter((_, index) => !selectedNoteIndices.has(index));
          updateMidiClip(activeClip.id, { notes: updatedNotes });
          setSelectedNoteIndices(new Set());
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTool, selectedNoteIndices, activeClip, updateMidiClip, setSelectedTool, handleEraseAll]);

  // Ensure we have a clip to work with
  const ensureActiveClip = () => {
    if (!selectedTrack) return null;
    
    // Check if a clip already exists for this track (check store directly to avoid stale closures)
    const currentState = useProjectStore.getState();
    const currentProject = currentState.project;
    if (!currentProject) return null;
    
    const existingArrClip = currentProject.arrangementClips.find(
      (c) => c.trackId === selectedTrack.id && c.clipType === 'midi'
    );
    
    if (existingArrClip) {
      const existingClip = currentProject.midiClips.find((c) => c.id === existingArrClip.clipDataId);
      if (existingClip) {
        return existingClip;
      }
    }
    
    // Create a new clip if none exists
    // Use timestamp + random to ensure uniqueness
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const newClipId = `clip-${timestamp}-${random}`;
    const newClip = {
      id: newClipId,
      trackId: selectedTrack.id,
      startBar: 0,
      lengthBars: songLength,
      notes: [],
    };
    
    addMidiClip(newClip);
    
    const newArrangementClip = {
      id: `arr-${timestamp}-${random}`,
      trackId: selectedTrack.id,
      startBar: 0,
      lengthBars: songLength,
      clipType: 'midi' as const,
      clipDataId: newClipId,
    };
    
    addArrangementClip(newArrangementClip);
    
    return newClip;
  };

  // Get cell key for tracking processed cells during drag
  const getCellKey = (noteIndex: number, tick: number): string => {
    return `${noteIndex}-${tick}`;
  };

  // Add note at a specific position
  const addNoteAtPosition = (noteIndex: number, tick: number, duration?: number, addToHistory: boolean = true) => {
    const clip = ensureActiveClip();
    if (!clip) return null;

    const pitch = NOTE_TO_MIDI[NOTES[noteIndex]];
    const noteDuration = duration || ticksPerStep; // One grid step duration by default
    
    // Check if note already exists at this exact position
    const existingNoteIndex = clip.notes.findIndex(
      (n) => n.pitch === pitch && Math.abs(n.startTick - tick) < ticksPerStep / 2
    );
    
    if (existingNoteIndex === -1) {
      const newNote = {
        pitch,
        startTick: tick,
        durationTick: noteDuration,
        velocity: 100,
        channel: 0,
      };
      
      // Use appropriate update method based on whether to add to history
      if (addToHistory) {
        updateMidiClip(clip.id, {
          notes: [...clip.notes, newNote],
        });
      } else {
        updateMidiClipNoHistory(clip.id, {
          notes: [...clip.notes, newNote],
        });
      }
      
      // Return the index where the note will be added
      return clip.notes.length;
    }
    
    return null;
  };

  // Remove note at a specific position
  const removeNoteAtPosition = (noteIndex: number, tick: number) => {
    const clip = activeClip;
    if (!clip) return;

    const pitch = NOTE_TO_MIDI[NOTES[noteIndex]];
    
    // Find and remove notes where the clicked position falls within the note's duration
    const updatedNotes = clip.notes.filter(
      (n) => {
        if (n.pitch !== pitch) return true;
        // Check if tick falls within the note's duration range
        const noteStart = n.startTick;
        const noteEnd = n.startTick + n.durationTick;
        return !(tick >= noteStart && tick < noteEnd);
      }
    );
    
    if (updatedNotes.length !== clip.notes.length) {
      updateMidiClip(clip.id, { notes: updatedNotes });
    }
  };

  // Find note at a given position (grid cell)
  const findNoteAtPosition = (noteIndex: number, tick: number): number | null => {
    if (!activeClip) return null;
    const pitch = NOTE_TO_MIDI[NOTES[noteIndex]];
    const noteIndexInClip = activeClip.notes.findIndex(
      (n) => n.pitch === pitch && Math.abs(n.startTick - tick) < ticksPerStep / 2
    );
    return noteIndexInClip >= 0 ? noteIndexInClip : null;
  };

  // Check if a position has a note (excluding the dragged note)
  const hasNoteAtPosition = (pitch: number, tick: number, excludeIndex: number | null): boolean => {
    if (!activeClip) return false;
    return activeClip.notes.some((note, index) => {
      if (excludeIndex !== null && index === excludeIndex) return false;
      return note.pitch === pitch && Math.abs(note.startTick - tick) < ticksPerStep / 2;
    });
  };

  const handleMouseDown = (noteIndex: number, tick: number, e: React.MouseEvent) => {
    if (!selectedTrack || !selectedTrackId) return;
    
    // Handle select mode
    if (selectedTool === 'select') {
      const foundNoteIndex = findNoteAtPosition(noteIndex, tick);
      
      if (foundNoteIndex !== null) {
        // Clicked on a note - start dragging
        if (e.button === 0) { // Left click
          // If not already selected, select only this note
          if (!selectedNoteIndices.has(foundNoteIndex)) {
            setSelectedNoteIndices(new Set([foundNoteIndex]));
          }
          
          // Store original positions for all selected notes
          const originalPositions = new Map<number, { pitch: number; startTick: number }>();
          selectedNoteIndices.forEach(index => {
            const note = activeClip!.notes[index];
            if (note) {
              originalPositions.set(index, { pitch: note.pitch, startTick: note.startTick });
            }
          });
          // Also add the clicked note if it wasn't already selected
          if (!selectedNoteIndices.has(foundNoteIndex)) {
            const note = activeClip!.notes[foundNoteIndex];
            originalPositions.set(foundNoteIndex, { pitch: note.pitch, startTick: note.startTick });
          }
          setOriginalNotesPositions(originalPositions);
          
          const note = activeClip!.notes[foundNoteIndex];
          
          // Store original position for the dragged note
          setOriginalNotePosition({
            pitch: note.pitch,
            startTick: note.startTick,
          });
          
          setIsDragging(true);
          setDraggedNoteIndex(foundNoteIndex);
          
          // Calculate drag offset from note top-left corner
          const noteNoteIndex = NOTES.findIndex((n) => NOTE_TO_MIDI[n] === note.pitch);
          const stepPosition = note.startTick / ticksPerStep;
          const noteX = stepPosition * pixelsPerBar;
          const noteY = noteNoteIndex * noteHeight;
          
          const rect = gridRef.current?.getBoundingClientRect();
          if (rect) {
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            setDragOffset({
              x: mouseX - noteX,
              y: mouseY - noteY,
            });
            setDragPosition({
              x: noteX,
              y: noteY,
            });
          }
        } else if (e.button === 2) { // Right click
          // Right click on note - open velocity editor
          e.preventDefault();
          const note = activeClip!.notes[foundNoteIndex];
          setVelocityEditNote({ index: foundNoteIndex, velocity: note.velocity });
        }
      } else {
        // Clicked on empty space - start box selection
        if (e.button === 0) { // Left click
          const rect = gridRef.current?.getBoundingClientRect();
          if (rect) {
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            setIsBoxSelecting(true);
            setBoxSelectStart({ x: mouseX, y: mouseY });
            setBoxSelectEnd({ x: mouseX, y: mouseY });
            setIsDragging(true);
            setSelectedNoteIndices(new Set()); // Clear current selection
          }
        }
      }
      return;
    }
    
    // Don't play note preview when erasing
    if (selectedTool !== 'erase') {
      // Check if there's already a note at this position
      const pitch = NOTE_TO_MIDI[NOTES[noteIndex]];
      const hasExistingNote = activeClip?.notes.some(
        (n) => n.pitch === pitch && Math.abs(n.startTick - tick) < ticksPerStep / 2
      );
      
      // Only play preview if there's no existing note
      if (!hasExistingNote) {
        const noteName = NOTES[noteIndex];
        const snapGridFraction = SNAPGRID_TO_FRACTION[snapGrid];
        const duration = `${snapGridFraction}n`; // e.g., "16n" for 1/16
        // Play at 50% velocity (64 out of 127)
        playNote(selectedTrackId, noteName, duration, undefined, 64);
      }
    }
    
    if (selectedTool !== 'draw' && selectedTool !== 'erase') return;
    
    setIsDragging(true);
    setLastProcessedCell(null);
    
    const clip = ensureActiveClip();
    if (!clip) return;

    const cellKey = getCellKey(noteIndex, tick);
    setLastProcessedCell(cellKey);

    if (selectedTool === 'draw') {
      // Save history snapshot before creating note
      saveHistorySnapshot();
      
      // Create a sustained note (full grid step duration) without adding to history
      const sustainedDuration = ticksPerStep;
      const newNoteIndex = addNoteAtPosition(noteIndex, tick, sustainedDuration, false);
      
      // Start tracking for potential extended sustained note creation
      if (newNoteIndex !== null) {
        setIsCreatingSustainedNote(true);
        setSustainedNoteStartTick(tick);
        setSustainedNoteIndex(newNoteIndex);
      }
    } else if (selectedTool === 'erase') {
      removeNoteAtPosition(noteIndex, tick);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !gridRef.current || !selectedTrack || !selectedTrackId) return;
    
    // Handle box selection in select mode
    if (selectedTool === 'select' && isBoxSelecting && boxSelectStart) {
      const rect = gridRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      setBoxSelectEnd({ x: mouseX, y: mouseY });
      return;
    }
    
    // Handle sustained note extension in draw mode
    if (selectedTool === 'draw' && isCreatingSustainedNote && sustainedNoteIndex !== null && sustainedNoteStartTick !== null && activeClip) {
      const rect = gridRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      
      // Calculate current tick position
      const stepIndex = Math.floor(x / pixelsPerBar);
      const currentTick = (stepIndex * ticksPerBar) / SNAPGRID_TO_FRACTION[snapGrid];
      
      // Calculate duration from start to current position
      let newDuration = currentTick - sustainedNoteStartTick + ticksPerStep;
      
      // Ensure minimum duration (one full step)
      const minDuration = ticksPerStep;
      newDuration = Math.max(minDuration, newDuration);
      
      // Update the note's duration without adding to history (live drag)
      const updatedNotes = [...activeClip.notes];
      if (updatedNotes[sustainedNoteIndex]) {
        updatedNotes[sustainedNoteIndex] = {
          ...updatedNotes[sustainedNoteIndex],
          durationTick: newDuration,
        };
        updateMidiClipNoHistory(activeClip.id, { notes: updatedNotes });
      }
      
      return;
    }
    
    // Handle note dragging in select mode - free movement (NO grid snapping during drag)
    if (selectedTool === 'select' && draggedNoteIndex !== null && activeClip && dragOffset) {
      e.preventDefault(); // Prevent any default behavior
      e.stopPropagation(); // Stop event propagation
      const rect = gridRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Calculate target position (subtract drag offset) - completely free movement, NO snapping
      const targetX = mouseX - dragOffset.x;
      const targetY = mouseY - dragOffset.y;
      
      // Update both state and ref for visual position ONLY - do NOT update note data
      // Constrain to bounds but don't snap to grid
      const newPosition = {
        x: Math.max(0, Math.min(
          (songLength * SNAPGRID_TO_FRACTION[snapGrid] - 1) * pixelsPerBar,
          targetX
        )),
        y: Math.max(0, Math.min(
          (NOTES.length - 1) * noteHeight,
          targetY
        )),
      };
      
      dragPositionRef.current = newPosition;
      setDragPosition(newPosition);
      
      return;
    }
    
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
    // Skip continuous drawing when creating a sustained note
    if (cellKey !== lastProcessedCell && !isCreatingSustainedNote) {
      setLastProcessedCell(cellKey);

      // Play note preview when drawing (not erasing) and only if note doesn't exist
      if (selectedTool === 'draw') {
        const pitch = NOTE_TO_MIDI[NOTES[noteIndex]];
        const hasExistingNote = activeClip?.notes.some(
          (n) => n.pitch === pitch && Math.abs(n.startTick - tick) < ticksPerStep / 2
        );
        
        // Only play preview if there's no existing note
        if (!hasExistingNote) {
          const noteName = NOTES[noteIndex];
          const snapGridFraction = SNAPGRID_TO_FRACTION[snapGrid];
          const duration = `${snapGridFraction}n`;
          // Play at 50% velocity (64 out of 127)
          playNote(selectedTrackId, noteName, duration, undefined, 64);
        }
        
        addNoteAtPosition(noteIndex, tick);
      } else if (selectedTool === 'erase') {
        removeNoteAtPosition(noteIndex, tick);
      }
    }
  };

  const handleMouseUp = () => {
    if (!isDragging) return;

    console.log('handleMouseUp', dragPosition);
    
    // Handle box selection completion
    if (selectedTool === 'select' && isBoxSelecting && boxSelectStart && boxSelectEnd && activeClip) {
      // Calculate the bounding box
      const minX = Math.min(boxSelectStart.x, boxSelectEnd.x);
      const maxX = Math.max(boxSelectStart.x, boxSelectEnd.x);
      const minY = Math.min(boxSelectStart.y, boxSelectEnd.y);
      const maxY = Math.max(boxSelectStart.y, boxSelectEnd.y);
      
      // Find all notes within the box
      const selectedIndices = new Set<number>();
      activeClip.notes.forEach((note, index) => {
        const noteNoteIndex = NOTES.findIndex((n) => NOTE_TO_MIDI[n] === note.pitch);
        if (noteNoteIndex === -1) return;
        
        const stepPosition = note.startTick / ticksPerStep;
        const noteX = stepPosition * pixelsPerBar;
        const noteY = noteNoteIndex * noteHeight;
        const noteWidth = (note.durationTick / ticksPerStep) * pixelsPerBar;
        const noteEndX = noteX + noteWidth;
        const noteEndY = noteY + noteHeight;
        
        // Check if note intersects with selection box
        if (noteX < maxX && noteEndX > minX && noteY < maxY && noteEndY > minY) {
          selectedIndices.add(index);
        }
      });
      
      setSelectedNoteIndices(selectedIndices);
      setIsBoxSelecting(false);
      setBoxSelectStart(null);
      setBoxSelectEnd(null);
      setIsDragging(false);
      return;
    }
    
    // Handle note drop in select mode - snap to grid and check collisions
    if (selectedTool === 'select' && draggedNoteIndex !== null && activeClip && dragPosition && originalNotePosition) {
      // Calculate snapped position for the dragged note
      const noteIndex = Math.max(0, Math.min(NOTES.length - 1, Math.floor(dragPosition.y / noteHeight)));
      const stepIndex = Math.max(0, Math.min(
        songLength * SNAPGRID_TO_FRACTION[snapGrid] - 1,
        Math.floor(dragPosition.x / pixelsPerBar)
      ));
      
      // Calculate new tick position (snapped to grid)
      const newTick = (stepIndex * ticksPerBar) / SNAPGRID_TO_FRACTION[snapGrid];
      const newPitch = NOTE_TO_MIDI[NOTES[noteIndex]];
      
      // Calculate the delta movement
      const pitchDelta = newPitch - originalNotePosition.pitch;
      const tickDelta = newTick - originalNotePosition.startTick;
      
      // Check for collisions for all selected notes
      let hasAnyCollision = false;
      const notesToMove = selectedNoteIndices.size > 0 ? selectedNoteIndices : new Set([draggedNoteIndex]);
      
      for (const index of notesToMove) {
        const originalPos = originalNotesPositions.get(index);
        if (!originalPos) continue;
        
        const targetPitch = originalPos.pitch + pitchDelta;
        const targetTick = originalPos.startTick + tickDelta;
        
        // Check collision (excluding all notes being moved)
        const collision = hasNoteAtPosition(targetPitch, targetTick, null) && 
          !Array.from(notesToMove).some(idx => {
            const n = activeClip.notes[idx];
            return n && n.pitch === targetPitch && Math.abs(n.startTick - targetTick) < ticksPerStep / 2;
          });
        
        if (collision) {
          hasAnyCollision = true;
          break;
        }
      }
      
      if (hasAnyCollision) {
        // Revert all notes to original positions
        const updatedNotes = [...activeClip.notes];
        notesToMove.forEach(index => {
          const originalPos = originalNotesPositions.get(index);
          if (originalPos && updatedNotes[index]) {
            updatedNotes[index] = {
              ...updatedNotes[index],
              pitch: originalPos.pitch,
              startTick: originalPos.startTick,
            };
          }
        });
        updateMidiClip(activeClip.id, { notes: updatedNotes });
      } else {
        // Apply the move to all selected notes
        const updatedNotes = [...activeClip.notes];
        notesToMove.forEach(index => {
          const originalPos = originalNotesPositions.get(index);
          if (originalPos && updatedNotes[index]) {
            updatedNotes[index] = {
              ...updatedNotes[index],
              pitch: originalPos.pitch + pitchDelta,
              startTick: originalPos.startTick + tickDelta,
            };
          }
        });
        updateMidiClip(activeClip.id, { notes: updatedNotes });
      }
    }
    
    // Finalize sustained note creation - no need to add to history, already saved on mouse down
    if (isCreatingSustainedNote && activeClip) {
      // The final state is already in the project, and history was saved before creation
      // No additional action needed
    }
    
    // Reset all dragging and sustained note states
    setIsDragging(false);
    setLastProcessedCell(null);
    setDraggedNoteIndex(null);
    setDragOffset(null);
    setOriginalNotePosition(null);
    setOriginalNotesPositions(new Map());
    setDragPosition(null);
    dragPositionRef.current = null;
    
    // Reset sustained note creation state
    setIsCreatingSustainedNote(false);
    setSustainedNoteStartTick(null);
    setSustainedNoteIndex(null);
    
    // Reset box selection state
    setIsBoxSelecting(false);
    setBoxSelectStart(null);
    setBoxSelectEnd(null);
  };

  // Handle velocity update
  const handleVelocityChange = (newVelocity: number) => {
    if (!velocityEditNote || !activeClip) return;
    
    const updatedNotes = [...activeClip.notes];
    updatedNotes[velocityEditNote.index] = {
      ...updatedNotes[velocityEditNote.index],
      velocity: Math.max(0, Math.min(127, newVelocity)),
    };
    
    updateMidiClip(activeClip.id, { notes: updatedNotes });
    setVelocityEditNote(null);
  };


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
          {tool.charAt(0).toUpperCase() + tool.slice(1)} ({tool.charAt(0).toUpperCase()}) 
        </button>
        ))}
        <button 
          className="px-3 py-1 rounded text-sm bg-red-900 hover:bg-red-800 text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed ml-2"
          onClick={handleEraseAll}
          disabled={!activeClip || activeClip.notes.length === 0}
        >
          Erase All
        </button>
        {/* Undo button disabled - undo functionality not implemented */}
        {/* <button 
          className="px-3 py-1 rounded text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={undo}
          disabled={!canUndo()}
          title="Undo (⌘Z)"
        >
          Undo
        </button> */}
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
            {/* Playhead - vertical white line */}
            {isPlaying && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white z-30 pointer-events-none"
                style={{
                  left: `${playheadPosition * pixelsPerBar * SNAPGRID_TO_FRACTION[snapGrid]}px`,
                }}
              />
            )}

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
                const isDraggingThisNote = draggedNoteIndex === index && isDragging;
                const isSelected = selectedNoteIndices.has(index);
                
                // During drag, use dragPosition exclusively - don't calculate from note data
                let top: number;
                let left: number;
                
                // Use ref first (most up-to-date), then state, then calculate from note
                const currentDragPos = dragPositionRef.current || dragPosition;
                
                // Calculate base position from note data (always needed for width/height calculations)
                const noteIndex = NOTES.findIndex((n) => NOTE_TO_MIDI[n] === note.pitch);
                if (noteIndex === -1) return null;
                const stepPosition = note.startTick / ticksPerStep;
                const baseTop = noteIndex * noteHeight;
                const baseLeft = stepPosition * pixelsPerBar;
                
                // CRITICAL: Only use drag position if we're actively dragging THIS note
                // This prevents any accidental fallback to note data during drag
                let transform = '';
                if (isDraggingThisNote && currentDragPos !== null) {
                  // Use transform for smooth dragging - calculate offset from base position
                  const offsetX = currentDragPos.x - baseLeft;
                  const offsetY = currentDragPos.y - baseTop;
                  transform = `translate(${offsetX}px, ${offsetY}px)`;
                }
                
                const stepDuration = note.durationTick / ticksPerStep;
                
                return (
                  <div
                    key={index}
                    className={`absolute border ${
                      selectedTool === 'select' ? 'cursor-move' : 'cursor-default'
                    } ${
                      isSelected || isDraggingThisNote
                        ? 'bg-blue-400 border-blue-300 z-10'
                        : 'bg-blue-500 border-blue-400 z-10'
                    }`}
                    style={{
                      top: `${baseTop}px`,
                      left: `${baseLeft}px`,
                      width: `${stepDuration * pixelsPerBar}px`,
                      height: `${noteHeight - 2}px`,
                      transform: transform || undefined,
                      // During drag, disable pointer events so mouse events pass through to grid
                      // When not dragging, enable pointer events only in select mode
                      pointerEvents: isDraggingThisNote ? 'none' : (selectedTool === 'select' ? 'auto' : 'none'),
                      transition: isDraggingThisNote ? 'none' : undefined, // No transition during drag
                      willChange: isDraggingThisNote ? 'transform' : 'auto', // Optimize for dragging
                    }}
                    onMouseDown={(e) => {
                      if (selectedTool === 'select') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!selectedNoteIndices.has(index)) {
                          setSelectedNoteIndices(new Set([index]));
                        }
                        
                        // Store original position
                        setOriginalNotePosition({
                          pitch: note.pitch,
                          startTick: note.startTick,
                        });
                        
                        setIsDragging(true);
                        setDraggedNoteIndex(index);
                        
                        const rect = gridRef.current?.getBoundingClientRect();
                        if (rect) {
                          const mouseX = e.clientX - rect.left;
                          const mouseY = e.clientY - rect.top;
                          setDragOffset({
                            x: mouseX - baseLeft,
                            y: mouseY - baseTop,
                          });
                          const initialPos = { x: baseLeft, y: baseTop };
                          dragPositionRef.current = initialPos;
                          setDragPosition(initialPos);
                        }
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (selectedTool === 'select') {
                        setVelocityEditNote({ index, velocity: note.velocity });
                      }
                    }}
                  />
                );
              });
            })()}

            {/* Box Selection Overlay */}
            {isBoxSelecting && boxSelectStart && boxSelectEnd && (
              <div
                className="absolute border-2 border-blue-400 bg-blue-400/20 pointer-events-none z-20"
                style={{
                  left: `${Math.min(boxSelectStart.x, boxSelectEnd.x)}px`,
                  top: `${Math.min(boxSelectStart.y, boxSelectEnd.y)}px`,
                  width: `${Math.abs(boxSelectEnd.x - boxSelectStart.x)}px`,
                  height: `${Math.abs(boxSelectEnd.y - boxSelectStart.y)}px`,
                }}
              />
            )}

            {/* Clickable Grid */}
            <div 
              ref={gridRef}
              className="absolute inset-0"
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onMouseMove={handleMouseMove}
              onContextMenu={(e) => e.preventDefault()}
              style={{
                // Ensure grid is always on top to capture mouse events during drag
                zIndex: isDragging ? 20 : 0,
                pointerEvents: 'auto',
              }}
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
                          handleMouseDown(noteIndex, tick, e);
                        }}
                        className={`absolute border-b border-r border-zinc-800 ${
                          selectedTool === 'draw' || selectedTool === 'erase'
                            ? 'hover:bg-zinc-900/50 cursor-crosshair'
                            : selectedTool === 'select'
                            ? 'hover:bg-zinc-900/30 cursor-pointer'
                            : 'hover:bg-zinc-900/30 cursor-pointer'
                        }`}
                        style={{
                          left: `${stepIndex * pixelsPerBar}px`,
                          width: `${pixelsPerBar}px`,
                          height: '100%',
                          pointerEvents: selectedTool === 'select' ? 'auto' : 'auto',
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

      {/* Velocity Editor Modal */}
      {velocityEditNote && activeClip && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setVelocityEditNote(null)}>
          <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4 text-white">Edit Velocity</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-300 mb-2">
                  Velocity: {velocityEditNote.velocity} (0-127)
                </label>
                <input
                  type="range"
                  min="0"
                  max="127"
                  value={velocityEditNote.velocity}
                  onChange={(e) => {
                    const newVelocity = parseInt(e.target.value);
                    setVelocityEditNote({ ...velocityEditNote, velocity: newVelocity });
                  }}
                  className="w-full"
                />
                <div className="flex gap-2 mt-4">
                  <input
                    type="number"
                    min="0"
                    max="127"
                    value={velocityEditNote.velocity}
                    onChange={(e) => {
                      const newVelocity = parseInt(e.target.value) || 0;
                      setVelocityEditNote({ ...velocityEditNote, velocity: Math.max(0, Math.min(127, newVelocity)) });
                    }}
                    className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-white w-24"
                  />
                  <button
                    onClick={() => handleVelocityChange(velocityEditNote.velocity)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => setVelocityEditNote(null)}
                    className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
