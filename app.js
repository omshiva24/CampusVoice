// CampusVoice AI — website logic
// © 2026 P Om Shiva, M.Tech CSE (2nd year), Pondicherry University. All rights reserved. See LICENSE.
//
// Premium voice: ElevenLabs Agents (speech-to-text, the agent's brain and natural speech) with a
// "college_lookup" tool that this page runs. Backup voice (free, no minutes): the browser's own
// speech recognition and speech synthesis. Phone: a Vapi voice agent that uses the same lookup.
// Languages: English, Hindi, Tamil, Telugu and Malayalam.

const EL_SDK = "https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.32.1/+esm";
const VAPI_SDK = "https://cdn.jsdelivr.net/npm/@vapi-ai/web@3.0.1/+esm";

const COLLEGES = [
  "Pondicherry University", "IIT Madras", "Anna University", "NIT Trichy", "VIT Vellore", "PSG College of Technology",
  "IISc Bangalore", "University of Delhi", "SRM Institute of Science and Technology", "Amrita Vishwa Vidyapeetham",
  "Madras Christian College", "Loyola College, Chennai", "BITS Pilani", "IIT Bombay", "Jawaharlal Nehru University",
  "Christ University, Bangalore", "Manipal Institute of Technology", "Stanford University", "University of Oxford", "University of Tokyo",
];
// The five languages. "re" finds the language from the letters someone typed or said.
const LANGS = {
  en: { bcp: "en-IN", voices: ["en-IN", "en-GB", "en-US", "en"] },
  hi: { bcp: "hi-IN", voices: ["hi-IN", "hi"], re: /[\u0900-\u097F]/ },
  ta: { bcp: "ta-IN", voices: ["ta-IN", "ta"], re: /[\u0B80-\u0BFF]/ },
  te: { bcp: "te-IN", voices: ["te-IN", "te"], re: /[\u0C00-\u0C7F]/ },
  ml: { bcp: "ml-IN", voices: ["ml-IN", "ml"], re: /[\u0D00-\u0D7F]/ },
};
const scriptLang = (t) => Object.keys(LANGS).find((k) => LANGS[k].re?.test(t || "")) || null;
const QUESTIONS = {
  en: ["What is the fee for B.Tech CSE?", "When do admissions open?", "Is there a hostel? What's the fee?", "What is the NIRF rank?", "How are the placements?", "How do I contact the admission office?"],
  hi: ["B.Tech CSE की फीस कितनी है?", "एडमिशन कब शुरू होंगे?", "क्या हॉस्टल है? फीस कितनी है?", "NIRF रैंक क्या है?", "प्लेसमेंट कैसे हैं?", "एडमिशन ऑफिस से कैसे संपर्क करें?"],
  ta: ["B.Tech CSE கட்டணம் எவ்வளவு?", "சேர்க்கை எப்போது தொடங்கும்?", "விடுதி வசதி உள்ளதா? கட்டணம் என்ன?", "NIRF தரவரிசை என்ன?", "வேலைவாய்ப்பு (placement) எப்படி?", "சேர்க்கை அலுவலகத்தை எப்படி தொடர்பு கொள்வது?"],
  te: ["B.Tech CSE ఫీజు ఎంత?", "అడ్మిషన్లు ఎప్పుడు మొదలవుతాయి?", "హాస్టల్ ఉందా? ఫీజు ఎంత?", "NIRF ర్యాంక్ ఎంత?", "ప్లేస్‌మెంట్స్ ఎలా ఉన్నాయి?", "అడ్మిషన్ ఆఫీస్‌ను ఎలా సంప్రదించాలి?"],
  ml: ["B.Tech CSE ഫീസ് എത്രയാണ്?", "അഡ്മിഷൻ എപ്പോൾ തുടങ്ങും?", "ഹോസ്റ്റൽ ഉണ്ടോ? ഫീസ് എത്ര?", "NIRF റാങ്ക് എത്രയാണ്?", "പ്ലേസ്‌മെന്റ് എങ്ങനെയാണ്?", "അഡ്മിഷൻ ഓഫീസുമായി എങ്ങനെ ബന്ധപ്പെടാം?"],
};
const TEXT = {
  idle: { en: "Tap the mic and ask", hi: "माइक दबाएँ और पूछें", ta: "மைக்கைத் தட்டி கேளுங்கள்", te: "మైక్ నొక్కి అడగండి", ml: "മൈക്ക് അമർത്തി ചോദിക്കൂ" },
  connecting: { en: "Connecting…", hi: "जुड़ रहा है…", ta: "இணைக்கிறது…", te: "కనెక్ట్ అవుతోంది…", ml: "കണക്റ്റ് ചെയ്യുന്നു…" },
  listening: { en: "Listening…", hi: "सुन रही हूँ…", ta: "கேட்கிறேன்…", te: "వింటున్నాను…", ml: "കേൾക്കുന്നു…" },
  thinking: { en: "Reading official sources…", hi: "आधिकारिक जानकारी पढ़ रही हूँ…", ta: "அதிகாரப்பூர்வ தகவல்களைப் படிக்கிறேன்…", te: "అధికారిక సమాచారం చదువుతున్నాను…", ml: "ഔദ്യോഗിക വിവരങ്ങൾ വായിക്കുന്നു…" },
  speaking: { en: "Speaking…", hi: "बोल रही हूँ…", ta: "பேசுகிறேன்…", te: "మాట్లాడుతున్నాను…", ml: "സംസാരിക്കുന്നു…" },
  switch: { en: "Language will switch on the next conversation. You can just start speaking it now.", hi: "भाषा अगली बातचीत में बदलेगी। आप अभी भी हिंदी में बोल सकते हैं।", ta: "மொழி அடுத்த உரையாடலில் மாறும். இப்போதும் தமிழில் பேசலாம்.", te: "భాష తదుపరి సంభాషణలో మారుతుంది. ఇప్పుడే తెలుగులో మాట్లాడవచ్చు.", ml: "ഭാഷ അടുത്ത സംഭാഷണത്തിൽ മാറും. ഇപ്പോൾ തന്നെ മലയാളത്തിൽ സംസാരിക്കാം." },
  novoice: { en: "Voice playback isn't available here, so the answer is shown as text.", hi: "इस डिवाइस पर आवाज़ उपलब्ध नहीं है, इसलिए जवाब लिखकर दिखाया गया है।", ta: "இந்த சாதனத்தில் தமிழ் குரல் இல்லை, அதனால் பதில் எழுத்தாகக் காட்டப்படுகிறது.", te: "ఈ పరికరంలో వాయిస్ అందుబాటులో లేదు, అందుకే సమాధానం రాతగా చూపిస్తున్నాము.", ml: "ഈ ഉപകരണത്തിൽ ശബ്ദം ലഭ്യമല്ല, അതിനാൽ മറുപടി എഴുത്തായി കാണിക്കുന്നു." },
  // the agent's "please wait" lines, as it speaks them in each language
  wait: { en: "One moment, let me check that for you.", hi: "एक पल, मैं देखकर बताती हूँ।", ta: "ஒரு நிமிடம், பார்த்துச் சொல்கிறேன்.", te: "ఒక్క క్షణం, చూసి చెబుతాను.", ml: "ഒരു നിമിഷം, നോക്കി പറയാം." },
  still: { en: "Still checking, almost there.", hi: "बस थोड़ा और, अभी देख रही हूँ।", ta: "இன்னும் கொஞ்சம் நேரம், பார்த்துக்கொண்டிருக்கிறேன்.", te: "ఇంకా చూస్తున్నాను, ఇంకొంచెం సేపు.", ml: "ഇനിയും നോക്കുന്നു, കുറച്ചു കൂടി." },
};
const t = (key, lang = state.lang) => TEXT[key]?.[lang] || TEXT[key]?.en || "";
// first words of the voice agent / free voice, in the chosen language
const hello = (c, lang = state.lang) => ({
  en: `Hi! I'm CampusVoice. Ask me anything about ${c}, in your language.`,
  hi: `नमस्ते! मैं CampusVoice हूँ। ${c} के बारे में कुछ भी पूछिए।`,
  ta: `வணக்கம்! நான் CampusVoice. ${c} பற்றி எதையும் கேளுங்கள்.`,
  te: `నమస్కారం! నేను CampusVoice. ${c} గురించి ఏదైనా అడగండి.`,
  ml: `നമസ്കാരം! ഞാൻ CampusVoice ആണ്. ${c} നെക്കുറിച്ച് എന്തും ചോദിക്കൂ.`,
}[lang] || `Hi! I'm CampusVoice. Ask me anything about ${c}.`);

