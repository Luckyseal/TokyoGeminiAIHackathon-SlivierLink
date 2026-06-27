// Senior-friendly Japanese voice.
// Primary: Google Cloud TTS (Chirp3-HD) via the server-side proxy.
// Fallback: browser Web Speech API.
//
// Chirp3-HD does not use SSML — it renders warm, natural prosody from plain
// text + punctuation, with gentle pacing controlled by speakingRate on the server.

export type TtsSource = 'google-cloud' | 'browser-fallback' | 'error';

export interface TtsResult {
  source: TtsSource;
  played: boolean;
}

// Warm, caring Japanese lines. Commas/periods drive Chirp3-HD's natural pauses.
const TEXT_MEDICINE_CONFIRMATION =
  'お薬が、まだ机の上にあるようです。急がなくても、大丈夫ですよ。一緒に、確認しましょうね。';

const TEXT_REASSURING_HANDOFF =
  'わかりました。ご家族に、短いメモを用意しますね。判断は、薬剤師さんにも、確認できるようにしておきますね。';

export const TTS_TEXTS = {
  medicineConfirmation: TEXT_MEDICINE_CONFIRMATION,
  reassuringHandoff: TEXT_REASSURING_HANDOFF,
};

// Call the server proxy → base64 MP3
async function callServerTts(text: string, voice: string): Promise<string> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) {
    throw new Error(`tts failed: ${res.status}`);
  }
  const data = await res.json();
  return data.audioContent as string;
}

// Play base64 MP3 audio, resolving when done or after a safety timeout
function playBase64Audio(base64Audio: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);

    const timeout = setTimeout(() => {
      audio.pause();
      resolve();
    }, 30_000);

    audio.onended = () => {
      clearTimeout(timeout);
      resolve();
    };

    audio.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Audio playback error'));
    };

    // Catch autoplay rejection so a blocked play never freezes the UI
    audio.play().catch((err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Browser Web Speech API fallback
function speakWithBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }

    // Safety timeout scaled to text length
    const safetyMs = Math.max(10_000, text.length * 200);
    const timeout = setTimeout(() => {
      window.speechSynthesis.cancel();
      resolve();
    }, safetyMs);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.85;
    utterance.pitch = 0.95;
    utterance.volume = 1.0;

    utterance.onend = () => {
      clearTimeout(timeout);
      resolve();
    };
    utterance.onerror = () => {
      clearTimeout(timeout);
      resolve(); // never block the UI
    };

    // Cancel any existing speech, then wait before speaking to avoid a Chrome race
    window.speechSynthesis.cancel();
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 75);
  });
}

// Speak arbitrary text. In live mode try Cloud TTS (Chirp3-HD) first, then browser.
export async function speakText(
  text: string,
  voice: string,
  useCloud: boolean
): Promise<TtsResult> {
  if (useCloud) {
    try {
      const base64Audio = await callServerTts(text, voice);
      await playBase64Audio(base64Audio);
      return { source: 'google-cloud', played: true };
    } catch (err) {
      console.warn('[TTS] Cloud TTS failed, falling back to browser:', err);
    }
  }

  try {
    await speakWithBrowser(text);
    return { source: 'browser-fallback', played: true };
  } catch (err) {
    console.warn('[TTS] Browser speech also failed:', err);
    return { source: 'error', played: false };
  }
}

// Speak a predefined warm line by key.
export async function speakJapanese(
  key: keyof typeof TTS_TEXTS,
  voice: string,
  useCloud: boolean
): Promise<TtsResult> {
  return speakText(TTS_TEXTS[key], voice, useCloud);
}
