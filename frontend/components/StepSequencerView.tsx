'use client';

import { useProjectStore } from '@/stores/projectStore';
import { useState } from 'react';

export default function StepSequencerView() {
  const { project } = useProjectStore();
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);

  if (!project) return null;

  const pattern = selectedPattern
    ? project.patterns.find((p) => p.id === selectedPattern)
    : project.patterns[0] || null;

  const toggleStep = (channelId: string, stepIndex: number) => {
    if (!pattern) return;
    // Update pattern step
  };

  return (
    <div className="h-full bg-black flex flex-col">
      {/* Pattern Selector */}
      <div className="h-10 bg-zinc-900 border-b border-zinc-700 flex items-center gap-2 px-4 flex-shrink-0">
        <select
          value={selectedPattern || ''}
          onChange={(e) => setSelectedPattern(e.target.value)}
          className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
        >
          {project.patterns.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-sm">
          New Pattern
        </button>
      </div>

      {/* Step Grid */}
      <div className="flex-1 overflow-auto p-4">
        {pattern ? (
          <div className="space-y-2">
            {pattern.channels.map((channel) => (
              <div key={channel.id} className="flex items-center gap-2">
                {/* Channel Controls */}
                <div className="w-32 flex items-center gap-2">
                  <button
                    className={`w-6 h-6 rounded text-xs ${
                      channel.mute ? 'bg-red-600' : 'bg-zinc-700'
                    }`}
                  >
                    M
                  </button>
                  <button
                    className={`w-6 h-6 rounded text-xs ${
                      channel.solo ? 'bg-yellow-600' : 'bg-zinc-700'
                    }`}
                  >
                    S
                  </button>
                  <span className="text-sm text-white flex-1 truncate">{channel.name}</span>
                </div>

                {/* Steps */}
                <div className="flex gap-1">
                  {channel.steps.map((active, stepIndex) => (
                    <button
                      key={stepIndex}
                      onClick={() => toggleStep(channel.id, stepIndex)}
                      className={`w-8 h-8 border border-zinc-700 cursor-pointer transition ${
                        active ? 'bg-blue-500' : 'bg-zinc-800'
                      } hover:border-zinc-500`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-500">
            No patterns. Create a new pattern to get started.
          </div>
        )}
      </div>
    </div>
  );
}