const $ = (s) => document.querySelector(s);
const state = { lang: "en", mode: "idle", engine: null, conv: null, rec: null, active: false, t0: 0, level: 0, analyser: null, stream: null, cfg: {}, speakPulse: 0 };

// ---------- setup ----------
const collegeInput = $("#college");
$("#college-list").innerHTML = COLLEGES.map((c) => `<option value="${c}">`).join("");
const chipBox = $("#college-chips");
COLLEGES.slice(0, 7).forEach((c) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip"; b.textContent = c;
  b.addEventListener("click", () => { collegeInput.value = c; syncChips(); });
  chipBox.appendChild(b);
});
function syncChips() { chipBox.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === collegeInput.value.trim()))); }
collegeInput.addEventListener("input", syncChips); syncChips();
// Start reading the chosen college's website in the background, so the first answer comes faster.
let warmTimer = 0, warmed = "";
function warm() {
  clearTimeout(warmTimer);
  warmTimer = setTimeout(() => {
    const c = collegeInput.value.trim();
    if (c.length < 3 || c === warmed) return;
    warmed = c;
    fetch("api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "warm", college: c }) }).catch(() => {});
  }, 900);
}
collegeInput.addEventListener("input", warm);
chipBox.addEventListener("click", warm);
warm();
const college = () => collegeInput.value.trim() || "Pondicherry University";

document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
  state.lang = b.dataset.lang;
  document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  renderQuick();
  if (state.mode === "idle") setMode("idle");
  if (state.active) addSys(t("switch"));
}));

