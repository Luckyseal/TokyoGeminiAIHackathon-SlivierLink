# SilverLink Ambient Agent

SilverLink is an **Ambient Family Intelligence** demo for aging societies.

It quietly helps families notice small daily changes, respond gently, and hand off uncertainty to humans.

## Demo Views
- `/elder`: Elder-facing ambient orb interface. Large, readable font, high contrast, and gentle Japanese voice guide.
- `/family`: Family-facing view showing received manual handoff memos and semantic signals logs. Includes the interactive demo panel to inject simulated events.

## Google Cloud Integration
- **Gemini**: Uses `@google/genai` with `gemini-3.5-flash` to analyze medicine label images/documents and extract structured JSON (Medicine name, timing, description, uncertainties, handoff advice).
- **Google Cloud Text-to-Speech**: Synthesizes Japanese SSML to produce slow, calm, and reassuring speech output.
- **Visible Proof Panel**: After the elder flow runs, the app shows whether Gemini used the live Gemini path or deterministic fallback, whether voice used Google Cloud TTS or browser speech fallback, the selected voice, and the latest check time.

## Live vs Fallback Behavior
- In `Live GCP` mode with valid keys, `/elder` calls Gemini 3.5 Flash and Google Cloud Text-to-Speech from the browser demo client.
- If a key is missing or an API call fails, the flow stays demo-safe with a deterministic medicine card and browser speech fallback.
- The family semantic signal buttons are simulated edge tokens for the hackathon demo. They do not claim physical sensor integration or raw sensor stream analysis.

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
VITE_GEMINI_API_KEY=AIzaSy...
VITE_TTS_API_KEY=AIzaSy...
VITE_TTS_VOICE=ja-JP-Neural2-B
GOOGLE_CLOUD_PROJECT=geminiaihackathon-yancy0627
```
The Vite client only exposes environment variables prefixed with `VITE_`. API keys can also be pasted into the settings drawer during the demo; those pasted keys are kept in memory and are not persisted to localStorage.

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
This app is Cloud Run ready through `Dockerfile` and `server.mjs`. It serves the Vite `dist/` output and supports SPA routes such as `/elder` and `/family`.

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

Set API keys through the Cloud Run console, Secret Manager, or the in-app settings drawer during a live demo. Do not commit `.env`, `working/`, or pre-event working materials.
