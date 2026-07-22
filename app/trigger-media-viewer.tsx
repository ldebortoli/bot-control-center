"use client";

import { useEffect, useRef, useState } from "react";
import type { AnimationItem } from "lottie-web";
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

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, 0.92));
}

async function createDemoImage(sticker: boolean, mimeType: string): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = sticker ? 512 : 960;
  canvas.height = sticker ? 512 : 540;
  const context = canvas.getContext("2d");
  if (!context) return null;

  if (sticker) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#b8f34a";
    context.beginPath();
    context.arc(256, 256, 206, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#0b100f";
    context.beginPath();
    context.arc(190, 225, 22, 0, Math.PI * 2);
    context.arc(322, 225, 22, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = 24;
    context.lineCap = "round";
    context.strokeStyle = "#0b100f";
    context.beginPath();
    context.arc(256, 265, 98, 0.2, Math.PI - 0.2);
    context.stroke();
  } else {
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#101716");
    gradient.addColorStop(1, "#080b0b");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#b8f34a";
    context.fillRect(58, 56, 12, 428);
    context.fillStyle = "#6e7a76";
    context.font = "700 24px system-ui";
    context.fillText("ENCUESTA POSTPARTIDO", 112, 135);
    context.fillStyle = "#eef3f0";
    context.font = "800 58px system-ui";
    context.fillText("JUGADOR", 108, 245);
    context.fillText("DESTACADO", 108, 315);
    context.fillStyle = "#b8f34a";
    context.font = "700 28px system-ui";
    context.fillText("VOTÁ EN EL CHAT", 112, 402);
  }

  return canvasToBlob(canvas, mimeType);
}

async function createDemoVideo(sticker: boolean): Promise<Blob | null> {
  if (typeof MediaRecorder === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = sticker ? 512 : 960;
  canvas.height = sticker ? 512 : 540;
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

      if (sticker) {
        const wave = Math.sin(progress * Math.PI * 4) * 34;
        context.save();
        context.translate(256, 256);
        context.rotate(Math.sin(progress * Math.PI * 4) * 0.2);
        context.fillStyle = "#b8f34a";
        context.beginPath();
        context.roundRect(-165, -110 + wave, 330, 220, 48);
        context.fill();
        context.fillStyle = "#0b100f";
        context.font = "900 74px system-ui";
        context.textAlign = "center";
        context.fillText("GA", 0, 26 + wave);
        context.restore();
      } else {
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
      }

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

function createDemoLottie() {
  return {
    v: "5.9.6",
    fr: 30,
    ip: 0,
    op: 60,
    w: 512,
    h: 512,
    nm: "Escudo Galerazo",
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: "Escudo animado",
        sr: 1,
        ks: {
          o: { a: 0, k: 100 },
          r: {
            a: 1,
            k: [
              { t: 0, s: [0], e: [360], i: { x: [0.67], y: [1] }, o: { x: [0.33], y: [0] } },
              { t: 60, s: [360] },
            ],
          },
          p: { a: 0, k: [256, 256, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 0, k: [100, 100, 100] },
        },
        ao: 0,
        shapes: [
          {
            ty: "gr",
            it: [
              { d: 1, ty: "el", s: { a: 0, k: [330, 330] }, p: { a: 0, k: [0, 0] }, nm: "Círculo" },
              { ty: "fl", c: { a: 0, k: [0.72, 0.95, 0.29, 1] }, o: { a: 0, k: 100 }, r: 1, bm: 0, nm: "Lima" },
              { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 } },
            ],
            nm: "Base",
          },
          {
            ty: "gr",
            it: [
              { ty: "rc", d: 1, s: { a: 0, k: [72, 210] }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 18 }, nm: "Marca" },
              { ty: "fl", c: { a: 0, k: [0.03, 0.05, 0.04, 1] }, o: { a: 0, k: 100 }, r: 1, bm: 0, nm: "Tinta" },
              { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 } },
            ],
            nm: "Franja",
          },
        ],
        ip: 0,
        op: 60,
        st: 0,
        bm: 0,
      },
    ],
  };
}

async function createDemoTgs(): Promise<Blob> {
  const json = JSON.stringify(createDemoLottie());
  if (typeof CompressionStream === "undefined") {
    return new Blob([json], { type: "application/json" });
  }

  const compressed = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(compressed).arrayBuffer();
  return new Blob([buffer], { type: "application/x-tgsticker" });
}

function isTgs(media: TriggerMedia) {
  return media.mimeType === "application/x-tgsticker" || media.filename.toLocaleLowerCase("es").endsWith(".tgs");
}

