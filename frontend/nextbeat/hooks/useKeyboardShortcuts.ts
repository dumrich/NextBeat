import { useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import * as Tone from 'tone';

export function useKeyboardShortcuts() {
  const {
    isPlaying,
    isRecording,
    setIsPlaying,
    setIsRecording,
    setCurrentView,
    deleteArrangementClip,
    selection,
  } = useProjectStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space: Play/Pause
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        if (isPlaying) {
          Tone.getTransport().stop();
          setIsPlaying(false);
        } else {
          Tone.start().then(() => {
            Tone.getTransport().start();
            setIsPlaying(true);
          });
        }
      }

      // R: Record toggle
      if (e.code === 'KeyR' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setIsRecording(!isRecording);
      }

      // Delete: Delete selection
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selection.clips.length > 0 && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          selection.clips.forEach((clipId) => {
            deleteArrangementClip(clipId);
          });
        }
      }

      // Ctrl/Cmd + Z: Undo (placeholder)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        // TODO: Implement undo
      }

      // Ctrl/Cmd + Shift + Z: Redo (placeholder)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && e.shiftKey) {
        e.preventDefault();
        // TODO: Implement redo
      }

      // Ctrl/Cmd + D: Duplicate (placeholder)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
        e.preventDefault();
        // TODO: Implement duplicate
      }

      // Ctrl/Cmd + E: Export MIDI (placeholder - handled by button for now)
      // if ((e.ctrlKey || e.metaKey) && e.code === 'KeyE') {
      //   e.preventDefault();
      //   // TODO: Trigger export
      // }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isRecording, setIsPlaying, setIsRecording, setCurrentView, deleteArrangementClip, selection]);
}
