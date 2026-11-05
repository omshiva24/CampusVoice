// CampusVoice AI — one-time setup and checks for the voice agents (owner only)
// © 2026 P Om Shiva. All rights reserved. See LICENSE.
//
// Protected by ADMIN_TOKEN. Creates/updates the ElevenLabs web agent and the Vapi phone agent
// so both use the same "college_lookup" tool (api/tool.js).
import { answerCollegeQuestion, researchCollege, notesFor } from "./_lib.js";

const EL = "https://api.elevenlabs.io";
const VAPI = "https://api.vapi.ai";

export const AGENT_PROMPT = `You are CampusVoice, a warm, upbeat voice helpdesk for students and parents. You can answer questions about ANY college or university.

The college the user picked on the website is: {{college_name}}. If the user asks about a different college, use that one instead.

Language: you speak English, Hindi, Tamil, Telugu and Malayalam. Always reply in the language the user is speaking, in simple, natural spoken words, written in that language's own script (Devanagari for Hindi, Tamil script for Tamil, Telugu script for Telugu, Malayalam script for Malayalam). Words like B.Tech, hostel, fees or NIRF can stay in English. If their words arrive in English letters but are really an Indian language (like "fees kitni hai" or "viduthi kattanam evvalavu"), reply in that language, in its own script. If they switch language, switch with them. {{ web_hint | default: "" }}

How you answer:
1. For ANY fact about a college (fees, admission dates, eligibility, courses, cut-offs, hostel, placements, ranking, contact details, location, scholarships), ALWAYS call the college_lookup tool first. Never answer facts from memory.
2. Speak only the part of the tool's notes that answers the question: at most two short sentences (under 30 words in English; in other languages, two short sentences at most), then name the source briefly, like "according to their official website". Never read out all the notes, and never read the SOURCES_FOR_SCREEN part.
3. The tool result starts with the reply language when it isn't English: always answer in that language and script, even though the notes are in English. Never say "notes" or "the information provided"; say "their website".
4. If the tool couldn't find it, say so honestly and suggest the official website or the admission office.
5. This is a voice conversation: keep every reply short. No lists, no links, no web addresses, no markdown.
6. End with a very short question like "Anything else?"
Be polite and encouraging. If asked about things unrelated to colleges or studies, gently bring the talk back to colleges.`;

const PHONE_PROMPT = AGENT_PROMPT
  .replace("The college the user picked on the website is: {{college_name}}. If the user asks about a different college, use that one instead.",
    "At the start, find out which college the caller wants to know about. Remember it for the rest of the call.");

// What the agent says while the lookup runs, in the caller's language.
const WAIT = {
  en: ["One moment, let me check that for you.", "Still checking, almost there."],
  hi: ["एक पल, मैं देखकर बताती हूँ।", "बस थोड़ा और, अभी देख रही हूँ।"],
  ta: ["ஒரு நிமிடம், பார்த்துச் சொல்கிறேன்.", "இன்னும் கொஞ்சம் நேரம், பார்த்துக்கொண்டிருக்கிறேன்."],
  te: ["ఒక్క క్షణం, చూసి చెబుతాను.", "ఇంకా చూస్తున్నాను, ఇంకొంచెం సేపు."],
  ml: ["ഒരു നിമിഷം, നോക്കി പറയാം.", "ഇനിയും നോക്കുന്നു, കുറച്ചു കൂടി."],
};
const waitMessages = () => Object.entries(WAIT).flatMap(([lang, [start, still]]) => [
  { type: "request-start", content: start, conditions: [{ param: "language", operator: "eq", value: lang }] },
  { type: "request-response-delayed", content: still, timingMilliseconds: 11000, conditions: [{ param: "language", operator: "eq", value: lang }] },
]);
// Voice model for the agents: Flash v2.5 is fastest but has no Telugu or Malayalam; Eleven v3-family models speak all five.
const VAPI_VOICE_MODEL = "eleven_v4_turbo";

const TOOL_DESCRIPTION = "Looks up live, up-to-date information about any college or university on the web (official websites first) and returns a short answer with source names. Use it for every factual question about a college.";
const TOOL_PARAMS = {
  type: "object",
  properties: {
    college: { type: "string", description: "Full name of the college or university, e.g. 'Pondicherry University' or 'IIT Madras'." },
    question: { type: "string", description: "The user's question, rewritten in English, short and specific." },
    language: { type: "string", enum: ["en", "hi", "ta", "te", "ml"], description: "The language the user is speaking, to answer in: 'en' English, 'hi' Hindi, 'ta' Tamil, 'te' Telugu, 'ml' Malayalam." },
  },
  required: ["college", "question", "language"],
};

