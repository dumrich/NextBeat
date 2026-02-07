'use client';

import { useProjectStore } from '@/stores/projectStore';
import { exportProjectToMidi, downloadMidi, importMidiFile } from '@/utils/midiExport';
import { useState, useRef } from 'react';

export default function BottomBar() {
  const { 
    project, 
    selectedTool, 
    isPlaying,
    addTrack,
    addMidiClip,
    addArrangementClip,
    setTempo,
    setTimeSignature,
  } = useProjectStore();
  const [exportStatus, setExportStatus] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportMidi = () => {
    if (!project) return;

    try {
      const blob = exportProjectToMidi(project);
      downloadMidi(blob, `${project.title || 'untitled'}.mid`);
      setExportStatus('Exported successfully');
      setTimeout(() => setExportStatus(''), 3000);
    } catch (error) {
      console.error('Export error:', error);
      setExportStatus('Export failed');
      setTimeout(() => setExportStatus(''), 3000);
    }
  };

  const handleImportMidi = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input
    e.target.value = '';

    try {
      setExportStatus('Importing...');
      await importMidiFile(
        file,
        addTrack,
        addMidiClip,
        addArrangementClip,
        setTempo,
        setTimeSignature
      );
      setExportStatus('Imported successfully');
      setTimeout(() => setExportStatus(''), 3000);
    } catch (error) {
      console.error('Import error:', error);
      setExportStatus('Import failed');
      setTimeout(() => setExportStatus(''), 3000);
    }
  };

  return (
    <div className="h-10 bg-zinc-900 border-t border-zinc-700 flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-4">
        <span className="text-xs text-zinc-400">Tool: {selectedTool}</span>
        <span className="text-xs text-zinc-400">Snap: 1/16</span>
        <span className="text-xs text-zinc-400">
          {exportStatus || (isPlaying ? 'Playing...' : 'Ready')}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".mid,.midi"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={handleImportMidi}
          className="px-4 py-1 bg-green-600 hover:bg-green-500 rounded text-sm font-medium transition"
        >
          Import MIDI
        </button>
        <button
          onClick={handleExportMidi}
          className="px-4 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition"
        >
          Export MIDI
        </button>
      </div>
    </div>
  );
}
