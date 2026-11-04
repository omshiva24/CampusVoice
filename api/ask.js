// CampusVoice AI — answer endpoint for the website (typed questions and backup voice mode)
// © 2026 P Om Shiva. All rights reserved. See LICENSE.
import { answerCollegeQuestion, researchCollege, notesFor, warmCollege, ipOf, limited, readJson } from "./_lib.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      brain: !!process.env.GEMINI_API_KEY,
      webVoice: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID),
      phone: !!process.env.VAPI_ASSISTANT_ID,
    });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const early = await readJson(req);
  if (early.mode === "warm") {
    if (limited(`warm:${ipOf(req)}`, 20, 10 * 60_000)) return res.status(200).json({ ok: false });
    return res.status(200).json(await warmCollege(early.college).catch(() => ({ ok: false })));
  }
  if (limited(`ask:${ipOf(req)}`, 30, 10 * 60_000)) {
    return res.status(429).json({ error: "You're asking very fast. Please wait a minute and try again." });
  }
  const body = early;
  try {
    if (body.mode === "notes") {
      // For the web voice agent: the research notes it answers from, plus sources to show on screen.
      const r = await researchCollege({ college: body.college, question: body.question });
      return res.status(200).json({ notes: notesFor(r), sources: r.sources, college: r.college, website: r.website, ms: r.ms });
    }
    const out = await answerCollegeQuestion({ college: body.college, question: body.question, lang: body.lang });
    return res.status(200).json(out);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Something went wrong." });
  }
}