function renderQuick() {
  const box = $("#quick"); box.innerHTML = "";
  QUESTIONS[state.lang].forEach((q) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = q;
    if (state.lang !== "en") b.lang = state.lang;
    b.addEventListener("click", () => askTyped(q));
    box.appendChild(b);
  });
}
renderQuick();

fetch("api/config").then((r) => r.json()).then((cfg) => {
  state.cfg = cfg;
  const vapiWeb = !!(cfg.vapiPublicKey && cfg.vapiAssistantId);
  $("#mode-badge").textContent = cfg.webVoice ? "Premium voice · ElevenLabs" : vapiWeb ? "Premium voice · Vapi" : "Free voice";
  $("#mode-badge").className = "mode " + (cfg.webVoice || vapiWeb ? "premium" : "backup");
  if (cfg.phoneNumber) {
    const n = $("#phone-number"); n.hidden = false;
    n.innerHTML = `<a href="tel:${cfg.phoneNumber.replace(/[^+\d]/g, "")}">${cfg.phoneNumber}</a>`;
    $("#phone-note").textContent = "This is a US number (free Vapi line). From India it's an international call, so try it in your browser below for free.";
  }
  if (!cfg.vapiPublicKey || !cfg.vapiAssistantId) {
    $("#call-btn").disabled = true; $("#call-state").textContent = "Phone agent is being set up";
  }
}).catch(() => {});

// ---------- conversation UI ----------
const convo = $("#convo");
function bubble(kind, text, who) {
  const el = $("#t-bubble").content.firstElementChild.cloneNode(true);
  el.classList.add(kind);
  el.querySelector(".who").textContent = who || (kind === "user" ? "You" : kind === "ai" ? "CampusVoice" : "");
  el.querySelector(".msg").textContent = text;
  const sl = scriptLang(text); if (sl) el.lang = sl;
  convo.appendChild(el);
  convo.scrollTop = convo.scrollHeight;
  return el;
}
const addSys = (t) => bubble("sys", t);
function searching(collegeName) {
  const el = bubble("ai", "", "Agent tool · college_lookup");
  el.classList.add("search"); el._at = Date.now();
  el.querySelector(".msg").innerHTML = `<span class="spin"></span><span></span>`;
  el.querySelector(".msg span:last-child").textContent = `Finding ${collegeName}'s official website and reading it…`;
  return el;
}
function showSources(el, r) {
  el.classList.remove("search");
  const msg = el.querySelector(".msg");
  msg.textContent = r.sources?.length ? `Read ${r.sources.length} source${r.sources.length > 1 ? "s" : ""} in ${((r.ms || 0) / 1000).toFixed(1)} s` : "No matching info found online";
  if (r.sources?.length) {
    const box = document.createElement("div"); box.className = "sources";
    r.sources.forEach((s) => { const a = document.createElement("a"); a.href = s.url; a.target = "_blank"; a.rel = "noopener nofollow"; a.textContent = s.title; box.appendChild(a); });
    el.appendChild(box);
  }
  convo.scrollTop = convo.scrollHeight;
}

