'use client';

import { useProjectStore } from '@/stores/projectStore';
import { usePlayback } from '@/hooks/usePlayback';
import * as Tone from 'tone';

export default function TransportBar() {
  const {
    project,
    isPlaying,
    isRecording,
    metronomeEnabled,
    playheadPosition,
    snapGrid,
    songLength,
    setTempo,
    setIsPlaying,
    setIsRecording,
    setMetronomeEnabled,
    setPlayheadPosition,
    setSnapGrid,
    setSongLength,
  } = useProjectStore();

  // Initialize playback system
  usePlayback(project, isPlaying, project?.tempo || 120, snapGrid, setPlayheadPosition);

  const handlePlayPause = async () => {
    if (!isPlaying) {
      await Tone.start();
      if (project) {
        console.log(project.midiClips);
        Tone.getTransport().bpm.value = project.tempo;
        // Start from current playhead position
        // Convert bars to seconds: (bars * 4 beats/bar) / (bpm / 60)
        const startSeconds = (playheadPosition * 4 * 60) / project.tempo;
        Tone.getTransport().seconds = startSeconds;
        Tone.getTransport().start();
      }
      setIsPlaying(true);
    } else {
      // Pause: stop but keep current position (position is maintained in playheadPosition)
      Tone.getTransport().stop();
      setIsPlaying(false);
    }
  };

  const handleStop = () => {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    Tone.getTransport().seconds = 0;
    setIsPlaying(false);
    setPlayheadPosition(0);
  };

  const handleRewind = () => {
    if (isPlaying) {
      // If playing, stop and reset
      Tone.getTransport().stop();
      Tone.getTransport().cancel();
      Tone.getTransport().seconds = 0;
      setIsPlaying(false);
    } else {
      // If paused, just reset position
      Tone.getTransport().seconds = 0;
    }
    setPlayheadPosition(0);
  };

  const handleTempoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const tempo = parseFloat(e.target.value);
    if (!isNaN(tempo) && tempo > 0 && tempo < 300) {
      setTempo(tempo);
      if (isPlaying) {
        Tone.getTransport().bpm.value = tempo;
      }
    }
  };

  const formatTime = (bars: number) => {
    if (!project) return '0:0:0';
    const beats = Math.floor((bars % 1) * project.timeSignature.numerator);
    const ticks = Math.floor(((bars % 1) * project.timeSignature.numerator - beats) * 960);
    const bar = Math.floor(bars);
    return `${bar}:${beats}:${ticks}`;
  };

  return (
    <div className="h-16 bg-zinc-800 border-b border-zinc-700 flex items-center px-4 gap-4 flex-shrink-0">
      {/* Transport Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={handlePlayPause}
          className={`px-4 py-2 rounded font-bold transition ${
            isPlaying ? 'bg-red-500 hover:bg-red-400' : 'bg-green-500 hover:bg-green-400'
          }`}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          onClick={handleStop}
          className="px-4 py-2 rounded bg-zinc-700 hover:bg-zinc-600 transition"
        >
          ⏹
        </button>
        <button
          onClick={handleRewind}
          className="px-4 py-2 rounded bg-zinc-700 hover:bg-zinc-600 transition"
        >
          ⏮
        </button>
        <button
          onClick={() => setIsRecording(!isRecording)}
          className={`px-4 py-2 rounded font-bold transition ${
            isRecording ? 'bg-red-600 hover:bg-red-500' : 'bg-zinc-700 hover:bg-zinc-600'
          }`}
        >
          ⏺
        </button>
        <button
          onClick={() => setMetronomeEnabled(!metronomeEnabled)}
          className={`px-4 py-2 rounded transition ${
            metronomeEnabled ? 'bg-blue-600 hover:bg-blue-500' : 'bg-zinc-700 hover:bg-zinc-600'
          }`}
        >
          ♪
        </button>
      </div>

      {/* Tempo */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-zinc-400">BPM</label>
        <input
          type="number"
          value={project?.tempo || 120}
          onChange={handleTempoChange}
          className="w-20 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-white text-sm"
          min="1"
          max="300"
        />
      </div>

      {/* Time Signature */}
      {project && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">
            {project.timeSignature.numerator}/{project.timeSignature.denominator}
          </span>
        </div>
      )}

      {/* Position Display */}
      <div className="flex items-center gap-2 ml-auto">
        <span className="text-sm text-zinc-400 font-mono">
          {formatTime(playheadPosition)}
        </span>
      </div>

      {/* Snap/Grid */}
      <div className="flex items-center gap-2">
        <select 
          value={snapGrid}
          onChange={(e) => setSnapGrid(e.target.value)}
          className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-white text-sm"
        >
          <option value="1/4">1/4</option>
          <option value="1/8">1/8</option>
          <option value="1/16">1/16</option>
          <option value="1/32">1/32</option>
        </select>
      </div>

      {/* Song Length */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-zinc-400">Bars</label>
        <input
          type="number"
          value={songLength}
          onChange={(e) => {
            const length = parseInt(e.target.value);
            if (!isNaN(length) && length > 0 && length <= 512) {
              setSongLength(length);
            }
          }}
          className="w-20 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-white text-sm"
          min="1"
          max="512"
        />
      </div>

      {/* Undo/Redo */}
      <div className="flex items-center gap-2">
        <button className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm transition">
          ↶
        </button>
        <button className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm transition">
          ↷
        </button>
      </div>
    </div>
  );
}
