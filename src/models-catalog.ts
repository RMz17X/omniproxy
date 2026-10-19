/**
 * Static pricing catalog scraped from Google's published Gemini API pricing
 * table (ai.google.dev/gemini-api/docs/pricing).
 *
 * The model LIST served by /models is fetched live from the Generative
 * Language API. This file only supplies the commercial metadata Google does
 * not expose over the API: free-tier availability and per-1M-token price.
 *
 * free: true  -> model has a free tier (rate limited, no charge)
 * free: false -> paid tier only
 * free: null  -> Google publishes no explicit free-tier row
 */

export type ModelKind =
  | "text"
  | "tts"
  | "image"
  | "video"
  | "audio"
  | "live"
  | "transcribe"
  | "embedding"
  | "robotics"
  | "omni";

export type CatalogEntry = {
  id: string;
  name: string;
  kind: ModelKind;
  free: boolean | null;
  freeLabel: string;
  /** USD per 1M input tokens, null when Google bills per unit */
  inUsd: number | null;
  /** USD per 1M output tokens */
  outUsd: number | null;
  /** verbatim price cell, for unit-billed models */
  inRaw: string;
  outRaw: string;
};

/** Pricing snapshot date; bump when the table is re-scraped. */
export const PRICING_AS_OF = "2026-10-19";

