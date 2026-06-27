# SilverLink Ambient Agent

SilverLink is an **Ambient Family Intelligence** demo for aging societies.

It quietly helps families notice small daily changes, respond gently, and hand off uncertainty to humans.

## Demo Views
- `/elder`: Elder-facing ambient orb interface. Large, readable font, high contrast, and gentle Japanese voice guide.
- `/family`: Family-facing view showing care memory, today's follow-up actions, received handoff memos, and semantic signal logs. Includes the interactive demo panel to inject simulated events.
- `/doctor`: Doctor-facing observation handoff with the same care memory and action status, summarized for a clinician.

## Google Cloud Integration
- **Gemini**: Cloud Run calls Vertex AI with `gemini-3.5-flash` to analyze medicine label images/documents, short wellbeing audio clips, and caregiver/doctor summaries.
- **Google Cloud Text-to-Speech**: Cloud Run calls Google Cloud Text-to-Speech with Japanese Chirp3-HD voices for slow, calm, and reassuring speech output.
- **Visible Proof Panel**: After the elder flow runs, the app shows whether Gemini used the live Gemini path or deterministic fallback, whether voice used Google Cloud TTS or browser speech fallback, the selected voice, and the latest check time.

## Live vs Fallback Behavior
- In `Live GCP` mode, the browser calls Cloud Run `/api/*` endpoints. The server uses the Cloud Run service account to call Vertex AI Gemini and Google Cloud Text-to-Speech.
- The browser does not store or require Gemini/TTS API keys. If a server API call fails, the flow stays demo-safe with a deterministic medicine card and browser speech fallback.
- The family semantic signal buttons are simulated edge tokens for the hackathon demo. They do not claim physical sensor integration or raw sensor stream analysis.
- Care memory is local demo state: yesterday's low-mood observation becomes today's concrete family actions, then the action status is included in Gemini summaries.

## Safety & Compliance Boundary
- **No Diagnosis**: SilverLink does not diagnose any condition.
- **No Dosage Modification**: SilverLink never recommends modifying medicine dosage.
- **Human Handoff**: Safe uncertainty fallback. It redirects to a pharmacist, family member, or doctor when details are unclear.

## Hackathon Compliance Notes
- **Prepared Before the Event**: Product concept, narrative script, target SSML templates, CSS design tokens, and API structure.
- **Built During the Event**: React + TypeScript client implementation, Zustand state stores, Google Cloud API integration, fallback handling, and mock injection dashboard.

## Local Development
1. Create a `.env` file in this directory:
```bash
GOOGLE_CLOUD_PROJECT=geminiaihackathon-yancy0627
GOOGLE_CLOUD_LOCATION=global
GEMINI_MODEL=gemini-3.5-flash
TTS_VOICE=ja-JP-Chirp3-HD-Sulafat
```
For Cloud Run, these values should be set as service environment variables when needed. Local live API testing also needs Google Cloud auth, for example `GCP_ACCESS_TOKEN` or a Cloud Run/metadata-server environment. The settings drawer controls demo mode, voice, and doctor handoff target only.

2. Install & Run:
```bash
npm install
npm run dev
```

3. Build:
```bash
npm run build
```

4. Run the production build locally:
```bash
npm start
```
The production server reads `PORT` from the environment and falls back to `8080`.

## Cloud Run Deployment Path
This app is Cloud Run ready through `Dockerfile` and `server.mjs`. It serves the Vite `dist/` output, supports SPA routes such as `/elder`, `/family`, and `/doctor`, and exposes server-side `/api/analyze`, `/api/wellbeing`, `/api/report`, `/api/tts`, and `/api/health`.

Current deployed demo:

```text
https://silverlink-ambient-agent-541619195517.asia-northeast1.run.app
```

Example deployment flow from the repository root:
```bash
gcloud run deploy silverlink-ambient-agent \
  --source app \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --project geminiaihackathon-yancy0627
```

Example deployment flow from inside `app/`:
```bash
gcloud run deploy silverlink-ambient-agent \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --project geminiaihackathon-yancy0627
```

Set Google Cloud project/model/voice configuration through Cloud Run environment variables. Do not commit `.env`, `working/`, or pre-event working materials.
