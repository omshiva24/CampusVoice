// CampusVoice AI — public settings for the website (no secrets here)
// © 2026 P Om Shiva. All rights reserved. See LICENSE.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=60");
  res.status(200).json({
    webVoice: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID && !process.env.ELEVENLABS_DISABLED),
    phoneNumber: process.env.VAPI_PHONE_NUMBER || null,
    vapiPublicKey: process.env.VAPI_PUBLIC_KEY || null,
    vapiAssistantId: process.env.VAPI_ASSISTANT_ID || null,
  });
}