async function ask(question, collegeName, lang, mode) {
  const r = await fetch("api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ college: collegeName, question, lang, mode }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

// The tool the voice agent calls. It runs here so you can see the search and the sources live.
async function collegeLookup(params = {}) {
  const c = params.college || college();
  const lang = LANGS[params.language] ? params.language : state.lang;
  setMode("thinking");
  const el = searching(c);
  try {
    const r = await ask(params.question || "", c, lang, "notes");
    showSources(el, r);
    return r.notes;
  } catch (e) {
    el.classList.remove("search"); el.querySelector(".msg").textContent = e.message;
    return "I couldn't find that right now. Please suggest checking the official website.";
  }
}

// ---------- modes, timer, orb ----------
function setMode(m) {
  state.mode = m;
  $("#state").textContent = t(m);
  $("#state").lang = state.lang;
}
let timerId = 0;
function startTimer() {
  state.t0 = Date.now(); $("#timer").classList.add("on");
  clearInterval(timerId);
  timerId = setInterval(() => { const s = Math.floor((Date.now() - state.t0) / 1000); $("#timer").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }, 250);
}
function stopTimer() { clearInterval(timerId); $("#timer").classList.remove("on"); }

const canvas = $("#orb"), ctx = canvas.getContext("2d");
const PALETTE = {
  idle: ["#C7D2FE", "#818CF8", "#312E81"], connecting: ["#C7D2FE", "#818CF8", "#312E81"],
  listening: ["#CCFBF1", "#5EEAD4", "#0F766E"], thinking: ["#E0E7FF", "#818CF8", "#4C1D95"], speaking: ["#FCE7F3", "#F472B6", "#9D174D"],
};
let hue = PALETTE.idle.map(hex);
function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
function measure() {
  let target = 0;
  try {
    if (state.engine === "vapi") {
      target = Math.min(1, (state.vapiLevel || 0) * 1.6);
    } else if (state.engine === "eleven" && state.conv) {
      target = state.mode === "speaking" ? state.conv.getOutputVolume() : state.mode === "listening" ? state.conv.getInputVolume() : 0;
    } else if (state.analyser && state.mode === "listening") {
      const d = new Uint8Array(state.analyser.fftSize); state.analyser.getByteTimeDomainData(d);
      let s = 0; for (const v of d) s += ((v - 128) / 128) ** 2; target = Math.min(1, Math.sqrt(s / d.length) * 4);
    } else if (state.outAnalyser && state.mode === "speaking") {
      const d = new Uint8Array(state.outAnalyser.fftSize); state.outAnalyser.getByteTimeDomainData(d);
      let s = 0; for (const v of d) s += ((v - 128) / 128) ** 2; target = Math.min(1, Math.sqrt(s / d.length) * 4);
    } else if (state.mode === "speaking") {
      state.speakPulse *= 0.92; target = 0.25 + state.speakPulse + 0.15 * Math.abs(Math.sin(performance.now() / 140));
    }
  } catch { target = 0; }
  state.level += ((Number(target) || 0) - state.level) * 0.25;
}
function draw(now) {
  requestAnimationFrame(draw);
  measure();
  const t = now / 1000, W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2 - 10;
  const goal = (PALETTE[state.mode] || PALETTE.idle).map(hex);
  hue = hue.map((c, i) => c.map((v, j) => v + (goal[i][j] - v) * 0.06));
  ctx.clearRect(0, 0, W, H);
  const lvl = Math.min(1, state.level), R = W * 0.25 * (1 + 0.04 * Math.sin(t * 1.6) + lvl * 0.16);
  // glow
  const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2);
  g.addColorStop(0, rgb(hue[1], 0.45)); g.addColorStop(1, rgb(hue[1], 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // rings
  for (let k = 0; k < 3; k++) {
    const ph = (t * 0.6 + k / 3) % 1;
    ctx.beginPath(); ctx.arc(cx, cy, R * (1.08 + ph * (0.55 + lvl * 0.5)), 0, Math.PI * 2);
    ctx.strokeStyle = rgb(hue[1], (1 - ph) * (0.25 + lvl * 0.5)); ctx.lineWidth = 3; ctx.stroke();
  }
  // blob
  const amp = 0.05 + lvl * 0.22 + (state.mode === "thinking" ? 0.06 : 0);
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const r = R * (1 + amp * (0.5 * Math.sin(3 * a + t * 2.1) + 0.32 * Math.sin(5 * a - t * 1.7) + 0.2 * Math.sin(8 * a + t * 3.3)));
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  const fill = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.25);
  fill.addColorStop(0, rgb(hue[0])); fill.addColorStop(0.45, rgb(hue[1])); fill.addColorStop(1, rgb(hue[2]));
  ctx.fillStyle = fill; ctx.shadowColor = rgb(hue[1], 0.9); ctx.shadowBlur = 40 + lvl * 60; ctx.fill(); ctx.shadowBlur = 0;
  // gloss
  const gl = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.45, 0, cx - R * 0.3, cy - R * 0.45, R * 0.7);
  gl.addColorStop(0, "rgba(255,255,255,.55)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gl; ctx.fill();
  // thinking: orbiting dots
  if (state.mode === "thinking" || state.mode === "connecting") {
    for (let k = 0; k < 6; k++) {
      const a = t * 2.4 + (k * Math.PI) / 3;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 1.35, cy + Math.sin(a) * R * 1.35, 6 - k * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = rgb(hue[0], 0.9 - k * 0.12); ctx.fill();
    }
  }
}
requestAnimationFrame(draw);
setMode("idle");

// ---------- start / stop ----------
const mic = $("#mic");
function setLive(on) {
  state.active = on;
  mic.classList.toggle("live", on);
  mic.setAttribute("aria-label", on ? "Stop the conversation" : "Start talking");
  $("#mic-label").textContent = on ? "Tap to stop" : "Tap to talk";
}
mic.addEventListener("click", () => (state.active ? stop() : start()));

async function start() {
  mic.disabled = true; setMode("connecting");
  try {
    const s = await fetch(`api/session?lang=${state.lang}`).then((r) => r.json()).catch(() => ({ mode: "backup" }));
    if (s.mode === "eleven") {
      try { await startEleven(s.signedUrl); return; }
      catch (e) { console.warn("ElevenLabs voice failed:", e); }
    }
    if (s.reason === "rate_limited") {
      addSys("You've used the premium voice a lot this hour, so I switched to the free backup voice.");
    } else if (state.cfg.vapiPublicKey && state.cfg.vapiAssistantId && !recentlyDown("vapi")) {
      try { await startVapiWeb(); return; }
      catch (e) {
        console.warn("Vapi voice failed:", e); markDown("vapi");
        try { state.vapiWeb?.stop(); } catch {} state.vapiWeb = null;
        addSys("The premium voice is resting right now (its free credit may be used up). Switched to the free voice, it still answers out loud.");
      }
    } else if (s.mode === "eleven") addSys("Premium voice isn't available right now. Switched to the free voice.");
    await startBackup();
  } finally { mic.disabled = false; }
}
function stop() {
  state.active = false;
  try { state.conv?.endSession(); } catch {}
  try { state.vapiWeb?.stop(); } catch {}
  state.vapiWeb = null;
  try { state.rec?.abort(); } catch {}
  try { speechSynthesis.cancel(); } catch {}
  state.stream?.getTracks().forEach((t) => t.stop());
  state.conv = null; state.rec = null; state.analyser = null; state.stream = null; state.engine = null;
  setLive(false); stopTimer(); setMode("idle");
}

// ---------- premium voice: ElevenLabs Agents ----------
async function startEleven(signedUrl) {
  const mod = await import(EL_SDK);
  const Conversation = mod.Conversation || mod.default?.Conversation;
  await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop()));
  state.engine = "eleven";
  let lastUser = "";
  let connected = false, earlyClose = null;
  const early = new Promise((_, fail) => { earlyClose = fail; });
  const conv = await Conversation.startSession({
    signedUrl,
    dynamicVariables: { college_name: college() },
    overrides: state.lang !== "en" ? { agent: { language: state.lang } } : undefined,
    clientTools: { college_lookup: collegeLookup },
    onConnect: () => { connected = true; setLive(true); startTimer(); setMode("listening"); },
    onDisconnect: (d) => { if (!connected) { earlyClose?.(new Error(d?.message || d?.reason || "closed before connecting")); return; } if (state.engine === "eleven") stop(); },
    onModeChange: (m) => setMode((m?.mode || m) === "speaking" ? "speaking" : "listening"),
    onMessage: (m) => {
      const who = m?.source || m?.role; const text = (m?.message || "").trim();
      if (!text) return;
      if (who === "user") { if (text !== lastUser) bubble("user", text); lastUser = text; }
      else bubble("ai", text);
    },
    onError: (e) => { console.warn("agent error", e); },
  });
  state.conv = conv;
  conv.typedEcho = (t) => { lastUser = t; };
  // Wait until the agent really answers the call; otherwise let the caller fall back.
  await Promise.race([early, new Promise((ok) => { const iv = setInterval(() => { if (connected) { clearInterval(iv); ok(); } }, 100); setTimeout(() => { clearInterval(iv); ok(); }, 8000); })]);
  if (!connected) { try { conv.endSession(); } catch {} state.conv = null; state.engine = null; throw new Error("no connection"); }
}

