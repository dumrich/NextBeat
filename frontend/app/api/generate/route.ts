import { NextResponse } from 'next/server';

// Proxies to the Text-to-MIDI server to avoid CORS and handle long-running requests (~1 min)
const TEXT_TO_MIDI_API_URL = process.env.TEXT_TO_MIDI_API_URL || 'http://150.136.165.122:8000/generate';

// 2 minute timeout for generation
const FETCH_TIMEOUT_MS = 2 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid prompt' },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(TEXT_TO_MIDI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `MIDI generation failed: ${response.status} ${errorText || response.statusText}` },
        { status: response.status }
      );
    }

    const blob = await response.blob();
    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'audio/midi',
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timed out. MIDI generation can take up to 1 minute.' },
          { status: 504 }
        );
      }
      console.error('Generate API error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: 'Unknown error' },
      { status: 500 }
    );
  }
}
