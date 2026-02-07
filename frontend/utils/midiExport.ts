// MIDI Export Utility

import { Midi } from '@tonejs/midi';
import type { Project, MidiClip, ArrangementClip } from '@/types/project';

export function exportProjectToMidi(project: Project): Blob {
  const midi = new Midi();
  
  // Set tempo
  midi.header.setTempo(project.tempo);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [project.timeSignature.numerator, project.timeSignature.denominator],
  });
  
  // Group arrangement clips by track
  const trackClips: { [trackId: string]: ArrangementClip[] } = {};
  project.arrangementClips.forEach((clip) => {
    if (!trackClips[clip.trackId]) {
      trackClips[clip.trackId] = [];
    }
    trackClips[clip.trackId].push(clip);
  });
  
  // Create MIDI tracks
  project.tracks.forEach((track) => {
    const midiTrack = midi.addTrack();
    midiTrack.name = track.name;
    
    const clips = trackClips[track.id] || [];
    
    clips.forEach((arrClip) => {
      if (arrClip.clipType === 'midi') {
        const midiClip = project.midiClips.find((c) => c.id === arrClip.clipDataId);
        if (midiClip) {
          // Convert bars to ticks (assuming 4/4 time, 480 ticks per quarter note)
          const ticksPerBar = 1920; // 4 beats * 480 ticks
          const clipStartTick = arrClip.startBar * ticksPerBar;
          
          midiClip.notes.forEach((note) => {
            midiTrack.addNote({
              midi: note.pitch,
              time: (clipStartTick + note.startTick) / 480, // Convert to seconds
              duration: note.durationTick / 480,
              velocity: note.velocity,
            });
          });
        }
      }
    });
  });
  
  // Convert to blob
  const arrayBuffer = midi.toArray();
  return new Blob([arrayBuffer], { type: 'audio/midi' });
}

export function downloadMidi(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
