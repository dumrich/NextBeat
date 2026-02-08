// Text-to-MIDI API client
// Uses localhost:8000 when SSH tunnel is running: ssh -L 8000:localhost:8000 ubuntu@150.136.165.122
// For direct cloud access (firewall open), set NEXT_PUBLIC_TEXT_TO_MIDI_URL=http://150.136.165.122:8000/generate

const TEXT_TO_MIDI_API_URL =
  process.env.NEXT_PUBLIC_TEXT_TO_MIDI_URL || 'http://localhost:8000/generate';

// 2 minute timeout for generation (can take ~1 min)
const FETCH_TIMEOUT_MS = 2 * 60 * 1000;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Strip the "data:...;base64," prefix
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function generateMidiFromPrompt(prompt: string, currentMidi?: Blob): Promise<Blob> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const body: { prompt: string; midi_base64?: string } = { prompt };

    if (currentMidi) {
      body.midi_base64 = await blobToBase64(currentMidi);
    }

    const response = await fetch(TEXT_TO_MIDI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.error || json.message || json.detail || `Server error: ${response.status}`);
      }
      const errorText = await response.text();
      throw new Error(`Failed to generate MIDI: ${response.status} ${errorText || response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await response.json();
      if (json.error) throw new Error(json.error);
      if (typeof json.midi === 'string') {
        const binary = atob(json.midi);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: 'audio/midi' });
      }
      if (json.data) {
        const binary = atob(json.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: 'audio/midi' });
      }
    }

    return response.blob();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. MIDI generation can take up to 1 minute.');
      }
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new Error(
          'Cannot reach the MIDI server. Check CORS is enabled on the server and the URL is correct.'
        );
      }
      throw error;
    }
    throw error;
  }
}
