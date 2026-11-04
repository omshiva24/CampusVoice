// CampusVoice AI — website logic
// © 2026 P Om Shiva, M.Tech CSE (2nd year), Pondicherry University. All rights reserved. See LICENSE.
//
// Premium voice: ElevenLabs Agents (speech-to-text, the agent's brain and natural speech) with a
// "college_lookup" tool that this page runs. Backup voice (free, no minutes): the browser's own
// speech recognition and speech synthesis. Phone: a Vapi voice agent that uses the same lookup.

const EL_SDK = "https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.32.1/+esm";
const VAPI_SDK = "https://cdn.jsdelivr.net/npm/@vapi-ai/web@3.0.1/+esm";

const COLLEGES = [
  "Pondicherry University", "IIT Madras", "Anna University", "NIT Trichy", "VIT Vellore", "PSG College of Technology",
  "IISc Bangalore", "University of Delhi", "SRM Institute of Science and Technology", "Amrita Vishwa Vidyapeetham",
  "Madras Christian College", "Loyola College, Chennai", "BITS Pilani", "IIT Bombay", "Jawaharlal Nehru University",
  "Christ University, Bangalore", "Manipal Institute of Technology", "Stanford University", "University of Oxford", "University of Tokyo",
];
const QUESTIONS = {
  en: ["What is the fee for B.Tech CSE?", "When do admissions open?", "Is there a hostel? What's the fee?", "What is the NIRF rank?", "How are the placements?", "How do I contact the admission office?"],
  ta: ["B.Tech CSE கட்டணம் எவ்வளவு?", "சேர்க்கை எப்போது தொடங்கும்?", "விடுதி வசதி உள்ளதா? கட்டணம் என்ன?", "NIRF தரவரிசை என்ன?", "வேலைவாய்ப்பு (placement) எப்படி?", "சேர்க்கை அலுவலகத்தை எப்படி தொடர்பு கொள்வது?"],
};
const TEXT = {
  idle: { en: "Tap the mic and ask", ta: "மைக்கைத் தட்டி கேளுங்கள்" },
  connecting: { en: "Connecting…", ta: "இணைக்கிறது…" },
  listening: { en: "Listening…", ta: "கேட்கிறேன்…" },
  thinking: { en: "Reading official sources…", ta: "அதிகாரப்பூர்வ தகவல்களைப் படிக்கிறேன்…" },
  speaking: { en: "Speaking…", ta: "பேசுகிறேன்…" },
};

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
  if (state.active) addSys(state.lang === "ta" ? "மொழி அடுத்த உரையாடலில் மாறும். இப்போதும் தமிழில் பேசலாம்." : "Language will switch on the next conversation. You can just start speaking it now.");
}));

function renderQuick() {
  const box = $("#quick"); box.innerHTML = "";
  QUESTIONS[state.lang].forEach((q) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = q;
    if (state.lang === "ta") b.lang = "ta";
    b.addEventListener("click", () => askTyped(q));
    box.appendChild(b);
  });
}
renderQuick();

