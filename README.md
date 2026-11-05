# CampusVoice AI

**Ask any college. Out loud.**
A voice agent that answers questions about **any college**, like fees, admissions, courses, hostel and placements, in **English, Hindi, Tamil, Telugu or Malayalam**, on a **website** or a **phone call**. It reads the college's official website live and shows its sources.

**Live app:** [campusvoiceai.vercel.app](https://campusvoiceai.vercel.app)

> © 2026 **P Om Shiva**, M.Tech CSE (2nd year), Pondicherry University. **All rights reserved.**
> This code is shared so it can be seen, not copied. Copying, reusing, deploying or submitting it as your own work without my written permission is not allowed. See [LICENSE](LICENSE).

---

## Why I built this

During admissions, college offices are flooded with calls. Phones ring unanswered, websites are confusing and mostly in English. A first-generation student, or a parent who speaks only Tamil, Hindi, Telugu or Malayalam, often can't get a simple answer: *"What's the fee? Is there a hostel? When's the last date?"*

Wrong or missing information costs real seats and real money. So I built a helpdesk that never sleeps, never gets tired of questions and speaks your language, for any college, on a website or a simple phone call.

**No student should miss an opportunity just because nobody picked up the phone.**

— **P Om Shiva**, M.Tech CSE (2nd year), Pondicherry University

## What it does

- **Talk, don't type:** tap the mic and ask in English, हिन्दी, தமிழ், తెలుగు or മലയാളം; the agent answers out loud in the same language and switches when you do.
- **Any college:** type any college name. The agent finds its official website and reads the pages that match your question.
- **Grounded answers with sources:** the agent answers only from what it read and shows the source pages, so you can check.
- **Phone line:** the same agent picks up real phone calls (Vapi), and can be tried in the browser too.
- **Never goes silent:** three voices in a row. If ElevenLabs can't start, the site uses the same agent on Vapi; if Vapi's credit is used up, it switches to a free voice (the browser's own listening, and the device voice or a free Gemini voice for speaking, which also covers the Indian languages). Typing always works too.
- **Accessible:** big touch targets, keyboard support, screen-reader labels, reduced-motion support and fonts for Devanagari, Tamil, Telugu and Malayalam.

## How it works

```
You speak (English / Hindi / Tamil / Telugu / Malayalam)
  ├─ Website ──► ElevenLabs Agent: speech-to-text → language model → text-to-speech
  │                 └─ tool: college_lookup (runs in the page so you see the search and sources)
  ├─ Backup  ──► the same Vapi assistant in the browser, then a free browser voice
  └─ Phone   ──► Vapi assistant (same prompt, same tool through a server webhook)
                    │
college_lookup ──► Vercel Function (api/_lib.js)
                    1. find the college on Wikipedia and its official website on Wikidata
                    2. read the official pages that match the question (admissions, fees, hostel, ...)
                    3. pick the most relevant passages and return them with their sources
                 ◄── the agent answers ONLY from these passages
```

- **Front end:** plain HTML, CSS and JavaScript. The voice "orb" is drawn live on a canvas and reacts to your voice and the agent's voice.
- **Back end:** small Vercel Functions: `api/ask.js` (research for the site, and the voice agent's lookup tool so both share one warmed-up copy of the college website), `api/tool.js` (the tool webhook), `api/speak.js` (free Gemini voice when a device has no voice for the language), `api/session.js` (short-lived signed link for each voice conversation) and `api/config.js`.
- **Security:** every API key stays on the server as a secret setting. The browser only gets a one-time signed link. Tool calls from the phone agent need a secret header, and every endpoint has a per-visitor rate limit.

## Tech stack

ElevenLabs Agents · Vapi · Wikipedia & Wikidata APIs · Google Gemini (text answers in backup mode) · Web Speech API · HTML · CSS · JavaScript · Node.js (Vercel Functions) · Git & GitHub · Vercel

## Author

**P Om Shiva**, M.Tech Computer Science & Engineering (2nd year), Pondicherry University
GitHub: [@omshiva24](https://github.com/omshiva24) · YouTube: [TechVibe24](https://youtube.com/@techvibe24)

CampusVoice AI is an independent student project. It isn't affiliated with any college it answers about. Always confirm important details on the college's official website.

## License

© 2026 P Om Shiva. All rights reserved. No permission is granted to copy, modify, deploy or reuse this project without the author's written permission. Third-party fonts (SIL OFL) and the ElevenLabs and Vapi browser SDKs keep their own licences. See [LICENSE](LICENSE).
