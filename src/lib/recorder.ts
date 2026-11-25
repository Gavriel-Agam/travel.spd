// Recording a short voice note in the browser (the app runs as a web app).
// Opus in Ogg where the browser can write it, else AAC in MP4 (Safari), else
// Opus in WebM (Chrome). Mono speech at a low bitrate keeps 30 s under ~100 KB.
import { Platform } from 'react-native';
import { forgetPerm, notePerm, permState } from './permissions';

const TYPES = ['audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];

/** True where this device can record in the app. */
export function canRecord(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

function pickType(): string | undefined {
  return TYPES.find((t) => {
    try {
      return MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  });
}

export type Recording = { blob: Blob; mime: string; durationMs: number };

export type Recorder = {
  /** 0..1, how loud it is now (for the level ring). */
  level: () => number;
  stop: () => Promise<Recording>;
  cancel: () => void;
};

/**
 * Asks for the microphone (only here, when recording really starts) and records.
 * Throws 'mic_denied' or 'mic_unavailable'. After a "no" it doesn't ask again
 * (no repeated prompts on iPhone) unless `retry` (the person tapped to try again).
 */
export async function startRecording(retry = false): Promise<Recorder> {
  if (retry) forgetPerm('microphone');
  else if ((await permState('microphone')) === 'denied') throw new Error('mic_denied');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    const name = (e as { name?: string })?.name;
    const denied = name === 'NotAllowedError' || name === 'SecurityError';
    if (denied) notePerm('microphone', 'denied');
    throw new Error(denied ? 'mic_denied' : 'mic_unavailable');
  }
  notePerm('microphone', 'granted');
  const type = pickType();
  const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : null), audioBitsPerSecond: 24000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  // Loudness for the ring around the button (optional: some browsers block it)
  let analyser: AnalyserNode | null = null;
  let ctx: AudioContext | null = null;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      ctx = new AC();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
    }
  } catch {
    analyser = null;
  }
  const buf = new Uint8Array(128);
  const started = Date.now();
  const release = () => {
    stream.getTracks().forEach((t) => t.stop());
    ctx?.close().catch(() => {});
  };
  rec.start(250);

  return {
    level: () => {
      if (!analyser) return 0;
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      return Math.min(1, peak / 64);
    },
    stop: () =>
      new Promise<Recording>((resolve) => {
        rec.onstop = () => {
          release();
          const mime = (rec.mimeType || type || 'audio/webm').split(';')[0];
          resolve({ blob: new Blob(chunks, { type: mime }), mime, durationMs: Date.now() - started });
        };
        if (rec.state === 'inactive') rec.onstop(new Event('stop'));
        else rec.stop();
      }),
    cancel: () => {
      rec.onstop = null;
      if (rec.state !== 'inactive') rec.stop();
      release();
    },
  };
}

/** Bare base64 of a recording. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]*(;[^,]*)?,/, ''));
    r.onerror = () => reject(new Error('audio_unreadable'));
    r.readAsDataURL(blob);
  });
}