async function call(base, path, { method = "GET", body, headers = {} } = {}) {
  const r = await fetch(base + path, {
    method, headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, ok: r.ok, data };
}
const el = (path, opt = {}) => call(EL, path, { ...opt, headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY } });
const vapi = (path, opt = {}) => call(VAPI, path, { ...opt, headers: { Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}` } });
const short = (x, n = 1500) => (typeof x === "string" ? x : JSON.stringify(x)).slice(0, n);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const q = req.query || {};
  if (!process.env.ADMIN_TOKEN || q.token !== process.env.ADMIN_TOKEN) return res.status(404).json({ error: "Not found" });
  const base = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const toolUrl = `${base}/api/tool`;
  const out = {};
  try {
    switch (q.action) {
      case "status": {
        out.env = Object.fromEntries(["GEMINI_API_KEY", "ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID", "ELEVENLABS_VOICE_ID", "VAPI_PRIVATE_KEY", "VAPI_PUBLIC_KEY", "VAPI_ASSISTANT_ID", "VAPI_PHONE_NUMBER", "TOOL_SECRET"].map((k) => [k, !!process.env[k]]));
        if (process.env.GEMINI_API_KEY) {
          const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY } });
          const d = await r.json().catch(() => ({}));
          out.geminiModels = (d.models || []).map((m) => m.name.replace("models/", "")).filter((n) => /flash|tts|live|audio/.test(n));
        }
        if (process.env.ELEVENLABS_API_KEY) {
          const s = await el("/v1/user/subscription"); out.elSubscription = s.ok ? { tier: s.data.tier, chars: `${s.data.character_count}/${s.data.character_limit}`, status: s.data.status } : short(s.data, 400);
        }
        if (process.env.VAPI_PRIVATE_KEY) {
          const a = await vapi("/assistant?limit=10"); out.vapiAssistants = a.ok ? a.data.map((x) => ({ id: x.id, name: x.name })) : short(a.data, 400);
          const p = await vapi("/phone-number?limit=10"); out.vapiNumbers = p.ok ? p.data.map((x) => ({ id: x.id, number: x.number, status: x.status, assistantId: x.assistantId })) : short(p.data, 400);
        }
        break;
      }
      case "voices": {
        const r = await el(`/v2/voices?page_size=60${q.search ? `&search=${encodeURIComponent(q.search)}` : ""}`);
        out.voices = r.ok ? r.data.voices.map((v) => ({ id: v.voice_id, name: v.name, labels: v.labels, category: v.category })) : short(r.data);
        if (q.library) {
          const s = await el(`/v1/shared-voices?page_size=20&language=${encodeURIComponent(q.library)}${q.search ? `&search=${encodeURIComponent(q.search)}` : ""}`);
          out.library = s.ok ? s.data.voices.map((v) => ({ id: v.voice_id, owner: v.public_owner_id, name: v.name, accent: v.accent, gender: v.gender, lang: v.language, use: v.use_case, desc: String(v.description || "").slice(0, 80) })) : short(s.data);
        }
        break;
      }
      case "models": {
        const r = await el("/v1/models");
        out.models = r.ok ? r.data.map((m) => ({ id: m.model_id, tts: m.can_do_text_to_speech, langs: (m.languages || []).map((l) => l.language_id).filter((l) => ["en", "hi", "ta", "te", "ml"].includes(l)) })) : short(r.data);
        break;
      }
      case "addvoice": {
        const r = await el(`/v1/voices/add/${encodeURIComponent(q.owner)}/${encodeURIComponent(q.voice)}`, { method: "POST", body: { new_name: q.name || "CampusVoice" } });
        out.add = { status: r.status, data: short(r.data, 600) };
        break;
      }
      case "eleven": {
        const voice = q.voice || process.env.ELEVENLABS_VOICE_ID;
        if (!voice) { out.error = "pass &voice=<voice_id>"; break; }
        // Web agent: a client tool that the website runs (so visitors see the live search and sources).
        // &tooltype=webhook makes ElevenLabs call api/tool.js on the server instead.
        const toolConfig = q.tooltype === "webhook"
          ? { type: "webhook", name: "college_lookup", description: TOOL_DESCRIPTION, response_timeout_secs: 25,
              api_schema: { url: toolUrl, method: "POST", request_headers: { "x-tool-secret": process.env.TOOL_SECRET }, request_body_schema: { ...TOOL_PARAMS, description: "The college and the question" } } }
          : { type: "client", name: "college_lookup", description: TOOL_DESCRIPTION, expects_response: true, response_timeout_secs: 25, parameters: TOOL_PARAMS };
        const tool = q.toolid ? { ok: true, status: 200, data: { id: q.toolid } } : await el("/v1/convai/tools", { method: "POST", body: { tool_config: toolConfig } });
        out.tool = { status: tool.status, data: short(tool.data, 300) };
        if (!tool.ok) break;
        const agent = {
          name: "CampusVoice AI",
          conversation_config: {
            agent: {
              first_message: "Hi! I'm CampusVoice. Ask me anything about {{college_name}}: fees, admissions, courses or hostel, in your language.",
              language: "en",
              dynamic_variables: { dynamic_variable_placeholders: { college_name: "Pondicherry University" } },
              prompt: {
                prompt: AGENT_PROMPT, llm: q.llm || "gemini-3.5-flash", temperature: 0.3, tool_ids: [tool.data.tool_id || tool.data.id],
                built_in_tools: {
                  language_detection: { type: "system", name: "language_detection", description: "", params: { system_tool_type: "language_detection" } },
                  end_call: { type: "system", name: "end_call", description: "", params: { system_tool_type: "end_call" } },
                },
              },
            },
            tts: { model_id: q.tts || "eleven_flash_v2", voice_id: voice },
            conversation: { max_duration_seconds: 150 },
            language_presets: {
              hi: { overrides: { tts: { model_id: q.indicmodel || "eleven_flash_v2_5" }, agent: { first_message: "नमस्ते! मैं CampusVoice हूँ। {{college_name}} की फीस, एडमिशन, कोर्स या हॉस्टल, कुछ भी पूछिए।", language: "hi" } } },
              ta: { overrides: { ...(q.tamodel ? { tts: { model_id: q.tamodel } } : {}), agent: { first_message: "வணக்கம்! நான் CampusVoice. {{college_name}} பற்றி கட்டணம், சேர்க்கை, படிப்புகள், விடுதி என எதை வேண்டுமானாலும் கேளுங்கள்.", language: "ta" } } },
              ...(q.indicmodel ? {
                te: { overrides: { tts: { model_id: q.indicmodel }, agent: { first_message: "నమస్కారం! నేను CampusVoice. {{college_name}} ఫీజు, అడ్మిషన్, కోర్సులు, హాస్టల్, ఏదైనా అడగండి.", language: "te" } } },
                ml: { overrides: { tts: { model_id: q.indicmodel }, agent: { first_message: "നമസ്കാരം! ഞാൻ CampusVoice ആണ്. {{college_name}} ഫീസ്, അഡ്മിഷൻ, കോഴ്സുകൾ, ഹോസ്റ്റൽ, എന്തും ചോദിക്കൂ.", language: "ml" } } },
              } : {}),
            },
          },
          platform_settings: {
            auth: { enable_auth: true },
            overrides: { conversation_config_override: { agent: { first_message: true, language: true }, tts: { voice_id: false } } },
          },
        };
        const r = process.env.ELEVENLABS_AGENT_ID && !q.fresh
          ? await el(`/v1/convai/agents/${process.env.ELEVENLABS_AGENT_ID}`, { method: "PATCH", body: agent })
          : await el("/v1/convai/agents/create", { method: "POST", body: agent });
        out.agent = { status: r.status, data: short(r.data, 1200) };
        break;
      }
      case "vapi": {
        const assistant = {
          name: "CampusVoice Phone",
          firstMessage: "Hi! This is CampusVoice, your college helpdesk. Which college would you like to know about? You can speak English, Hindi, Tamil, Telugu or Malayalam.",
          model: {
            provider: q.provider || "openai", model: q.model || "gpt-4.1-mini", temperature: 0.3, maxTokens: 260,
            messages: [{ role: "system", content: PHONE_PROMPT }],
            tools: [{
              type: "function", async: false,
              function: { name: "college_lookup", description: TOOL_DESCRIPTION, parameters: TOOL_PARAMS },
              server: { url: `${base}/api/ask`, timeoutSeconds: 25, headers: { "x-tool-secret": process.env.TOOL_SECRET } },
              messages: [
                ...waitMessages(),
                { type: "request-failed", content: "Sorry, I couldn't reach the college website just now. Please check their official website or ask me something else." },
              ],
            }],
          },
          voice: q.vvoice ? { provider: "11labs", voiceId: q.vvoice, model: q.vmodel || VAPI_VOICE_MODEL } : { provider: "vapi", voiceId: q.vapivoice || "Elliot" },
          // ElevenLabs Scribe understands all five languages (and mixing them with English); Google is the backup listener.
          transcriber: q.stt === "google" ? { provider: "google", model: q.sttmodel || "gemini-2.5-flash", language: "Multilingual" }
            : { provider: "11labs", model: q.sttmodel || "scribe_v2_realtime", ...(q.sttlang ? { language: q.sttlang } : {}),
                fallbackPlan: { transcribers: [{ provider: "google", model: "gemini-2.5-flash", language: "Multilingual" }] } },
          clientMessages: ["conversation-update", "transcript", "tool-calls", "model-output", "speech-update", "status-update", "hang", "user-interrupted"],
          // Long answers count as "silence" for Vapi until they finish, so give the agent time to speak.
          silenceTimeoutSeconds: 60,
          maxDurationSeconds: 240,
          endCallPhrases: ["goodbye", "bye bye"],
        };
        const r = process.env.VAPI_ASSISTANT_ID && !q.fresh
          ? await vapi(`/assistant/${process.env.VAPI_ASSISTANT_ID}`, { method: "PATCH", body: assistant })
          : await vapi("/assistant", { method: "POST", body: assistant });
        out.assistant = { status: r.status, data: short(r.data, 1200) };
        break;
      }
      case "phone": {
        const r = await vapi("/phone-number", { method: "POST", body: { provider: "vapi", name: "CampusVoice line", assistantId: q.assistant || process.env.VAPI_ASSISTANT_ID, numberDesiredAreaCode: q.area || "415" } });
        out.phone = { status: r.status, data: short(r.data, 800) };
        break;
      }
      case "ask": {
        out.result = await answerCollegeQuestion({ college: q.college || "Pondicherry University", question: q.question || "What is the fee for M.Tech CSE?", lang: q.lang || "en" });
        break;
      }
      case "research": {
        const r = await researchCollege({ college: q.college || "Pondicherry University", question: q.question || "What is the fee for M.Tech CSE?" });
        out.ms = r.ms; out.website = r.website; out.sources = r.sources; out.debug = r.debug; out.notes = notesFor(r);
        break;
      }
      case "tooltest": {
        // Simulates a Vapi phone tool call against our own webhook.
        const r = await fetch(toolUrl, { method: "POST", headers: { "Content-Type": "application/json", "x-tool-secret": process.env.TOOL_SECRET },
          body: JSON.stringify({ message: { type: "tool-calls", toolCallList: [{ id: "test1", type: "function", function: { name: "college_lookup", arguments: { college: q.college || "IIT Madras", question: q.question || "Is there a hostel?", language: "en" } } }] } }) });
        out.status = r.status; out.body = short(await r.text(), 1800);
        break;
      }
      case "agent": {
        const r = await el(`/v1/convai/agents/${process.env.ELEVENLABS_AGENT_ID}`);
        const c = r.data?.conversation_config || {};
        out.agent = r.ok ? { tts: c.tts, asr: c.asr, language: c.agent?.language, presets: c.language_presets, tools: c.agent?.prompt?.tool_ids, builtIn: Object.keys(c.agent?.prompt?.built_in_tools || {}).filter((k) => c.agent.prompt.built_in_tools[k]), llm: c.agent?.prompt?.llm, overrides: r.data?.platform_settings?.overrides, auth: r.data?.platform_settings?.auth } : short(r.data);
        break;
      }
      case "conversations": {
        const r = await el(`/v1/convai/conversations?page_size=10${process.env.ELEVENLABS_AGENT_ID ? `&agent_id=${process.env.ELEVENLABS_AGENT_ID}` : ""}`);
        out.list = r.ok ? r.data.conversations.map((c) => ({ id: c.conversation_id, start: c.start_time_unix_secs, secs: c.call_duration_secs, status: c.status, msgs: c.message_count })) : short(r.data);
        break;
      }
      case "conversation": {
        const r = await el(`/v1/convai/conversations/${encodeURIComponent(q.id)}`);
        out.conversation = r.ok ? { secs: r.data.metadata?.call_duration_secs, lang: r.data.metadata?.main_language, transcript: (r.data.transcript || []).map((t) => ({ role: t.role, t: t.time_in_call_secs, msg: t.message, tools: (t.tool_calls || []).map((c) => c.params_as_json || c.tool_name) })) } : short(r.data);
        break;
      }
      default: out.error = "unknown action";
    }
  } catch (e) {
    out.error = e.message;
  }
  return res.status(200).json(out);
}
