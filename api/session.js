// CampusVoice AI — starts a web voice session with the ElevenLabs agent
// © 2026 P Om Shiva. All rights reserved. See LICENSE.
//
// The ElevenLabs key stays on the server. The browser gets a short-lived signed link
// for one conversation. If voice minutes are not available, the site uses its free backup voice.
import { ipOf, limited } from "./_lib.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.ELEVENLABS_API_KEY, agent = process.env.ELEVENLABS_AGENT_ID;
  if (!key || !agent) return res.status(200).json({ mode: "backup", reason: "not_configured" });
  if (limited(`session:${ipOf(req)}`, 8, 60 * 60_000)) {
    return res.status(200).json({ mode: "backup", reason: "rate_limited" });
  }
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agent)}`, {
      headers: { "xi-api-key": key },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.signed_url) {
      console.error("signed url failed", r.status, JSON.stringify(data).slice(0, 300));
      return res.status(200).json({ mode: "backup", reason: "voice_unavailable" });
    }
    return res.status(200).json({ mode: "eleven", signedUrl: data.signed_url });
  } catch (e) {
    console.error("signed url error", e.message);
    return res.status(200).json({ mode: "backup", reason: "voice_unavailable" });
  }
}
