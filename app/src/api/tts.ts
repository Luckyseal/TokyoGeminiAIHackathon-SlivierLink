// Google Cloud Text-to-Speech client for senior-friendly Japanese voice
// With browser Web Speech API fallback

export type TtsSource = 'google-cloud' | 'browser-fallback' | 'error';

export interface TtsResult {
  source: TtsSource;
  played: boolean;
}

// SSML templates from cloud/02_senior_tts_ssml.md
const SSML_MEDICINE_CONFIRMATION = `<speak>
  <prosody rate="82%" pitch="-2st" volume="loud">
    お薬が、まだ机の上にあるようです。<break time="700ms"/>
    急がなくても大丈夫です。<break time="600ms"/>
    一緒に、確認しましょうか。
  </prosody>
</speak>`;

const SSML_REASSURING_HANDOFF = `<speak>
  <prosody rate="80%" pitch="-2st" volume="medium">
    わかりました。<break time="600ms"/>
    ご家族に、短いメモを用意しますね。<break time="700ms"/>
    判断は、薬剤師さんにも確認できるようにしておきます。
  </prosody>
</speak>`;

export const SSML_TEMPLATES = {
  medicineConfirmation: SSML_MEDICINE_CONFIRMATION,
  reassuringHandoff: SSML_REASSURING_HANDOFF,
};

// Plain text versions for browser fallback
const PLAIN_MEDICINE_CONFIRMATION =
  'お薬が、まだ机の上にあるようです。急がなくても大丈夫です。一緒に、確認しましょうか。';

const PLAIN_REASSURING_HANDOFF =
  'わかりました。ご家族に、短いメモを用意しますね。判断は、薬剤師さんにも確認できるようにしておきます。';

export const PLAIN_TEXTS = {
  medicineConfirmation: PLAIN_MEDICINE_CONFIRMATION,
  reassuringHandoff: PLAIN_REASSURING_HANDOFF,
};

// Google Cloud TTS REST API call
async function callGoogleCloudTts(
  ssml: string,
  apiKey: string,
  voice: string
): Promise<string> {
  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { ssml },
        voice: {
          languageCode: 'ja-JP',
          name: voice || 'ja-JP-Neural2-B',
        },
        audioConfig: {
          audioEncoding: 'MP3',
          // Do NOT set speakingRate here — speed is controlled inside SSML prosody
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`TTS API error: ${response.status}`);
  }

  const data = await response.json();
  return data.audioContent as string; // base64 MP3
}

// Play base64 MP3 audio, returns when done or times out
function playBase64Audio(base64Audio: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audioData = `data:audio/mp3;base64,${base64Audio}`;
    const audio = new Audio(audioData);

    // Safety timeout: 30 seconds max
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

    // Catch autoplay rejection
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

    // Safety timeout based on text length (approx 150ms per char at slow rate)
    const safetyMs = Math.max(10_000, text.length * 200);
    const timeout = setTimeout(() => {
      window.speechSynthesis.cancel();
      resolve();
    }, safetyMs);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.75;
    utterance.pitch = 0.9;
    utterance.volume = 1.0;

    utterance.onend = () => {
      clearTimeout(timeout);
      resolve();
    };

    utterance.onerror = () => {
      clearTimeout(timeout);
      resolve(); // resolve anyway — don't block UI
    };

    // Cancel any existing speech, then wait before speaking to avoid Chrome race
    window.speechSynthesis.cancel();
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 75);
  });
}

// Main TTS function with Google Cloud primary + browser fallback
export async function speakJapanese(
  ssmlKey: keyof typeof SSML_TEMPLATES,
  apiKey: string,
  voice: string
): Promise<TtsResult> {
  const ssml = SSML_TEMPLATES[ssmlKey];
  const plainText = PLAIN_TEXTS[ssmlKey];

  // Try Google Cloud TTS if API key is available
  if (apiKey && apiKey !== 'your_google_tts_api_key_here') {
    try {
      const base64Audio = await callGoogleCloudTts(ssml, apiKey, voice);
      await playBase64Audio(base64Audio);
      return { source: 'google-cloud', played: true };
    } catch (err) {
      console.warn('[TTS] Google Cloud failed, falling back to browser:', err);
    }
  }

  // Browser fallback
  try {
    await speakWithBrowser(plainText);
    return { source: 'browser-fallback', played: true };
  } catch (err) {
    console.warn('[TTS] Browser speech also failed:', err);
    return { source: 'error', played: false };
  }
}
