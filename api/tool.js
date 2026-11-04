// CampusVoice AI — tool webhook used by the voice agents
// © 2026 P Om Shiva. All rights reserved. See LICENSE.
//
// ElevenLabs (web voice agent) sends:  { college, question, language }
// Vapi (phone agent) sends:            { message: { type: "tool-calls", toolCallList: [...] } }
// Both get a short spoken answer found live on the web, with source names.
import { researchCollege, notesFor, readJson } from "./_lib.js";

function authorised(req) {
  const secret = process.env.TOOL_SECRET;
  if (!secret) return false;
  return req.headers["x-tool-secret"] === secret || req.headers["x-vapi-secret"] === secret;
}

async function lookup(args) {
  const a = typeof args === "string" ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args || {});
  try {
    const r = await researchCollege({ college: a.college || a.college_name, question: a.question });
    return { ok: true, text: notesFor(r), r };
  } catch (e) {
    return { ok: false, text: e.message || "I couldn't find that right now." };
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!authorised(req)) return res.status(401).json({ error: "Not allowed." });
  const body = await readJson(req);

  // Vapi phone agent
  const msg = body?.message;
  if (msg && (msg.type === "tool-calls" || msg.toolCallList || msg.toolWithToolCallList)) {
    const calls = msg.toolCallList || (msg.toolWithToolCallList || []).map((t) => t.toolCall) || [];
    const results = await Promise.all(calls.map(async (c) => {
      const out = await lookup(c.function?.arguments ?? c.arguments);
      return { toolCallId: c.id, result: out.text };
    }));
    return res.status(200).json({ results });
  }

  // ElevenLabs web agent (webhook mode)
  const out = await lookup(body);
  return res.status(200).json({ notes: out.text, sources: out.ok ? out.r.sources.map((s) => s.title).join(", ") : "" });
}
