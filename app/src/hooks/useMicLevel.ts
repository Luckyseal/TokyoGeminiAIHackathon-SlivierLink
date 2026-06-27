// Microphone hook for the audio-reactive orb + on-demand short-clip capture.
// Privacy: opt-in only; audio is processed in-memory (Web Audio). The loudness
// number is never stored; captured clips are short, used once for analysis, and
// never persisted on the client.

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AudioClip {
  data: string; // base64 WAV (16-bit PCM mono)
  mimeType: string; // 'audio/wav'
  peak: number; // max abs amplitude 0..1, for client-side silence gating
}

export interface MicLevel {
  level: number; // smoothed loudness, 0..1
  enabled: boolean; // user toggled mic on
  listening: boolean; // mic stream actually active
  error: string | null;
  toggle: () => void;
  captureWav: (ms?: number) => Promise<AudioClip | null>;
}

// Encode mono Float32 PCM as a base64 16-bit WAV (a format Gemini accepts).
function encodeWavBase64(samples: Float32Array, sampleRate: number): string {
  const frames = samples.length;
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + frames * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, frames * 2, true);
  let off = 44;
  for (let i = 0; i < frames; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function useMicLevel(): MicLevel {
  const [enabled, setEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const smoothRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let raf: number | null = null;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        ctxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        sourceRef.current = source;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);

        setListening(true);
        setError(null);

        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length); // ~0..1
          const norm = Math.min(1, rms * 3.2); // gentle gain
          const prev = smoothRef.current;
          const factor = norm > prev ? 0.5 : 0.12; // fast attack, slow release
          const next = prev + (norm - prev) * factor;
          smoothRef.current = next;
          setLevel(Math.round(next * 1000) / 1000);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'microphone unavailable');
        setListening(false);
        setEnabled(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      if (raf != null) cancelAnimationFrame(raf);
      sourceRef.current = null;
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
      if (stream) stream.getTracks().forEach((t) => t.stop());
      smoothRef.current = 0;
      setLevel(0);
      setListening(false);
    };
  }, [enabled]);

  // Capture a short clip from the live mic and return it as base64 WAV.
  const captureWav = useCallback((ms = 6000): Promise<AudioClip | null> => {
    return new Promise((resolve) => {
      const ctx = ctxRef.current;
      const source = sourceRef.current;
      if (!ctx || !source) {
        resolve(null);
        return;
      }
      let processor: ScriptProcessorNode;
      try {
        processor = ctx.createScriptProcessor(4096, 1, 1);
      } catch {
        resolve(null);
        return;
      }
      const mute = ctx.createGain();
      mute.gain.value = 0;
      const chunks: Float32Array[] = [];
      processor.onaudioprocess = (e) => {
        chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(mute);
      mute.connect(ctx.destination);

      window.setTimeout(() => {
        processor.disconnect();
        mute.disconnect();
        processor.onaudioprocess = null;
        let len = 0;
        for (const c of chunks) len += c.length;
        const pcm = new Float32Array(len);
        let off = 0;
        for (const c of chunks) {
          pcm.set(c, off);
          off += c.length;
        }
        let peak = 0;
        for (let i = 0; i < pcm.length; i++) {
          const a = Math.abs(pcm[i]);
          if (a > peak) peak = a;
        }
        resolve({ data: encodeWavBase64(pcm, ctx.sampleRate), mimeType: 'audio/wav', peak });
      }, ms);
    });
  }, []);

  const toggle = useCallback(() => setEnabled((e) => !e), []);

  return { level, enabled, listening, error, toggle, captureWav };
}
