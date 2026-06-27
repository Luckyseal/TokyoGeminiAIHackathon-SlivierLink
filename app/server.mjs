import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDir = resolve(__dirname, 'dist');
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';

// ----- Google Cloud config (server-side; bills to the hackathon project) -----
const GCP_PROJECT =
  process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'geminihackathon0627';
const GCP_LOCATION =
  process.env.GCP_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'global';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const TTS_VOICE = process.env.TTS_VOICE || 'ja-JP-Chirp3-HD-Sulafat';
const TTS_RATE = Number(process.env.TTS_RATE || 0.9);

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

// ----- Auth: Cloud Run metadata server, or GCP_ACCESS_TOKEN for local dev -----
let cachedToken = null;
async function getAccessToken() {
  if (process.env.GCP_ACCESS_TOKEN) return process.env.GCP_ACCESS_TOKEN;
  const now = Date.now();
  if (cachedToken && cachedToken.exp - 60_000 > now) return cachedToken.token;
  const res = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } }
  );
  if (!res.ok) throw new Error(`metadata token failed: ${res.status}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, exp: now + data.expires_in * 1000 };
  return cachedToken.token;
}

function gcpHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-goog-user-project': GCP_PROJECT,
  };
}

// ----- Gemini (Vertex AI) medicine/document understanding -----
const MEDICINE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    medicineName: { type: 'STRING' },
    timingLabel: { type: 'STRING' },
    notes: { type: 'STRING' },
    uncertainty: { type: 'STRING' },
    handoffAdvice: { type: 'STRING' },
  },
  required: ['medicineName', 'timingLabel', 'notes', 'uncertainty', 'handoffAdvice'],
};

const MEDICINE_PROMPT = `You are a careful, calm assistant helping an elderly person understand medicine labels or health documents.

Rules:
- Do NOT diagnose any illness.
- Do NOT recommend dosage changes.
- Only describe what is visible.
- If uncertain, say so clearly and advise consulting a pharmacist or doctor.
- Use simple, warm, reassuring language suitable for older adults.
- Always include a handoff recommendation.

Respond in Japanese. Return JSON matching the schema.`;

const SAMPLE_DOC = `薬のラベル情報（テキスト形式）:
薬品名: アムロジピン錠 5mg「サワイ」
用法・用量: 1日1回 朝食後 1錠
効能: 高血圧症、狭心症
製造販売: 沢井製薬株式会社

この情報から薬カードを作成してください。`;

function vertexUrl() {
  const apiHost =
    GCP_LOCATION === 'global'
      ? 'aiplatform.googleapis.com'
      : `${GCP_LOCATION}-aiplatform.googleapis.com`;
  return `https://${apiHost}/v1/projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`;
}

