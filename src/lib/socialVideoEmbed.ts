export type SocialVideoProvider = "youtube" | "vimeo" | "x" | "instagram" | "facebook" | "tiktok";

export type ParsedSocialVideo = {
  provider: SocialVideoProvider;
  canonicalUrl: string;
  iframeSrc?: string;
  blockquote?: "x" | "tiktok";
  tiktokId?: string;
};

const YT_ID = /^[\w-]{11}$/;
const IG_CODE = /^[\w-]+$/;
const DIGITS = /^\d{5,20}$/;

export const SOCIAL_VIDEO_HINT =
  "YouTube, X, Instagram, Facebook, TikTok ou Vimeo. Cole o link do vídeo ou do post.";

function hostnameOf(url: URL): string {
  return url.hostname.replace(/^www\./i, "").toLowerCase();
}

function youtubeIdFromUrl(url: URL): string | null {
  const host = hostnameOf(url);
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return YT_ID.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v && YT_ID.test(v)) return v;
    const parts = url.pathname.split("/").filter(Boolean);
    if ((parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") && parts[1] && YT_ID.test(parts[1])) {
      return parts[1];
    }
  }
  return null;
}

function vimeoIdFromUrl(url: URL): string | null {
  const host = hostnameOf(url);
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const id = host === "player.vimeo.com" && parts[0] === "video" ? parts[1] : parts[0];
  return id && DIGITS.test(id) ? id : null;
}

function xStatusUrl(url: URL): string | null {
  const host = hostnameOf(url);
  if (host !== "x.com" && host !== "twitter.com" && host !== "mobile.twitter.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const statusIdx = parts.findIndex((p) => p === "status");
  const id = statusIdx >= 0 ? parts[statusIdx + 1] : "";
  if (!id || !DIGITS.test(id.split("?")[0])) return null;
  const user = parts[0] && parts[0] !== "i" ? parts[0] : "i";
  return `https://x.com/${user}/status/${id.split("?")[0]}`;
}

function instagramFromUrl(url: URL): { code: string; kind: "p" | "reel" | "tv" } | null {
  const host = hostnameOf(url);
  if (host !== "instagram.com" && host !== "instagr.am") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const kindRaw = parts[0];
  const code = parts[1]?.replace(/\/$/, "") ?? "";
  if (!IG_CODE.test(code)) return null;
  if (kindRaw === "p" || kindRaw === "tv") return { code, kind: kindRaw };
  if (kindRaw === "reel" || kindRaw === "reels") return { code, kind: "reel" };
  return null;
}

function facebookCanonical(url: URL): string | null {
  const host = hostnameOf(url);
  if (host === "fb.watch") {
    const code = url.pathname.split("/").filter(Boolean)[0];
    return code ? `https://fb.watch/${code}` : null;
  }
  if (host !== "facebook.com" && host !== "m.facebook.com" && host !== "fb.com") return null;
  const path = url.pathname;
  if (/\/videos?\//i.test(path) || /\/reel\//i.test(path) || /\/watch\//i.test(path) || url.searchParams.has("v")) {
    return `https://www.facebook.com${path}${url.search}`;
  }
  return null;
}

function tiktokFromUrl(url: URL): { canonical: string; id: string } | null {
  const host = hostnameOf(url);
  if (host !== "tiktok.com" && host !== "m.tiktok.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const videoIdx = parts.findIndex((p) => p === "video");
  const id = videoIdx >= 0 ? parts[videoIdx + 1] : "";
  if (!id || !DIGITS.test(id)) return null;
  const user = parts[0]?.startsWith("@") ? parts[0] : "@user";
  return { canonical: `https://www.tiktok.com/${user}/video/${id}`, id };
}

export function parseSocialVideoUrl(raw: string | null | undefined): ParsedSocialVideo | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  url.protocol = "https:";

  const yt = youtubeIdFromUrl(url);
  if (yt) {
    return {
      provider: "youtube",
      canonicalUrl: `https://www.youtube.com/watch?v=${yt}`,
      iframeSrc: `https://www.youtube-nocookie.com/embed/${yt}`
    };
  }

  const vimeo = vimeoIdFromUrl(url);
  if (vimeo) {
    return {
      provider: "vimeo",
      canonicalUrl: `https://vimeo.com/${vimeo}`,
      iframeSrc: `https://player.vimeo.com/video/${vimeo}`
    };
  }

  const x = xStatusUrl(url);
  if (x) {
    return { provider: "x", canonicalUrl: x, blockquote: "x" };
  }

  const ig = instagramFromUrl(url);
  if (ig) {
    const path = ig.kind === "reel" ? "reel" : ig.kind === "tv" ? "tv" : "p";
    return {
      provider: "instagram",
      canonicalUrl: `https://www.instagram.com/${path}/${ig.code}/`,
      iframeSrc: `https://www.instagram.com/${path}/${ig.code}/embed`
    };
  }

  const fb = facebookCanonical(url);
  if (fb) {
    return {
      provider: "facebook",
      canonicalUrl: fb,
      iframeSrc: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(fb)}&show_text=false`
    };
  }

  const tt = tiktokFromUrl(url);
  if (tt) {
    return {
      provider: "tiktok",
      canonicalUrl: tt.canonical,
      blockquote: "tiktok",
      tiktokId: tt.id
    };
  }

  return null;
}

export function normalizeSocialVideoInput(raw: string | null | undefined): {
  value: string | null;
  error?: string;
} {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { value: null };
  const parsed = parseSocialVideoUrl(trimmed);
  if (!parsed) {
    return {
      value: null,
      error: "URL de vídeo não reconhecida. Use YouTube, X, Instagram, Facebook, TikTok ou Vimeo."
    };
  }
  return { value: parsed.canonicalUrl };
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** HTML confiável para widget/overlay (só iframes da allowlist ou blockquote oficial). */
export function socialVideoEmbedHtml(parsed: ParsedSocialVideo): string {
  if (parsed.iframeSrc) {
    const tall = parsed.provider === "instagram" || parsed.provider === "facebook";
    const ratio = tall ? "style=\"aspect-ratio:9/16;max-height:36rem\"" : "";
    return (
      `<figure class="iae-video" data-provider="${parsed.provider}">` +
      `<iframe src="${escapeAttr(parsed.iframeSrc)}" title="Vídeo" loading="lazy" ` +
      `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ` +
      `allowfullscreen referrerpolicy="strict-origin-when-cross-origin" ${ratio}></iframe>` +
      `</figure>`
    );
  }
  if (parsed.blockquote === "x") {
    return (
      `<figure class="iae-video iae-video-x" data-provider="x">` +
      `<blockquote class="twitter-tweet"><a href="${escapeAttr(parsed.canonicalUrl)}">Ver no X</a></blockquote>` +
      `</figure>`
    );
  }
  if (parsed.blockquote === "tiktok" && parsed.tiktokId) {
    return (
      `<figure class="iae-video iae-video-tiktok" data-provider="tiktok">` +
      `<blockquote class="tiktok-embed" cite="${escapeAttr(parsed.canonicalUrl)}" data-video-id="${escapeAttr(parsed.tiktokId)}">` +
      `<a href="${escapeAttr(parsed.canonicalUrl)}">Ver no TikTok</a></blockquote>` +
      `</figure>`
    );
  }
  return "";
}
