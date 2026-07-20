"use client";

import { useEffect, useState } from "react";
import type { TriggerDefinition } from "@/lib/control-center/types";

type TriggerMedia = NonNullable<TriggerDefinition["media"]>;

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function createDemoAudio(): Blob {
  const sampleRate = 16_000;
  const durationSeconds = 2.4;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleCount * 2, true);

  const notes = [392, 523.25, 659.25, 523.25];
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const noteIndex = Math.min(notes.length - 1, Math.floor(time / 0.6));
    const localTime = time - noteIndex * 0.6;
    const envelope = Math.min(1, localTime * 12) * Math.max(0, 1 - localTime / 0.6);
    const sample = Math.sin(2 * Math.PI * notes[noteIndex] * time) * envelope * 0.28;
    view.setInt16(44 + index * 2, Math.round(sample * 0x7fff), true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

async function createDemoVideo(): Promise<Blob | null> {
  if (typeof MediaRecorder === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const stream = canvas.captureStream(20);
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
    .find((candidate) => MediaRecorder.isTypeSupported(candidate));
  const chunks: Blob[] = [];

  return new Promise((resolve) => {
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      resolve(null);
      return;
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      stream.getTracks().forEach((track) => track.stop());
      resolve(null);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      resolve(chunks.length ? new Blob(chunks, { type: mimeType ?? "video/webm" }) : null);
    };

    const startedAt = performance.now();
    const duration = 2_200;

    function drawFrame(now: number) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const pulse = 0.55 + Math.sin(progress * Math.PI * 6) * 0.12;

      context.fillStyle = "#080b0b";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#111817";
      context.fillRect(52, 50, 856, 440);
      context.fillStyle = "#b8f34a";
      context.fillRect(52, 50, 12, 440);
      context.fillStyle = `rgba(184, 243, 74, ${pulse})`;
      context.beginPath();
      context.arc(760 - progress * 350, 335, 48, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#7f8a86";
      context.font = "700 24px system-ui";
      context.fillText("GALERAZO BOT · TRIGGER MULTIMEDIA", 105, 125);
      context.fillStyle = "#eef3f0";
      context.font = "800 62px system-ui";
      context.fillText("PRÓXIMO PARTIDO", 105, 235);
      context.fillStyle = "#b8f34a";
      context.font = "700 32px system-ui";
      context.fillText("SÁBADO · 21:30", 108, 295);
      context.fillStyle = "#6f7a77";
      context.font = "500 22px system-ui";
      context.fillText("Vista previa local generada por Bot Control Center", 108, 418);

      if (progress < 1) {
        window.requestAnimationFrame(drawFrame);
      } else if (recorder.state !== "inactive") {
        recorder.stop();
      }
    }

    recorder.start();
    window.requestAnimationFrame(drawFrame);
  });
}

export function TriggerMediaViewer({ media, triggerName }: { media?: TriggerMedia; triggerName: string }) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(media?.url ?? null);
  const [loading, setLoading] = useState(Boolean(media && media.source === "generated-demo"));

  useEffect(() => {
    let active = true;
    let objectUrl = "";

    if (!media || media.source === "remote") return undefined;

    void (async () => {
      const blob = media.kind === "audio" ? createDemoAudio() : await createDemoVideo();
      if (!active) return;
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        setResolvedUrl(objectUrl);
      }
      setLoading(false);
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [media]);

  if (!media) {
    return (
      <div className="trigger-text-preview">
        <span aria-hidden="true">Aa</span>
        <strong>Respuesta de texto</strong>
        <small>Este trigger no tiene un archivo multimedia asociado.</small>
      </div>
    );
  }

  return (
    <div className="trigger-media" aria-busy={loading}>
      <div className="trigger-media__stage">
        {loading ? <div className="trigger-media__loading">Preparando vista previa local…</div> : null}
        {!loading && resolvedUrl && media.kind === "video" ? (
          <video controls playsInline preload="metadata" src={resolvedUrl} aria-label={`Video de ${triggerName}`} />
        ) : null}
        {!loading && resolvedUrl && media.kind === "audio" ? (
          <div className="trigger-audio-player">
            <span aria-hidden="true">♫</span>
            <strong>{media.filename}</strong>
            <audio controls preload="metadata" src={resolvedUrl} aria-label={`Audio de ${triggerName}`} />
          </div>
        ) : null}
        {!loading && !resolvedUrl ? (
          <div className="trigger-media__loading">No se pudo generar la vista previa en este navegador.</div>
        ) : null}
      </div>
      <div className="trigger-media__footer">
        <div>
          <span>{media.kind === "video" ? "VIDEO" : "AUDIO"}</span>
          <strong>{media.filename}</strong>
        </div>
        {resolvedUrl ? (
          <a className="trigger-download" download={media.filename} href={resolvedUrl}>
            ↓ Descargar
          </a>
        ) : null}
      </div>
    </div>
  );
}