async function analyze(payload) {
  const token = await getAccessToken();
  const parts = [];
  if (payload.kind === 'image' && payload.data) {
    parts.push({ text: 'この画像に見える内容だけを読み取り、薬カードを作成してください。' });
    parts.push({ inlineData: { mimeType: payload.mimeType || 'image/jpeg', data: payload.data } });
  } else {
    parts.push({ text: SAMPLE_DOC });
  }

  const body = {
    systemInstruction: { parts: [{ text: MEDICINE_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: MEDICINE_SCHEMA,
    },
  };

  const res = await fetch(vertexUrl(), {
    method: 'POST',
    headers: gcpHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`vertex ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ?? '';
  return JSON.parse(text);
}

// ----- Gemini (Vertex AI) wellbeing / emotional-tone reading from short audio -----
const WELLBEING_SCHEMA = {
  type: 'OBJECT',
  properties: {
    transcript: { type: 'STRING' },
    detectedCues: { type: 'ARRAY', items: { type: 'STRING' } },
    moodLabel: { type: 'STRING' },
    valence: { type: 'NUMBER' },
    concern: { type: 'STRING' },
    careMessageJa: { type: 'STRING' },
    escalate: { type: 'BOOLEAN' },
    confidence: { type: 'NUMBER' },
  },
  required: [
    'transcript', 'detectedCues', 'moodLabel', 'valence',
    'concern', 'careMessageJa', 'escalate', 'confidence',
  ],
};

const WELLBEING_PROMPT = `あなたは高齢者をやさしく見守る、思いやりのあるアシスタントです。
短い音声から観察できる声のトーンや感情の手がかり（ため息、悲しさ、疲れ、孤独感、落ち込み、痛みなど）を述べてください。
特に「ため息」やふっと息を吐く音、声の小ささ、語尾の沈み込みなど、かすかな手がかりも見逃さないよう注意深く聞いてください。ただし、はっきり聞き取れない手がかりを推測で加えてはいけません（誤検出を避けること）。穏やかで前向きな声には、否定的な手がかりや「ため息」を付けないでください。

ルール:
- 病気や精神状態の診断は絶対にしないこと。観察できることだけを述べること。
- concern は low / medium / high のいずれか。
- valence は -1（とても否定的）〜 1（とても肯定的）の数値。
- careMessageJa は、本人にやさしく語りかける短い一言（日本語、です・ます調、温かく、急かさない）。
- escalate は、強い苦痛・安全上の懸念があり、ご家族・薬剤師・医師など人に繋ぐべき場合のみ true。
- 音声が聞き取れない/無音の場合は moodLabel を "unknown"、concern を "low" にすること。
必ず JSON で返答してください。`;

async function assessWellbeing({ data, mimeType }) {
  const token = await getAccessToken();
  const body = {
    systemInstruction: { parts: [{ text: WELLBEING_PROMPT }] },
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'この高齢者の短い音声を分析してください。' },
          { inlineData: { mimeType: mimeType || 'audio/wav', data } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: WELLBEING_SCHEMA,
    },
  };
  const res = await fetch(vertexUrl(), {
    method: 'POST',
    headers: gcpHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`vertex ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const text =
    j?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ?? '';
  return JSON.parse(text);
}

// ----- Gemini (Vertex AI) caregiver / clinical summary report -----
const REPORT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    summaryJa: { type: 'STRING' },
    bullets: { type: 'ARRAY', items: { type: 'STRING' } },
    suggestion: { type: 'STRING' },
    disclaimer: { type: 'STRING' },
  },
  required: ['title', 'summaryJa', 'bullets', 'suggestion', 'disclaimer'],
};

function reportPrompt(audience) {
  const base =
    'あなたは高齢者見守りサービスのアシスタントです。以下の見守りログ（服薬の確認や、声から観察された気分の手がかりなど）を要約します。病気の診断は絶対にしないこと。観察された事実と一般的な配慮のみを述べること。';
  if (audience === 'doctor') {
    return (
      base +
      ' 読み手は医療者（地域のかかりつけ医・私人医師）です。簡潔で事実ベースの臨床的な申し送りにしてください（観察事項、頻度や傾向、気になる変化、推奨される確認・フォローアップ）。bullets は観察事項の箇条書き。disclaimer には「本要約は診断ではなく、見守りからの観察共有です」と明記してください。日本語で。'
    );
  }
  return (
    base +
    ' 読み手はご家族です。やさしく安心できる言葉で、ご本人の様子・気をつけると良い点・いつ相談すると良いかを簡潔に。bullets は要点。disclaimer には診断ではない旨を記載してください。日本語で。'
  );
}

async function makeReport({ logText, audience }) {
  const token = await getAccessToken();
  const aud = audience === 'doctor' ? 'doctor' : 'family';
  const body = {
    systemInstruction: { parts: [{ text: reportPrompt(aud) }] },
    contents: [{ role: 'user', parts: [{ text: `見守りログ:\n${logText || '（記録なし）'}` }] }],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: REPORT_SCHEMA,
    },
  };
  const res = await fetch(vertexUrl(), {
    method: 'POST',
    headers: gcpHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`vertex ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const text =
    j?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ?? '';
  return JSON.parse(text);
}

// ----- Cloud Text-to-Speech (Chirp3-HD, plain text + speakingRate) -----
async function synthesize({ text, voice }) {
  const token = await getAccessToken();
  const useVoice = voice || TTS_VOICE;
  const body = {
    input: { text },
    voice: { languageCode: 'ja-JP', name: useVoice },
    audioConfig: { audioEncoding: 'MP3', speakingRate: TTS_RATE },
  };
  const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: gcpHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`tts ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return { audioContent: data.audioContent, voice: useVoice };
}

// ----- helpers -----
function readJsonBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const sendFile = (res, filePath, method) => {
  const extension = extname(filePath);
  const headers = {
    'Content-Type': mimeTypes.get(extension) || 'application/octet-stream',
  };
  if (filePath.includes(`${sep}assets${sep}`)) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  }
  res.writeHead(200, headers);
  if (method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
};

const resolveStaticPath = (pathname) => {
  const decodedPath = decodeURIComponent(pathname);
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(distDir, normalizedPath);
  if (!filePath.startsWith(`${distDir}${sep}`) && filePath !== distDir) {
    return null;
  }
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    return filePath;
  }
  return null;
};

const server = createServer(async (req, res) => {
  if (!req.url || !req.method) {
    res.writeHead(400).end('Bad request');
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // ----- API routes -----
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        model: GEMINI_MODEL,
        voice: TTS_VOICE,
        project: GCP_PROJECT,
        location: GCP_LOCATION,
      });
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' }).end('Method not allowed');
      return;
    }
    try {
      const payload = await readJsonBody(req);
      if (url.pathname === '/api/analyze') {
        const card = await analyze(payload);
        sendJson(res, 200, { source: 'gemini-live', model: GEMINI_MODEL, card });
        return;
      }
      if (url.pathname === '/api/wellbeing') {
        if (!payload.data) {
          sendJson(res, 400, { error: 'audio data required' });
          return;
        }
        const reading = await assessWellbeing(payload);
        sendJson(res, 200, { source: 'gemini-live', model: GEMINI_MODEL, reading });
        return;
      }
      if (url.pathname === '/api/report') {
        const report = await makeReport(payload);
        sendJson(res, 200, {
          source: 'gemini-live',
          model: GEMINI_MODEL,
          audience: payload.audience === 'doctor' ? 'doctor' : 'family',
          report,
        });
        return;
      }
      if (url.pathname === '/api/tts') {
        if (!payload.text) {
          sendJson(res, 400, { error: 'text required' });
          return;
        }
        const { audioContent, voice } = await synthesize(payload);
        sendJson(res, 200, { source: 'google-cloud', voice, audioContent });
        return;
      }
      sendJson(res, 404, { error: 'unknown api route' });
    } catch (err) {
      console.error('[api error]', url.pathname, err?.message);
      sendJson(res, 502, { error: String(err?.message || err) });
    }
    return;
  }

  // ----- static files / SPA fallback (GET, HEAD) -----
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }

  const staticPath = resolveStaticPath(url.pathname);
  if (staticPath) {
    sendFile(res, staticPath, req.method);
    return;
  }

  const hasExtension = extname(url.pathname) !== '';
  const indexPath = join(distDir, 'index.html');
  if (!hasExtension && existsSync(indexPath)) {
    sendFile(res, indexPath, req.method);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
});

server.listen(port, host, () => {
  console.log(`SilverLink server listening on http://${host}:${port}`);
});