export const CATALOG: CatalogEntry[] = [
  {"id": "gemini-4-argon", "name": "Gemini 4 Argon", "kind": "text", "free": false, "freeLabel": "Not available", "inUsd": 2.0, "outUsd": 10.0, "inRaw": "$2.00 through November 30, 2026. | $4.00 starting December 1, 2026.", "outRaw": "$10.00 through November 30, 2026. | $20.00 starting December 1, 2026."},
  {"id": "gemini-3.8-flash", "name": "Gemini 3.8 Flash", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.75, "outUsd": 3.75, "inRaw": "$0.75 through December 31, 2026. | $1.50 starting January 1, 2027.", "outRaw": "$3.75 through December 31, 2026. | $7.50 starting January 1, 2027."},
  {"id": "gemini-3.6-flash", "name": "Gemini 3.6 Flash", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.75, "outUsd": 3.75, "inRaw": "$0.75 through December 31, 2026. | $1.50 starting January 1, 2027.", "outRaw": "$3.75 through December 31, 2026. | $7.50 starting January 1, 2027."},
  {"id": "gemini-3.8-live", "name": "Gemini 3.8 Live, Gemini 3.8 Live Extended Thinking, and Gemini 3.1 Flash Live Preview", "kind": "live", "free": true, "freeLabel": "Free of charge", "inUsd": 0.75, "outUsd": 4.5, "inRaw": "$0.75 (text) | $3.00 or $0.005/min (audio) | $1.00 or $0.002/min (image/video)", "outRaw": "$4.50 (text) | $12.00 or $0.018/min (audio)"},
  {"id": "gemini-3.5-live-translate-preview", "name": "Gemini 3.5 Live Translate", "kind": "live", "free": true, "freeLabel": "Free of charge", "inUsd": 3.5, "outUsd": 21.0, "inRaw": "$3.50 or $0.0053/min* (audio)", "outRaw": "$21.00 or $0.0315/min* (audio)"},
  {"id": "gemini-3.5-transcribe-live", "name": "Gemini 3.5 Transcribe Live", "kind": "live", "free": true, "freeLabel": "Free of charge", "inUsd": 3.5, "outUsd": 21.0, "inRaw": "$3.50 or $0.005/min* (audio)", "outRaw": "$21.00 or $0.004/min* (text)"},
  {"id": "gemini-3.5-transcribe", "name": "Gemini 3.5 Transcribe", "kind": "transcribe", "free": true, "freeLabel": "Free of charge", "inUsd": 2.0, "outUsd": 12.0, "inRaw": "$2.00 or $0.003/min* (audio)", "outRaw": "$12.00 or $0.002/min* (text)"},
  {"id": "gemini-3.5-flash-lite", "name": "Gemini 3.5 Flash-Lite", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.3, "outUsd": 2.5, "inRaw": "$0.30 (text / image / video / audio)", "outRaw": "$2.50"},
  {"id": "gemini-3.1-flash-lite", "name": "Gemini 3.1 Flash-Lite", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.25, "outUsd": 1.5, "inRaw": "$0.25 (text / image / video) | $0.50 (audio)", "outRaw": "$1.50"},
  {"id": "gemini-omni-1.1-flash", "name": "Gemini Omni Flash", "kind": "omni", "free": false, "freeLabel": "Not available", "inUsd": 1.5, "outUsd": 9.0, "inRaw": "$1.50 (text / image / video / audio)", "outRaw": "$9.00 (text) | $17.50 (video)*"},
  {"id": "gemini-omni-flash-preview", "name": "Gemini Omni Flash Preview", "kind": "omni", "free": false, "freeLabel": "Not available", "inUsd": 1.5, "outUsd": 9.0, "inRaw": "$1.50 (text / image / video / audio)", "outRaw": "$9.00 (text) | $17.50 (video)*"},
  {"id": "gemini-3.1-pro-preview", "name": "Gemini 3.1 Pro Preview", "kind": "text", "free": false, "freeLabel": "Not available", "inUsd": 2.0, "outUsd": 12.0, "inRaw": "$2.00, prompts 200k tokens", "outRaw": "$12.00, prompts 200k"},
  {"id": "gemini-nano-banana-2.1", "name": "Gemini Nano Banana 2.1 🍌", "kind": "text", "free": false, "freeLabel": "Not available", "inUsd": 1.5, "outUsd": 7.5, "inRaw": "$1.50 (text/image/video)", "outRaw": "$7.50 (text and thinking) | $30.00 (images) | Equivalent to $0.0336 per 1K image*, | $0.0504 per 2K image*, | and $0.113 per 4K image*."},
  {"id": "gemini-3.1-flash-image", "name": "Gemini 3.1 Flash Image (Nano Banana 2) 🍌", "kind": "image", "free": false, "freeLabel": "Not available", "inUsd": 0.5, "outUsd": 3.0, "inRaw": "$0.50 (text/image)", "outRaw": "$3 (text and thinking) | $60.00 (images) | Equivalent to $0.045 per 0.5K image* | $0.067 per 1K image*, $0.101 per 2K image*, and $0.151 per 4K image*."},
  {"id": "gemini-3.1-flash-lite-image", "name": "Gemini 3.1 Flash Lite Image (Nano Banana 2 Lite) 🍌", "kind": "image", "free": false, "freeLabel": "Not available", "inUsd": 0.25, "outUsd": 1.5, "inRaw": "$0.25 (text/image/video)", "outRaw": "$1.50 (text and thinking) | $30.00 (images) | Equivalent to $0.0336 per 1K resolution image*"},
  {"id": "gemini-3.8-flash-tts", "name": "Gemini 3.8 Flash TTS", "kind": "tts", "free": true, "freeLabel": "Free of charge", "inUsd": 0.5, "outUsd": 9.0, "inRaw": "$0.50 (text) through December 31, 2026. | $1.00 (text) starting January 1, 2027.", "outRaw": "$9.00 (audio) through December 31, 2026. | $18.00 (audio) starting January 1, 2027. | Equivalent to $0.00225 per 10s audio* through December 31, 2026. | Equivalent to $0.0045 per 10s audio* starting January 1, 2027."},
  {"id": "gemini-3.8-flash-lite-tts", "name": "Gemini 3.8 Flash-Lite TTS", "kind": "tts", "free": true, "freeLabel": "Free of charge", "inUsd": 0.5, "outUsd": 6.0, "inRaw": "$0.50 (text) through December 31, 2026. | $1.00 (text) starting January 1, 2027.", "outRaw": "$6.00 (audio) through December 31, 2026. | $12.00 (audio) starting January 1, 2027. | Equivalent to $0.0015 per 10s audio* through December 31, 2026. | Equivalent to $0.003 per 10s audio* starting January 1, 2027."},
  {"id": "gemini-3.1-flash-tts-preview", "name": "Gemini 3.1 Flash TTS Preview", "kind": "tts", "free": true, "freeLabel": "Free of charge", "inUsd": 1.0, "outUsd": 20.0, "inRaw": "$1.00 (text)", "outRaw": "$20.00 (audio)"},
  {"id": "gemini-3-flash-preview", "name": "Gemini 3 Flash Preview", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.5, "outUsd": 3.0, "inRaw": "$0.50 (text / image / video) | $1.00 (audio)", "outRaw": "$3.00"},
  {"id": "gemini-3-pro-image", "name": "Gemini 3 Pro Image (Nano Banana Pro) 🍌", "kind": "image", "free": false, "freeLabel": "Not available", "inUsd": 2.0, "outUsd": 12.0, "inRaw": "$2.00 (text/image), | equivalent to $0.0011 per image*", "outRaw": "$12.00 (text and thinking) | $120.00 (images) | Equivalent to $0.134 per 1K/2K image** | and $0.24 per 4K image**"},
  {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 1.25, "outUsd": 10.0, "inRaw": "$1.25, prompts 200k tokens", "outRaw": "$10.00, prompts 200k"},
  {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.3, "outUsd": 2.5, "inRaw": "$0.30 (text / image / video) | $1.00 (audio)", "outRaw": "$2.50"},
  {"id": "gemini-2.5-flash-lite", "name": "Gemini 2.5 Flash-Lite", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.1, "outUsd": 0.4, "inRaw": "$0.10 (text / image / video) | $0.30 (audio)", "outRaw": "$0.40"},
  {"id": "gemini-2.5-flash-native-audio", "name": "Gemini 2.5 Flash Native Audio (Live API)", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.5, "outUsd": 2.0, "inRaw": "$0.50 (text) | $3.00 (audio / video)", "outRaw": "$2.00 (text) | $12.00 (audio)"},
  {"id": "gemini-2.5-flash-image", "name": "Gemini 2.5 Flash Image (Nano Banana) 🍌", "kind": "image", "free": false, "freeLabel": "Not available", "inUsd": 0.3, "outUsd": 0.039, "inRaw": "$0.30 (text / image)", "outRaw": "$0.039 per image*"},
  {"id": "gemini-2.5-flash-preview-tts", "name": "Gemini 2.5 Flash Preview TTS", "kind": "tts", "free": true, "freeLabel": "Free of charge", "inUsd": 0.5, "outUsd": 10.0, "inRaw": "$0.50 (text)", "outRaw": "$10.00 (audio)"},
  {"id": "gemini-2.5-pro-preview-tts", "name": "Gemini 2.5 Pro Preview TTS", "kind": "tts", "free": false, "freeLabel": "Not available", "inUsd": 1.0, "outUsd": 20.0, "inRaw": "$1.00 (text)", "outRaw": "$20.00 (audio)"},
  {"id": "veo-3.1", "name": "Veo 3.1", "kind": "video", "free": null, "freeLabel": "unknown", "inUsd": null, "outUsd": null, "inRaw": "", "outRaw": ""},
  {"id": "lyria-3-5", "name": "Lyria 3.5", "kind": "audio", "free": null, "freeLabel": "unknown", "inUsd": null, "outUsd": null, "inRaw": "", "outRaw": ""},
  {"id": "lyria-3", "name": "Lyria 3", "kind": "audio", "free": null, "freeLabel": "unknown", "inUsd": null, "outUsd": null, "inRaw": "", "outRaw": ""},
  {"id": "gemini-embedding-2", "name": "Gemini Embedding 2", "kind": "embedding", "free": null, "freeLabel": "unknown", "inUsd": null, "outUsd": null, "inRaw": "", "outRaw": ""},
  {"id": "gemini-robotics-er-2", "name": "Gemini Robotics ER 2 Preview", "kind": "robotics", "free": true, "freeLabel": "Free of charge", "inUsd": 1.0, "outUsd": 5.0, "inRaw": "$1.00 (text / image / video / audio) through December 31, 2026. | $2.00 (text / image / video / audio) starting January 1, 2027.", "outRaw": "$5.00 through December 31, 2026. | $10.00 starting January 1, 2027."},
  {"id": "gemini-robotics-er-2-streaming", "name": "Gemini Robotics ER 2 Streaming Preview", "kind": "robotics", "free": true, "freeLabel": "Free of charge", "inUsd": 1.0, "outUsd": 5.0, "inRaw": "$1.00 (text / image / video / audio) through December 31, 2026. | $2.00 (text / image / video / audio) starting January 1, 2027.", "outRaw": "$5.00 through December 31, 2026. | $10.00 starting January 1, 2027."}
];

const BY_ID = new Map<string, CatalogEntry>(CATALOG.map((m) => [m.id, m]));

/** Look up pricing for a live model id; tolerates the models/ prefix. */
export function catalogFor(id: string): CatalogEntry | null {
  return BY_ID.get(id.replace(/^models\//, "")) ?? null;
}

/** Free-tier verdict for a live model id. */
export function freeTierFor(id: string): boolean | null {
  return catalogFor(id)?.free ?? null;
}