// "SOURCES_FOR_SCREEN (...): Title | https://… ;; Title | https://… ;; ms=6200" → { sources, ms }
function sourcesFrom(text) {
  const m = /SOURCES_FOR_SCREEN[^:]*:\s*(.*)$/.exec(text); const out = { sources: [], ms: 0 };
  if (!m) return out;
  for (const part of m[1].split(" ;; ")) {
    const t = part.trim(), k = /^ms=(\d+)/.exec(t);
    if (k) { out.ms = Number(k[1]); continue; }
    const [title, url] = t.split(" | ");
    if (url && /^https?:\/\//.test(url.trim())) out.sources.push({ title: title.trim(), url: url.trim() });
  }
  return out;
}

const recentlyDown = (k) => { try { return Date.now() - Number(localStorage.getItem(`cv_down_${k}`) || 0) < 30 * 60_000; } catch { return false; } };
const markDown = (k) => { try { localStorage.setItem(`cv_down_${k}`, String(Date.now())); } catch {} };

// ---------- premium voice through Vapi (same agent brain, same lookup tool) ----------
let VapiClass = null;
async function loadVapi() {
  if (!VapiClass) { const mod = await import(VAPI_SDK); VapiClass = mod.default?.default || mod.default || mod.Vapi; }
  return VapiClass;
}
async function startVapiWeb() {
  const Vapi = await loadVapi();
  await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop()));
  const v = new Vapi(state.cfg.vapiPublicKey);
  state.vapiWeb = v; state.engine = "vapi"; state.vapiLevel = 0;
  $("#mode-badge").textContent = "Premium voice · Vapi"; $("#mode-badge").className = "mode premium";
  let connected = false;
  const ready = new Promise((ok, fail) => {
    v.on("call-start", () => { connected = true; setLive(true); startTimer(); setMode("listening"); ok(); });
    v.on("error", (e) => { console.warn("vapi", e); if (!connected) fail(new Error("vapi error")); });
    setTimeout(() => { if (!connected) fail(new Error("vapi timeout")); }, 15000);
  });
  v.on("call-end", () => { if (state.engine === "vapi") stop(); });
  v.on("speech-start", () => setMode("speaking"));
  v.on("speech-end", () => setMode("listening"));
  v.on("volume-level", (l) => { state.vapiLevel = l; });
  const shown = new Set(), pending = new Map();
  let said = "", turnLang = null; // said: the agent's words as written by its brain (the spoken-text copy can break Indian letters)
  let heard = false, greeted = false, lastAi = { text: "", at: 0 }, live = null; // live: the answer bubble while it's being written
  const first = hello(college());
  v.on("message", async (m) => {
    if (m?.type === "model-output" && typeof m.output === "string") {
      // a new reply starts after a pause in the stream (for example after the caller interrupts)
      if (Date.now() - (state.lastOut || 0) > 1500) said = "";
      said += m.output; state.lastOut = Date.now();
      // show the answer as soon as the brain writes it (the spoken copy only arrives after it has been said)
      if (heard && said.trim()) {
        if (!live) live = bubble("ai", said.trim());
        else { live.querySelector(".msg").textContent = said.trim(); const sl = scriptLang(said); if (sl) live.lang = sl; }
        convo.scrollTop = convo.scrollHeight;
      }
    }
    if (m?.type === "user-interrupted") { said = ""; live = null; }
    if (m?.type === "transcript" && m.transcriptType === "final" && m.transcript) {
      if (m.role === "user") {
        heard = true; said = ""; live = null; turnLang = scriptLang(m.transcript);
        const u = bubble("user", m.transcript), prev = u.previousElementSibling;
        // the lookup can start before the caller's words are written down: keep the question above it
        if (prev?.classList.contains("search") && Date.now() - (prev._at || 0) < 6000) convo.insertBefore(u, prev);
      }
      else if (!heard) {
        // the greeting: show the exact words we gave the agent (its spoken-text copy can come back twice or mis-spelt)
        if (!greeted) { greeted = true; bubble("ai", first); }
      } else {
        const broken = /\uFFFD/.test(m.transcript) || (scriptLang(m.transcript) && said.trim().length > m.transcript.length);
        let text = broken && said.trim() ? said.trim() : m.transcript;
        // the "please wait" lines are spoken in the caller's language, but their captions can arrive in English
        if (turnLang && /^(one (minute|moment)|still checking|just a moment)/i.test(text)) text = /^still/i.test(text) ? t("still", turnLang) : t("wait", turnLang);
        if (text === lastAi.text && Date.now() - lastAi.at < 8000) return; // the same line sent twice
        lastAi = { text, at: Date.now() };
        const isWait = Object.values(TEXT.wait).concat(Object.values(TEXT.still)).includes(text);
        if (live && !isWait) { live.querySelector(".msg").textContent = broken || !said.trim() ? text : said.trim(); live = null; }
        else bubble("ai", text);
        if (broken) said = "";
      }
    }
    if (m?.type === "tool-calls") {
      said = "";
      for (const c of m.toolCallList || []) {
        if (shown.has(c.id)) continue; shown.add(c.id);
        let a = c.function?.arguments || {}; if (typeof a === "string") { try { a = JSON.parse(a); } catch { a = {}; } }
        setMode("thinking");
        const el = searching(a.college || college());
        // The agent's own lookup sends its sources back in a conversation update.
        // Only if that never arrives do we look it up ourselves (so the college website isn't read twice at once).
        const timer = setTimeout(() => {
          if (!pending.delete(c.id)) return;
          ask(a.question || "", a.college || college(), a.language || state.lang, "notes").then((r) => showSources(el, r))
            .catch(() => { el.classList.remove("search"); el.querySelector(".msg").textContent = "Read the official website"; });
        }, 25000);
        pending.set(c.id, { el, timer });
      }
    }
    if (m?.type === "conversation-update" && pending.size) {
      for (const x of [...(m.messages || []), ...(m.messagesOpenAIFormatted || [])]) {
        const text = typeof x?.result === "string" ? x.result : typeof x?.content === "string" ? x.content : "";
        if (!text.includes("SOURCES_FOR_SCREEN")) continue;
        const id = x.toolCallId || x.tool_call_id || [...pending.keys()][0];
        const p = pending.get(id); if (!p) continue;
        pending.delete(id); clearTimeout(p.timer);
        showSources(p.el, sourcesFrom(text));
      }
    }
  });
  // Warm up the lookup server for this college while the agent says hello.
  fetch("api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "warm", college: college() }) }).catch(() => {});
  const NAME = { hi: "Hindi", ta: "Tamil", te: "Telugu", ml: "Malayalam" }[state.lang];
  // tell the agent the college and language picked on the website (some scripts look alike to the listener, like Telugu and Kannada)
  const hint = `The caller picked ${college()} on the website: every question is about it unless they name another college, so never ask which college.` +
    (NAME ? ` They also picked ${NAME}: reply in ${NAME}, in ${NAME} script, even if their words arrive in a similar-looking script (like Kannada or Tamil letters), unless they clearly speak English.` : "");
  const overrides = { firstMessage: first, variableValues: { college_name: college(), web_hint: hint } };
  // A language was chosen: listen for that language (more accurate than guessing it from a few words).
  // English stays on auto-detect, so people can still mix languages.
  if (state.lang !== "en") overrides.transcriber = { provider: "11labs", model: "scribe_v2_realtime", language: state.lang,
    fallbackPlan: { transcribers: [{ provider: "google", model: "gemini-2.5-flash", language: "Multilingual" }] } };
  await v.start(state.cfg.vapiAssistantId, overrides);
  await ready;
}