function isVideoSticker(media: TriggerMedia) {
  return media.kind === "sticker" && media.mimeType.startsWith("video/");
}

async function createDemoMedia(media: TriggerMedia): Promise<Blob | null> {
  if (media.kind === "audio") return createDemoAudio();
  if (media.kind === "video") return createDemoVideo(false);
  if (media.kind === "image") return createDemoImage(false, media.mimeType);
  if (isTgs(media)) return createDemoTgs();
  if (isVideoSticker(media)) return createDemoVideo(true);
  return createDemoImage(true, media.mimeType);
}

async function readTgsAnimation(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo descargar el sticker (${response.status}).`);
  const blob = await response.blob();

  if (typeof DecompressionStream !== "undefined") {
    try {
      const decompressed = blob.stream().pipeThrough(new DecompressionStream("gzip"));
      return JSON.parse(await new Response(decompressed).text()) as Record<string, unknown>;
    } catch {
      // Algunos adaptadores pueden entregar el JSON de Lottie ya descomprimido.
    }
  }

  return JSON.parse(await blob.text()) as Record<string, unknown>;
}

function TgsStickerPlayer({ triggerName, url }: { triggerName: string; url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let active = true;
    let animation: AnimationItem | null = null;

    void (async () => {
      try {
        const [animationData, lottieModule] = await Promise.all([
          readTgsAnimation(url),
          import("lottie-web/build/player/lottie_light"),
        ]);
        if (!active) return;
        container.replaceChildren();
        animation = lottieModule.default.loadAnimation({
          animationData,
          autoplay: true,
          container,
          loop: true,
          renderer: "svg",
        });
      } catch {
        if (active) container.textContent = "No se pudo reproducir este sticker TGS.";
      }
    })();

    return () => {
      active = false;
      animation?.destroy();
      container.replaceChildren();
    };
  }, [url]);

  return (
    <div className="trigger-sticker-player trigger-sticker-player--tgs" ref={containerRef} role="img" aria-label={`Sticker animado de ${triggerName}`}>
      Preparando sticker TGS…
    </div>
  );
}

function mediaFormatLabel(media: TriggerMedia) {
  if (media.kind === "file") return "ARCHIVO";
  if (media.kind === "video") return "VIDEO";
  if (media.kind === "audio") return "AUDIO";
  if (media.kind === "image") return media.mimeType === "image/gif" ? "GIF" : "IMAGEN";
  if (isTgs(media)) return "STICKER TGS";
  if (isVideoSticker(media)) return "STICKER WEBM";
  return "STICKER";
}

export function TriggerMediaViewer({ media, triggerName }: { media?: TriggerMedia; triggerName: string }) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(media?.url ?? null);
  const [loading, setLoading] = useState(Boolean(media && media.source === "generated-demo"));

  useEffect(() => {
    let active = true;
    let objectUrl = "";

    if (!media || media.source === "remote") return undefined;

    void (async () => {
      const blob = await createDemoMedia(media);
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
      <div className={`trigger-media__stage trigger-media__stage--${media.kind}`}>
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
        {!loading && resolvedUrl && media.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="trigger-image-preview" src={resolvedUrl} alt={`Imagen de ${triggerName}`} />
        ) : null}
        {!loading && resolvedUrl && media.kind === "sticker" && isTgs(media) ? (
          <TgsStickerPlayer triggerName={triggerName} url={resolvedUrl} />
        ) : null}
        {!loading && resolvedUrl && isVideoSticker(media) ? (
          <video className="trigger-sticker-player" autoPlay loop muted playsInline preload="auto" src={resolvedUrl} aria-label={`Sticker animado de ${triggerName}`} />
        ) : null}
        {!loading && resolvedUrl && media.kind === "sticker" && !isTgs(media) && !isVideoSticker(media) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="trigger-sticker-player" src={resolvedUrl} alt={`Sticker de ${triggerName}`} />
        ) : null}
        {!loading && resolvedUrl && media.kind === "file" ? (
          <div className="trigger-text-preview trigger-file-preview">
            <span aria-hidden="true">↓</span>
            <strong>{media.filename}</strong>
            <small>Este formato se puede descargar, pero no tiene vista previa integrada.</small>
          </div>
        ) : null}
        {!loading && !resolvedUrl ? (
          <div className="trigger-media__loading">No se pudo generar la vista previa en este navegador.</div>
        ) : null}
      </div>
      <div className="trigger-media__footer">
        <div>
          <span>{mediaFormatLabel(media)}</span>
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
