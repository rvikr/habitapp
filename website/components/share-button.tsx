"use client";

import { useState, useCallback } from "react";

interface Props {
  shareText: string;
  shareUrl: string;
  cardUrl?: string;
  label?: string;
  className?: string;
}

const PLATFORMS = [
  {
    id: "twitter",
    name: "X",
    color: "bg-black",
    getHref: (text: string, url: string) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text + "\n" + url)}`,
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.727-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    color: "bg-[#25D366]",
    getHref: (text: string, url: string) =>
      `https://wa.me/?text=${encodeURIComponent(text + "\n" + url)}`,
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
  },
  {
    id: "facebook",
    name: "Facebook",
    color: "bg-[#1877F2]",
    getHref: (_text: string, url: string) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  {
    id: "telegram",
    name: "Telegram",
    color: "bg-[#229ED9]",
    getHref: (text: string, url: string) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    color: "bg-[#0A66C2]",
    getHref: (text: string, url: string) =>
      `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(url)}&summary=${encodeURIComponent(text)}`,
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    id: "reddit",
    name: "Reddit",
    color: "bg-[#FF4500]",
    getHref: (text: string, url: string) =>
      `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
      </svg>
    ),
  },
];

export default function ShareButton({ shareText, shareUrl, cardUrl, label = "Share", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const handleOpen = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      // Try sharing with the card image file when supported
      if (cardUrl && navigator.canShare) {
        try {
          const blob = await fetch(cardUrl).then((r) => r.blob());
          const file = new File([blob], "lagan-card.png", { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], text: shareText, url: shareUrl });
            return;
          }
        } catch {
          // fall through
        }
      }
      try {
        await navigator.share({ text: shareText, url: shareUrl });
        return;
      } catch {
        // fall through to modal
      }
    }
    setOpen(true);
  }, [shareText, shareUrl, cardUrl]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  }, [shareText, shareUrl]);

  return (
    <>
      <button
        onClick={handleOpen}
        className={`flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/70 transition-colors ${className}`}
      >
        <span className="material-symbols-outlined text-base leading-none">share</span>
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-surface-container-high border border-outline-variant rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-on-background text-lg">Share</h3>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant hover:bg-outline-variant transition-colors"
              >
                <span className="material-symbols-outlined text-base leading-none">close</span>
              </button>
            </div>

            {/* Card preview */}
            {cardUrl && (
              <div className="mb-5 space-y-2">
                <div className="relative w-full rounded-2xl overflow-hidden bg-[#0D0D0D]" style={{ aspectRatio: "1200/630" }}>
                  {!imgLoaded && (
                    <div className="absolute inset-0 animate-pulse bg-neutral-800 rounded-2xl" />
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cardUrl}
                    alt="Your Lagan achievement card"
                    loading="eager"
                    className="w-full h-full object-cover"
                    onLoad={() => setImgLoaded(true)}
                  />
                </div>
                <div className="flex gap-2">
                  <a
                    href={cardUrl}
                    download="lagan-card.png"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-background border border-outline-variant text-white hover:bg-surface-container-low transition-colors text-xs font-semibold"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="material-symbols-outlined text-sm leading-none">download</span>
                    Save Card
                  </a>
                  <a
                    href={`${cardUrl}&ratio=portrait`}
                    download="lagan-card-story.png"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-outline-variant/60 text-on-surface-variant hover:bg-surface-container transition-colors text-xs font-semibold"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="material-symbols-outlined text-sm leading-none">crop_portrait</span>
                    For Stories
                  </a>
                </div>
              </div>
            )}

            {/* Preview text (shown when no card) */}
            {!cardUrl && (
              <p className="text-sm text-on-surface-variant mb-5 leading-relaxed bg-surface-container rounded-2xl p-3 line-clamp-3">
                {shareText}
              </p>
            )}

            {/* Platform grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {PLATFORMS.map((p) => (
                <a
                  key={p.id}
                  href={p.getHref(shareText, shareUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div
                    className={`w-12 h-12 rounded-2xl ${p.color} flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm`}
                  >
                    {p.icon}
                  </div>
                  <span className="text-[10px] text-on-surface-variant font-medium text-center leading-tight">
                    {p.name}
                  </span>
                </a>
              ))}
            </div>

            {/* Copy link */}
            <button
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-surface-container hover:bg-surface-container-highest transition-colors text-sm font-semibold text-on-background"
            >
              <span className="material-symbols-outlined text-base leading-none">
                {copied ? "check_circle" : "content_copy"}
              </span>
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