// ---------- backup voice: the browser's own speech tools (free) ----------
async function startBackup() {
  state.engine = "backup";
  $("#mode-badge").textContent = "Free voice"; $("#mode-badge").className = "mode backup";
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    addSys("This browser can't listen to voice. Type your question below and I'll answer out loud. (Chrome on Android or a computer supports voice.)");
    setMode("idle"); return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser = ac.createAnalyser(); state.analyser.fftSize = 1024;
    ac.createMediaStreamSource(state.stream).connect(state.analyser);
  } catch {
    addSys("Please allow the microphone to talk, or type your question below."); setMode("idle"); return;
  }
  setLive(true); startTimer();
  bubble("ai", hello(college()));
  await speak(hello(college()), state.lang);
  listenOnce();
}
function listenOnce() {
  if (!state.active || state.engine !== "backup") return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR(); state.rec = rec;
  rec.lang = LANGS[state.lang].bcp; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let live = null, finalText = "", failed = false;
  rec.onstart = () => setMode("listening");
  rec.onresult = (ev) => {
    let text = ""; for (const r of ev.results) text += r[0].transcript;
    if (!live) live = bubble("user", text); else live.querySelector(".msg").textContent = text;
    if (ev.results[ev.results.length - 1].isFinal) finalText = text.trim();
  };
  rec.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    failed = true;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") addSys("Microphone is blocked. Allow it in the browser, or type your question below.");
    else addSys("Voice input isn't working in this browser right now. Type your question below and I'll still answer out loud.");
    stop();
  };
  rec.onend = async () => {
    if (!state.active || state.engine !== "backup" || failed) return;
    if (!finalText) {
      live?.remove();
      state.quiet = (state.quiet || 0) + 1;
      if (state.quiet >= 3) { state.quiet = 0; addSys("I didn't hear anything. Tap the mic when you're ready, or type below."); return stop(); }
      return setTimeout(listenOnce, 250);
    }
    state.quiet = 0;
    await answerAndSpeak(finalText, { bubbleShown: true });
    listenOnce();
  };
  try { rec.start(); } catch { setTimeout(listenOnce, 600); }
}
async function answerAndSpeak(question, { bubbleShown = false } = {}) {
  if (!bubbleShown) bubble("user", question);
  const c = college(), lang = scriptLang(question) || state.lang;
  setMode("thinking");
  const el = searching(c);
  try {
    const r = await ask(question, c, lang);
    showSources(el, r);
    bubble("ai", r.answer);
    await speak(r.answer, lang);
  } catch (e) {
    el.classList.remove("search"); el.querySelector(".msg").textContent = e.message;
  }
  setMode(state.active ? "listening" : "idle");
}
function pickVoice(lang) {
  const vs = speechSynthesis.getVoices();
  const want = (LANGS[lang] || LANGS.en).voices;
  for (const w of want) { const v = vs.find((x) => x.lang?.toLowerCase().startsWith(w.toLowerCase())); if (v) return v; }
  return null;
}
function speak(text, lang) {
  const v = "speechSynthesis" in window ? pickVoice(lang) : null;
  if (!v) return speakServer(text, lang);
  return new Promise((done) => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = v; u.lang = v.lang; u.rate = 1.02;
    u.onstart = () => setMode("speaking");
    u.onboundary = () => { state.speakPulse = 0.45; };
    u.onend = u.onerror = () => done();
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  });
}
// No voice on this device for the language (often Tamil, Telugu or Malayalam on computers): use a natural AI voice from the server.
let audioCtx = null;
async function speakServer(text, lang) {
  try {
    setMode("thinking");
    const r = await fetch("api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, lang }) });
    if (!r.ok) throw new Error("tts " + r.status);
    const url = URL.createObjectURL(await r.blob());
    const audio = new Audio(url);
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaElementSource(audio); const an = audioCtx.createAnalyser(); an.fftSize = 1024;
      src.connect(an); an.connect(audioCtx.destination); state.outAnalyser = an;
    } catch {}
    await new Promise((done) => { audio.onplay = () => setMode("speaking"); audio.onended = audio.onerror = done; audio.play().catch(done); });
    state.outAnalyser = null; URL.revokeObjectURL(url);
  } catch {
    addSys(t("novoice", lang));
  }
}
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();

