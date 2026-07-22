"use client";

import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";
import type { TriggerDefinition } from "@/lib/control-center/types";

type TriggerMedia = NonNullable<TriggerDefinition["media"]>;

function isTgs(media: TriggerMedia) {
  return media.mimeType === "application/x-tgsticker" || media.filename.toLocaleLowerCase("es").endsWith(".tgs");
}

function isVideoSticker(media: TriggerMedia) {
  return media.kind === "sticker" && media.mimeType.startsWith("video/");
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
  if (!media) {
    return (
      <div className="trigger-text-preview">
        <span aria-hidden="true">Aa</span>
        <strong>Respuesta de texto</strong>
        <small>Este trigger no tiene un archivo multimedia asociado.</small>
      </div>
    );
  }

  const resolvedUrl = media.url;

  return (
    <div className="trigger-media">
      <div className={`trigger-media__stage trigger-media__stage--${media.kind}`}>
        {resolvedUrl && media.kind === "video" ? <video controls playsInline preload="metadata" src={resolvedUrl} aria-label={`Video de ${triggerName}`} /> : null}
        {resolvedUrl && media.kind === "audio" ? (
          <div className="trigger-audio-player"><span aria-hidden="true">♫</span><strong>{media.filename}</strong><audio controls preload="metadata" src={resolvedUrl} aria-label={`Audio de ${triggerName}`} /></div>
        ) : null}
        {resolvedUrl && media.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="trigger-image-preview" src={resolvedUrl} alt={`Imagen de ${triggerName}`} />
        ) : null}
        {resolvedUrl && media.kind === "sticker" && isTgs(media) ? <TgsStickerPlayer triggerName={triggerName} url={resolvedUrl} /> : null}
        {resolvedUrl && isVideoSticker(media) ? <video className="trigger-sticker-player" autoPlay loop muted playsInline preload="auto" src={resolvedUrl} aria-label={`Sticker animado de ${triggerName}`} /> : null}
        {resolvedUrl && media.kind === "sticker" && !isTgs(media) && !isVideoSticker(media) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="trigger-sticker-player" src={resolvedUrl} alt={`Sticker de ${triggerName}`} />
        ) : null}
        {resolvedUrl && media.kind === "file" ? (
          <div className="trigger-text-preview trigger-file-preview"><span aria-hidden="true">↓</span><strong>{media.filename}</strong><small>Este formato se puede descargar, pero no tiene vista previa integrada.</small></div>
        ) : null}
        {!resolvedUrl ? <div className="trigger-media__loading">El origen no entregó una URL para este archivo.</div> : null}
      </div>
      <div className="trigger-media__footer">
        <div><span>{mediaFormatLabel(media)}</span><strong>{media.filename}</strong></div>
        {resolvedUrl ? <a className="trigger-download" download={media.filename} href={resolvedUrl}>↓ Descargar</a> : null}
      </div>
    </div>
  );
}