fetch("api/config").then((r) => r.json()).then((cfg) => {
  state.cfg = cfg;
  $("#mode-badge").textContent = cfg.webVoice ? "Premium voice · ElevenLabs" : "Backup voice · free";
  $("#mode-badge").className = "mode " + (cfg.webVoice ? "premium" : "backup");
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
  if (/[஀-௿]/.test(text)) el.lang = "ta";
  convo.appendChild(el);
  convo.scrollTop = convo.scrollHeight;
  return el;
}
const addSys = (t) => bubble("sys", t);
function searching(collegeName) {
  const el = bubble("ai", "", "Agent tool · college_lookup");
  el.classList.add("search");
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
  const lang = params.language === "ta" ? "ta" : params.language === "en" ? "en" : state.lang;
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
  $("#state").textContent = TEXT[m]?.[state.lang] || "";
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
    if (state.engine === "eleven" && state.conv) {
      target = state.mode === "speaking" ? state.conv.getOutputVolume() : state.mode === "listening" ? state.conv.getInputVolume() : 0;
    } else if (state.analyser && state.mode === "listening") {
      const d = new Uint8Array(state.analyser.fftSize); state.analyser.getByteTimeDomainData(d);
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
      catch (e) {
        console.warn("Premium voice failed:", e);
        addSys("Premium voice isn't available right now (the free minutes may be used up). Switched to the free backup voice.");
      }
    } else if (s.reason === "rate_limited") {
      addSys("You've used the premium voice a lot this hour, so I switched to the free backup voice.");
    }
    await startBackup();
  } finally { mic.disabled = false; }
}
function stop() {
  state.active = false;
  try { state.conv?.endSession(); } catch {}
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
  const conv = await Conversation.startSession({
    signedUrl,
    dynamicVariables: { college_name: college() },
    overrides: state.lang === "ta" ? { agent: { language: "ta" } } : undefined,
    clientTools: { college_lookup: collegeLookup },
    onConnect: () => { setLive(true); startTimer(); setMode("listening"); },
    onDisconnect: () => { if (state.engine === "eleven") stop(); },
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
}

// ---------- backup voice: the browser's own speech tools (free) ----------
async function startBackup() {
  state.engine = "backup";
  $("#mode-badge").textContent = "Backup voice · free"; $("#mode-badge").className = "mode backup";
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
  bubble("ai", state.lang === "ta" ? `வணக்கம்! ${college()} பற்றி என்ன தெரிந்துகொள்ள வேண்டும்?` : `Hi! What would you like to know about ${college()}?`);
  await speak(state.lang === "ta" ? `வணக்கம்! ${college()} பற்றி என்ன தெரிந்துகொள்ள வேண்டும்?` : `Hi! What would you like to know about ${college()}?`, state.lang);
  listenOnce();
}
function listenOnce() {
  if (!state.active || state.engine !== "backup") return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR(); state.rec = rec;
  rec.lang = state.lang === "ta" ? "ta-IN" : "en-IN"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let live = null, finalText = "";
  rec.onstart = () => setMode("listening");
  rec.onresult = (ev) => {
    let text = ""; for (const r of ev.results) text += r[0].transcript;
    if (!live) live = bubble("user", text); else live.querySelector(".msg").textContent = text;
    if (ev.results[ev.results.length - 1].isFinal) finalText = text.trim();
  };
  rec.onerror = (e) => { if (e.error === "not-allowed") { addSys("Microphone is blocked. Allow it in the browser, or type below."); stop(); } };
  rec.onend = async () => {
    if (!state.active || state.engine !== "backup") return;
    if (!finalText) { live?.remove(); return listenOnce(); }
    await answerAndSpeak(finalText, { bubbleShown: true });
    listenOnce();
  };
  try { rec.start(); } catch { setTimeout(listenOnce, 400); }
}
async function answerAndSpeak(question, { bubbleShown = false } = {}) {
  if (!bubbleShown) bubble("user", question);
  const c = college(), lang = /[஀-௿]/.test(question) ? "ta" : state.lang;
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
  const want = lang === "ta" ? ["ta-IN", "ta"] : ["en-IN", "en-GB", "en-US", "en"];
  for (const w of want) { const v = vs.find((x) => x.lang?.toLowerCase().startsWith(w.toLowerCase())); if (v) return v; }
  return null;
}
function speak(text, lang) {
  return new Promise((done) => {
    if (!("speechSynthesis" in window)) return done();
    const v = pickVoice(lang);
    if (lang === "ta" && !v) { addSys("Your device has no Tamil voice installed, so the answer is shown as text."); return done(); }
    const u = new SpeechSynthesisUtterance(text);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang === "ta" ? "ta-IN" : "en-IN";
    u.rate = 1.02;
    u.onstart = () => setMode("speaking");
    u.onboundary = () => { state.speakPulse = 0.45; };
    u.onend = u.onerror = () => done();
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  });
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
  if (/[஀-௿]/.test(text)) p.lang = "ta";
  callLog.appendChild(p); callLog.scrollTop = callLog.scrollHeight;
}
callBtn.addEventListener("click", async () => {
  if (inCall) { try { vapi?.stop(); } catch {} return; }
  if (state.active) stop();
  callBtn.disabled = true; callState.textContent = "Dialling…";
  try {
    if (!vapi) {
      const mod = await import(VAPI_SDK);
      const Vapi = mod.default?.default || mod.default || mod.Vapi;
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
      vapi.on("error", (e) => { console.warn("vapi", e); callState.textContent = "The phone agent couldn't connect. Please try again later."; callBtn.disabled = false; });
    }
    callLog.innerHTML = "";
    await vapi.start(state.cfg.vapiAssistantId);
  } catch (e) {
    console.warn(e); callState.textContent = "The phone agent couldn't connect. Please try again later."; callBtn.disabled = false;
  }
});

// Used only to film the app for the TechVibe24 video (open with ?demo).
if (new URLSearchParams(location.search).has("demo")) window.CV = { bubble, searching, showSources, setMode, addSys, state, setLive, startTimer };