// ---------- typed questions ----------
$("#type-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#type-input").value.trim(); if (!v) return;
  $("#type-input").value = ""; askTyped(v);
});
async function askTyped(q) {
  if (state.engine === "eleven" && state.conv) {
    bubble("user", q); state.conv.typedEcho?.(q);
    try { state.conv.sendUserMessage(q); } catch { await answerAndSpeak(q, { bubbleShown: true }); }
    return;
  }
  if (state.rec) { try { state.rec.abort(); } catch {} }
  await answerAndSpeak(q);
}

// ---------- phone agent in the browser (Vapi web call) ----------
let vapi = null, inCall = false, callT0 = 0, callTimer = 0;
const callBtn = $("#call-btn"), callState = $("#call-state"), callLog = $("#call-log");
function logCall(role, text) {
  const p = document.createElement("p"); p.innerHTML = `<b>${role === "user" ? "YOU" : "AGENT"}</b>`; p.append(text);
  const sl = scriptLang(text); if (sl) p.lang = sl;
  callLog.appendChild(p); callLog.scrollTop = callLog.scrollHeight;
}
callBtn.addEventListener("click", async () => {
  if (inCall) { try { vapi?.stop(); } catch {} return; }
  if (state.active) stop();
  callBtn.disabled = true; callState.textContent = "Dialling…";
  try {
    if (!vapi) {
      const Vapi = await loadVapi();
      vapi = new Vapi(state.cfg.vapiPublicKey);
      vapi.on("call-start", () => {
        inCall = true; callBtn.disabled = false; callBtn.textContent = "End call"; callBtn.classList.add("end"); $("#call-ring").classList.add("on");
        callT0 = Date.now(); clearInterval(callTimer);
        callTimer = setInterval(() => { const s = Math.floor((Date.now() - callT0) / 1000); callState.textContent = `On call · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }, 500);
      });
      vapi.on("call-end", () => {
        inCall = false; clearInterval(callTimer); callBtn.disabled = false; callBtn.textContent = "Call from browser"; callBtn.classList.remove("end");
        $("#call-ring").classList.remove("on"); callState.textContent = "Call ended";
      });
      vapi.on("message", (m) => { if (m?.type === "transcript" && m.transcriptType === "final") logCall(m.role, m.transcript); });
      vapi.on("error", (e) => { console.warn("vapi", e); callState.textContent = "The phone line is resting right now (free credit may be used up). Use the voice agent above, it works for free."; callBtn.disabled = false; });
    }
    callLog.innerHTML = "";
    await vapi.start(state.cfg.vapiAssistantId);
  } catch (e) {
    console.warn(e); callState.textContent = "The phone line is resting right now (free credit may be used up). Use the voice agent above, it works for free."; callBtn.disabled = false;
  }
});

// Used only to film the app for the TechVibe24 video (open with ?demo).
if (new URLSearchParams(location.search).has("demo")) window.CV = { bubble, searching, showSources, setMode, addSys, state, setLive, startTimer };
