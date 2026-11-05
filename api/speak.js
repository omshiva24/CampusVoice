// CampusVoice AI — natural voice for the free backup mode (Gemini text-to-speech)
// © 2026 P Om Shiva. All rights reserved. See LICENSE.
//
// Used only when the visitor's device has no voice for the language (often Tamil on computers).
import { ipOf, limited, readJson, clean } from "./_lib.js";

const MODELS = (process.env.GEMINI_TTS_MODELS || "gemini-3.8-flash-lite-tts,gemini-3.8-flash-tts,gemini-2.5-flash-preview-tts")
  .split(",").map((m) => m.trim()).filter(Boolean);

function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: "Voice not available." });
  if (limited(`speak:${ipOf(req)}`, 25, 10 * 60_000)) return res.status(429).json({ error: "Too many requests." });
  const body = await readJson(req);
  const text = clean(body.text, 600);
  if (!text) return res.status(400).json({ error: "No text." });
  const lang = body.lang === "ta" ? "ta" : "en";
  // Send only the words to speak: a style instruction in front gets read out loud by some voices.
  const say = text;
  for (const model of MODELS) {
    try {
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: say }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } } }),
      }).finally(() => clearTimeout(timer));
      const d = await r.json().catch(() => ({}));
      const part = (d?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
      if (!r.ok || !part) { console.warn(`tts ${model} ${r.status} ${String(d?.error?.message || "no audio").slice(0, 100)}`); continue; }
      const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || "")?.[1] || 24000);
      const out = wav(Buffer.from(part.inlineData.data, "base64"), rate);
      res.setHeader("Content-Type", "audio/wav");
      return res.status(200).send(out);
    } catch (e) { console.warn(`tts ${model} ${e.message}`); }
  }
  return res.status(503).json({ error: "Voice is busy right now." });
}
