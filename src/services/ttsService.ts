// ---------------------------------------------------------------------------
// CrispAudio — TTS Service
// HTTP client for CrispASR TTS server (OpenAI-compatible /v1/audio/speech).
// ---------------------------------------------------------------------------

export interface TTSVoice {
  id: string;
  name: string;
}

/**
 * Synthesize speech via the CrispASR HTTP API.
 * Returns raw WAV audio bytes.
 */
export async function synthesizeSpeech(
  serverUrl: string,
  text: string,
  voice?: string,
  backend?: string,
): Promise<ArrayBuffer> {
  const url = `${serverUrl.replace(/\/+$/, '')}/v1/audio/speech`;

  const body: Record<string, unknown> = {
    input: text,
    response_format: 'wav',
  };
  if (voice) body.voice = voice;
  if (backend) body.model = backend;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let msg = `TTS request failed (${res.status})`;
    try {
      const err = await res.json();
      if (err?.error?.message) msg = err.error.message;
    } catch {
      // ignore parse failure
    }
    throw new Error(msg);
  }

  return res.arrayBuffer();
}

/**
 * Fetch available voices from the CrispASR server.
 */
export async function fetchVoices(serverUrl: string): Promise<TTSVoice[]> {
  const url = `${serverUrl.replace(/\/+$/, '')}/v1/voices`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) {
      return data.map((v: { id?: string; name?: string } | string) =>
        typeof v === 'string' ? { id: v, name: v } : { id: v.id ?? v.name ?? '', name: v.name ?? v.id ?? '' },
      );
    }
    if (data?.voices && Array.isArray(data.voices)) {
      return data.voices.map((v: { id?: string; name?: string } | string) =>
        typeof v === 'string' ? { id: v, name: v } : { id: v.id ?? v.name ?? '', name: v.name ?? v.id ?? '' },
      );
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Check if the TTS server is reachable.
 */
export async function checkServerHealth(serverUrl: string): Promise<boolean> {
  try {
    const url = `${serverUrl.replace(/\/+$/, '')}/health`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
