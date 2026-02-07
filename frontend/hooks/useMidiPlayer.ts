import { useEffect, useRef, useCallback } from 'react';
import type { Project } from '@/types/project';
import { exportProjectToMidi } from '@/utils/midiExport';

interface MidiPlayerElement extends HTMLElement {
  src: string;
  currentTime: number;
  duration: number;
  playing: boolean;
  start(): void;
  stop(): void;
  addVisualizer(el: HTMLElement): void;
}

interface UseMidiPlayerReturn {
  play: (project: Project, fromSeconds?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
}

let scriptLoaded = false;
let scriptLoading: Promise<void> | null = null;

function loadMidiPlayerScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  if (scriptLoading) return scriptLoading;

  scriptLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/midi-player.min.js';
    script.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load midi-player.min.js'));
    document.head.appendChild(script);
  });

  return scriptLoading;
}

export function useMidiPlayer(
  setIsPlaying: (playing: boolean) => void
): UseMidiPlayerReturn {
  const playerRef = useRef<MidiPlayerElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const savedTimeRef = useRef<number>(0);

  // Load script and create the hidden element
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await loadMidiPlayerScript();
      } catch (e) {
        console.error('Failed to load html-midi-player:', e);
        return;
      }

      if (cancelled) return;

      const el = document.createElement('midi-player') as MidiPlayerElement;
      el.style.display = 'none';
      document.body.appendChild(el);
      playerRef.current = el;

      // When playback ends naturally, update state
      el.addEventListener('stop', () => {
        setIsPlaying(false);
      });
    }

    init();

    return () => {
      cancelled = true;
      if (playerRef.current) {
        try { playerRef.current.stop(); } catch {}
        playerRef.current.remove();
        playerRef.current = null;
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [setIsPlaying]);

  const play = useCallback((project: Project, fromSeconds?: number) => {
    const player = playerRef.current;
    if (!player) return;

    // Revoke previous blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
    }

    // Export project to MIDI blob and set as src
    const blob = exportProjectToMidi(project);
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    player.src = url;

    // Wait for the player to load the new src before starting
    const onLoad = () => {
      player.removeEventListener('load', onLoad);
      if (fromSeconds !== undefined && fromSeconds > 0) {
        player.currentTime = fromSeconds;
      }
      player.start();
    };
    player.addEventListener('load', onLoad);
  }, []);

  const pause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    savedTimeRef.current = player.currentTime;
    player.stop();
  }, []);

  const resume = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.currentTime = savedTimeRef.current;
    player.start();
  }, []);

  const stop = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.stop();
    player.currentTime = 0;
    savedTimeRef.current = 0;
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.currentTime = seconds;
    savedTimeRef.current = seconds;
  }, []);

  const getCurrentTime = useCallback(() => {
    return playerRef.current?.currentTime ?? 0;
  }, []);

  const getDuration = useCallback(() => {
    return playerRef.current?.duration ?? 0;
  }, []);

  return { play, pause, resume, stop, seekTo, getCurrentTime, getDuration };
}
