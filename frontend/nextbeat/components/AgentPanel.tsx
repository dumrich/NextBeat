'use client';

import { useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { agentClient, type ProposedEdit } from '@/utils/agentClient';

type AgentMode = 'chat' | 'actions' | 'autocomplete';

export default function AgentPanel() {
  const { project } = useProjectStore();
  const [mode, setMode] = useState<AgentMode>('chat');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; edits?: ProposedEdit[] }>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<ProposedEdit[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const quickPrompts = [
    'Add drums',
    'Reharmonize',
    'Make it darker',
    'Humanize',
    'Build a drop',
  ];

  const handleSend = async () => {
    if (!input.trim() || !project || isLoading) return;

    const userMessage = input;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await agentClient.sendMessage(project, userMessage);
      setMessages((prev) => [...prev, { role: 'assistant', content: response.message, edits: response.proposedEdits }]);
      
      if (response.proposedEdits) {
        setPendingEdits(response.proposedEdits);
      }
      if (response.suggestions) {
        setSuggestions(response.suggestions);
      }
    } catch (error) {
      console.error('Agent error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyEdit = (edit: ProposedEdit) => {
    if (!project) return;
    
    const { addPattern, addMidiClip, addArrangementClip, addTrack } = useProjectStore.getState();
    const timestamp = Date.now();
    
    if (edit.type === 'addPattern') {
      const patternId = `pattern-${timestamp}`;
      addPattern({
        id: patternId,
        name: edit.data.name,
        steps: edit.data.steps,
        channels: edit.data.channels.map((ch: any, idx: number) => ({
          ...ch,
          id: `channel-${timestamp}-${idx}`,
        })),
      });
      // Also create an arrangement clip for the pattern
      const trackId = project.tracks[0]?.id;
      if (trackId) {
        addArrangementClip({
          id: `arr-${timestamp}`,
          trackId,
          startBar: 0,
          lengthBars: edit.data.steps / 4, // Assuming 4 steps per bar
          clipType: 'pattern',
          clipDataId: patternId,
        });
      }
    } else if (edit.type === 'addTrack') {
      const trackId = `track-${timestamp}`;
      addTrack({
        id: trackId,
        name: edit.data.name || 'New Track',
        color: edit.data.color || '#3b82f6',
        type: edit.data.type || 'instrument',
        channelRackIds: [],
        instrument: null,
        mixerChannelId: null,
        mute: false,
        solo: false,
        arm: false,
        volume: 0.5,
        pan: 0,
      });
    } else if (edit.type === 'addClip') {
      const clipId = `clip-${timestamp}`;
      // Find track by name, or use first track
      const trackId = project.tracks.find((t) => t.name === edit.data.trackName)?.id || project.tracks[0]?.id;
      if (trackId) {
        addMidiClip({
          id: clipId,
          trackId,
          startBar: edit.data.startBar,
          lengthBars: edit.data.lengthBars,
          notes: edit.data.notes,
        });
        addArrangementClip({
          id: `arr-${timestamp}`,
          trackId,
          startBar: edit.data.startBar,
          lengthBars: edit.data.lengthBars,
          clipType: 'midi',
          clipDataId: clipId,
        });
      }
    }
    
    setPendingEdits((prev) => prev.filter((e) => e !== edit));
  };

  const handleRejectEdit = (edit: ProposedEdit) => {
    setPendingEdits((prev) => prev.filter((e) => e !== edit));
  };

  return (
    <div className="h-full bg-zinc-900 border-l border-zinc-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-zinc-700 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-white">Agent Mode</h2>
          <div className="w-2 h-2 bg-green-500 rounded-full" />
        </div>
        <div className="flex gap-2">
          {(['chat', 'actions', 'autocomplete'] as AgentMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded text-sm transition ${
                mode === m
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {mode === 'chat' && (
          <div className="space-y-4">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`p-3 rounded ${
                  msg.role === 'user' ? 'bg-blue-600 ml-auto' : 'bg-zinc-800'
                }`}
              >
                <div className="text-sm text-white">{msg.content}</div>
                {msg.edits && msg.edits.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {msg.edits.map((edit, editIndex) => (
                      <div key={editIndex} className="p-2 bg-zinc-700 rounded text-xs">
                        <div className="text-zinc-300 mb-1">{edit.description}</div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApplyEdit(edit)}
                            className="px-2 py-1 bg-green-600 hover:bg-green-500 rounded"
                          >
                            Apply
                          </button>
                          <button
                            onClick={() => handleRejectEdit(edit)}
                            className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="p-3 bg-zinc-800 rounded">
                <div className="text-sm text-zinc-400">Thinking...</div>
              </div>
            )}
          </div>
        )}

        {mode === 'actions' && (
          <div className="space-y-2">
            {pendingEdits.map((edit, index) => (
              <div key={index} className="p-3 bg-zinc-800 rounded">
                <div className="text-sm text-white mb-2">{edit.description}</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApplyEdit(edit)}
                    className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => handleRejectEdit(edit)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
            {pendingEdits.length === 0 && (
              <div className="text-zinc-500 text-sm">No pending actions</div>
            )}
          </div>
        )}

        {mode === 'autocomplete' && (
          <div className="space-y-2">
            {suggestions.map((suggestion, index) => (
              <div key={index} className="p-3 bg-zinc-800 rounded">
                <div className="text-sm text-white">{suggestion.text}</div>
                <button className="mt-2 px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs">
                  Accept
                </button>
              </div>
            ))}
            {suggestions.length === 0 && (
              <div className="text-zinc-500 text-sm">No suggestions available</div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-zinc-700 flex-shrink-0">
        <div className="flex flex-wrap gap-2 mb-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => setInput(prompt)}
              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-zinc-300"
            >
              {prompt}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask the agent for help..."
            className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm resize-none"
            rows={3}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded text-sm"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
