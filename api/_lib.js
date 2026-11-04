// CampusVoice AI — shared server code
// © 2026 P Om Shiva, M.Tech CSE (2nd year), Pondicherry University. All rights reserved. See LICENSE.
//
// The research "brain" of the voice agent. For ANY college it:
//   1. finds the college on Wikipedia and its official website on Wikidata,
//   2. reads the official pages that match the question (admissions, fees, hostel, ...),
//   3. picks the most relevant passages and returns them with their sources.
// The voice agents (ElevenLabs on the web, Vapi on the phone) answer only from these passages.

const UA = "Mozilla/5.0 (compatible; CampusVoiceBot/1.0; +https://github.com/omshiva24/CampusVoice)";
const BROWSER_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 CampusVoiceAI/1.0";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
export const MODELS = (process.env.GEMINI_MODELS || "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.7-flash,gemini-3.8-flash")
  .split(",").map((m) => m.trim()).filter(Boolean);

// ---------- small helpers ----------
export function ipOf(req) {
  return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "local";
}
const buckets = new Map();
export function limited(key, max, windowMs) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now); buckets.set(key, list);
  if (buckets.size > 5000) buckets.clear();
  return list.length > max;
}
export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  try { const chunks = []; for await (const c of req) chunks.push(c); return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}
export const clean = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

async function fetchWithTimeout(url, ms, accept = "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5") {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const ua = /wikipedia\.org|wikidata\.org/.test(url) ? UA : BROWSER_UA;
  try {
    return await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": ua, Accept: accept, "Accept-Language": "en-IN,en;q=0.9" } });
  } finally { clearTimeout(timer); }
}
async function getJson(url, ms = 5000) {
  const r = await fetchWithTimeout(url, ms, "application/json");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ---------- HTML to text ----------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', hellip: "…", rupee: "₹" };
function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
function htmlToParagraphs(html) {
  const body = html
    .replace(/<(script|style|noscript|svg|iframe|template|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/td|\/th|\/dd|\/dt)\b[^>]*>/gi, "\n")
    .replace(/<\/?(td|th)\b[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, " ");
  return decode(body).split(/\n+/).map((l) => l.replace(/[ \t |]+/g, " ").replace(/^\s*\|\s*/, "").trim()).filter((l) => l.length >= 25 && l.length <= 1200);
}
function linksOf(html, base) {
  const out = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 600) {
    try {
      const url = new URL(decode(m[1]).trim(), base).href;
      if (!/^https?:/.test(url)) continue;
      out.push({ url, text: decode(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 120) });
    } catch {}
  }
  return out;
}
async function fetchPage(url, ms = 6500) {
  // The timeout covers the whole download, not just the first byte, and we stop after 1.5 MB.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "Accept-Language": "en-IN,en;q=0.9" } });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !/html|xml|text\/plain/i.test(type)) { ctrl.abort(); throw new Error(`skip ${r.status} ${type}`); }
    const reader = r.body.getReader(); const dec = new TextDecoder(); let html = "";
    while (html.length < 1_500_000) { const { done, value } = await reader.read(); if (done) break; html += dec.decode(value, { stream: true }); }
    try { reader.cancel(); } catch {}
    const title = decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "").replace(/\s+/g, " ").trim()).slice(0, 90);
    return { url: r.url || url, html, title };
  } finally { clearTimeout(timer); }
}

// ---------- what the question is about ----------
const TOPICS = {
  fees: ["fee", "fees", "tuition", "cost", "₹", "rs", "inr", "charges", "payment", "fee structure", "கட்டணம்"],
  admission: ["admission", "admissions", "apply", "application", "last date", "deadline", "entrance", "eligibility", "counselling", "prospectus", "cuet", "jee", "tnea", "intake", "seats", "சேர்க்கை"],
  hostel: ["hostel", "hostels", "accommodation", "residence", "mess", "dormitory", "boarding", "விடுதி"],
  placement: ["placement", "placements", "recruit", "recruiters", "package", "lpa", "ctc", "salary", "career", "training and placement", "வேலைவாய்ப்பு"],
  rank: ["nirf", "rank", "ranking", "rankings", "naac", "accredit", "accreditation", "grade", "nba", "தரவரிசை"],
  contact: ["contact", "phone", "telephone", "email", "e-mail", "address", "helpline", "enquiry", "location", "தொடர்பு"],
  courses: ["course", "courses", "programme", "programmes", "program", "programs", "department", "departments", "b.tech", "m.tech", "degree", "ug", "pg", "ph.d", "phd", "படிப்பு"],
  scholarship: ["scholarship", "scholarships", "fellowship", "financial aid", "fee waiver", "freeship", "உதவித்தொகை"],
  campus: ["campus", "library", "facilities", "transport", "bus", "sports", "canteen", "wifi", "acres"],
};
const STOP = new Set("what when where which who whom whose how does do did is are was were the a an of for to in on at by with and or about from this that there their them they it its can could would should will shall may might much many any some your you me my i we our please tell know give list".split(" "));
function intent(question) {
  const q = ` ${question.toLowerCase()} `;
  const topics = Object.entries(TOPICS).filter(([, ws]) => ws.some((w) => termRe(w).test(q))).map(([t]) => t);
  const primary = topics.filter((t) => t !== "courses" && t !== "campus");
  const words = [...new Set(q.replace(/[^\p{L}\p{N}.₹ ]+/gu, " ").split(/\s+/).map((w) => w.replace(/^\.+|\.+$/g, "")).filter((w) => w.length > 2 && !STOP.has(w)))];
  const terms = new Map();
  const main = new Set();
  for (const t of topics) for (const w of TOPICS[t]) {
    const isMain = !primary.length || primary.includes(t);
    terms.set(w, isMain ? 3 : 1); if (isMain) main.add(w);
  }
  for (const w of words) if (!terms.has(w)) terms.set(w, 1.5);
  return { topics, terms, main, numeric: primary.some((t) => ["fees", "admission", "placement", "rank", "contact", "hostel"].includes(t)) };
}
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const reCache = new Map();
function termRe(w) {
  if (!reCache.has(w)) reCache.set(w, /^[a-z0-9.]+$/i.test(w) ? new RegExp(`(^|[^a-z0-9])${esc(w)}(?=$|[^a-z0-9])`, "i") : new RegExp(esc(w), "i"));
  return reCache.get(w);
}
// Prefer this year's and next year's information over old notices.
const NOW_Y = new Date().getFullYear();
function yearFactor(t) {
  const ys = (t.match(/\b20[12]\d\b/g) || []).map(Number);
  if (!ys.length) return 1;
  const max = Math.max(...ys);
  if (max >= NOW_Y) return 1.7;
  if (max === NOW_Y - 1) return 1.25;
  return max <= NOW_Y - 3 ? 0.35 : 0.7;
}
function score(text, it) {
  const t = text.toLowerCase();
  let s = 0;
  let hitMain = it.main.size === 0;
  for (const [w, wt] of it.terms) { if (termRe(w).test(t)) { s += wt * (w.length > 4 ? 1.2 : 1); if (it.main.has(w)) hitMain = true; } }
  if (!hitMain) s *= 0.25;
  s *= yearFactor(t);
  if (it.numeric && /(₹|rs\.?\s?\d|\d{2,}[,.]?\d*|20\d\d|\+91|@)/i.test(text)) s *= 1.5;
  if (s === 0) return 0;
  return s / Math.sqrt(Math.max(1, text.length / 160));
}

// ---------- step 1: identify the college (Wikipedia + Wikidata) ----------
const colleges = new Map();
async function identify(name) {
  const key = name.toLowerCase();
  const hit = colleges.get(key);
  if (hit && Date.now() - hit.at < 12 * 3600_000) return hit.value;
  const WP = "https://en.wikipedia.org/w/api.php";
  const search = await getJson(`${WP}?action=query&list=search&srsearch=${encodeURIComponent(name + " university OR college OR institute")}&srlimit=5&format=json`);
  const results = search?.query?.search || [];
  const words = name.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const best = results.map((r) => ({ r, s: words.filter((w) => r.title.toLowerCase().includes(w)).length + (/(universit|college|institut|school|academy|vidyapeeth|iit|nit)/i.test(r.title) ? 1 : 0) }))
    .sort((a, b) => b.s - a.s)[0]?.r;
  let value = { name, title: name, wikiUrl: null, wiki: [], website: null };
  if (best) {
    const page = await getJson(`${WP}?action=query&prop=extracts|pageprops|info&inprop=url&explaintext=1&exsectionformat=plain&redirects=1&titles=${encodeURIComponent(best.title)}&format=json`);
    const p = Object.values(page?.query?.pages || {})[0] || {};
    value.title = p.title || best.title;
    value.wikiUrl = p.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(best.title)}`;
    value.wiki = String(p.extract || "").split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 40).slice(0, 220);
    const qid = p.pageprops?.wikibase_item;
    if (qid) {
      try {
        const wd = await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, 5000);
        const claims = wd?.entities?.[qid]?.claims || {};
        const sites = (claims.P856 || []).map((c) => c?.mainsnak?.datavalue?.value).filter(Boolean);
        value.website = sites.find((u) => /\.(ac|edu)\.|\.edu$|\.ac$/i.test(host(u))) || sites[0] || null;
      } catch {}
    }
  }
  colleges.set(key, { at: Date.now(), value });
  if (colleges.size > 300) colleges.delete(colleges.keys().next().value);
  return value;
}

// ---------- step 2: read the official website ----------
const homes = new Map();
async function homepage(url) {
  const hit = homes.get(url);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.value;
  const tries = [url.replace(/^http:/, "https:"), url];
  let p = null, err = null;
  for (const u of [...new Set(tries)]) {
    try { p = await fetchPage(u, 6000); } catch (e) { err = e; continue; }
    // follow a meta-refresh or a simple script redirect once
    const next = /http-equiv=["']?refresh["']?[^>]*url=([^"'>\s]+)/i.exec(p.html)?.[1] || /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i.exec(p.html)?.[1];
    if (next && htmlToParagraphs(p.html).length < 3) { try { p = await fetchPage(new URL(next, p.url).href, 7000); } catch {} }
    if (p && (htmlToParagraphs(p.html).length || linksOf(p.html, p.url).length)) break;
  }
  if (!p) throw err || new Error("site unreachable");
  const value = { url: p.url, title: p.title, paras: htmlToParagraphs(p.html), links: linksOf(p.html, p.url), bytes: p.html.length, head: p.html.slice(0, 160).replace(/\s+/g, " ") };
  homes.set(url, { at: Date.now(), value });
  if (homes.size > 200) homes.delete(homes.keys().next().value);
  return value;
}

// Pages listed in the site's sitemap (most college sites have one), so we can find deep pages too.
const maps = new Map();
async function sitemapUrls(origin) {
  const hit = maps.get(origin);
  if (hit && Date.now() - hit.at < 12 * 3600_000) return hit.value;
  const urls = [];
  const grab = async (u) => {
    try {
      const r = await fetchWithTimeout(u, 3000, "application/xml,text/xml,*/*");
      if (!r.ok) return [];
      const x = (await r.text()).slice(0, 2_000_000);
      return [...x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));
    } catch { return []; }
  };
  // try the usual sitemap locations at the same time, use the first that has entries
  const all = await Promise.all(["/sitemap.xml", "/wp-sitemap.xml", "/sitemap_index.xml"].map((path) => grab(origin + path)));
  const locs = all.find((l) => l.length) || [];
  const subs = locs.filter((l) => /\.xml(\?|$)/i.test(l));
  urls.push(...locs.filter((l) => !/\.xml(\?|$)/i.test(l)));
  const children = await Promise.all(subs.filter((l) => /page|post|admission|fee|course|program|default|sitemap\d|main|depart/i.test(l)).slice(0, 4).map(grab));
  children.forEach((c) => urls.push(...c.filter((l) => !/\.xml(\?|$)/i.test(l))));
  const value = [...new Set(urls)].slice(0, 5000);
  maps.set(origin, { at: Date.now(), value });
  if (maps.size > 100) maps.delete(maps.keys().next().value);
  return value;
}

const within = (p, ms) => Promise.race([p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e })), new Promise((r) => setTimeout(() => r({ ok: false, timeout: true }), ms))]);
const isChallenge = (p) => /validation|captcha|attention required|access denied|just a moment|are you a robot/i.test(p.title || "") && (p.paras?.length || 0) < 12;
const pdfTitle = (l) => (l.text && !/^https?:|^www\./i.test(l.text) ? l.text : pdfName(l.url));
const pdfName = (u) => { try { return decodeURIComponent(new URL(u).pathname.split("/").pop()).replace(/\.pdf$/i, "").replace(/[_\-]+/g, " ").slice(0, 60); } catch { return "PDF document"; } };

// ---------- the research step used by every channel ----------
export async function researchCollege({ college, question }) {
  college = clean(college, 120); question = clean(question, 300);
  if (!college) { const e = new Error("Please tell me which college you mean."); e.status = 400; throw e; }
  if (!question) { const e = new Error("Please ask a question about the college."); e.status = 400; throw e; }
  const t0 = Date.now();
  const it = intent(question);
  const info = await identify(college).catch(() => ({ name: college, title: college, wiki: [], website: null }));
  const tIdent = Date.now() - t0;
  const passages = [];
  const sources = [];
  const docs = [];
  const debug = {};
  const addSource = (title, url) => { if (url && !sources.some((s) => s.url === url)) sources.push({ title, url }); };

  if (info.website) {
    try {
      const startOrigin = new URL(info.website.replace(/^http:/, "https:")).origin;
      const tH = Date.now();
      const words = (u) => { try { return decodeURIComponent(new URL(u).pathname).replace(/[\/_\-.]+/g, " "); } catch { return u; } };
      const homeP = homepage(info.website).then((v) => { debug.tHome = Date.now() - tH; return v; });
      homeP.catch(() => {});
      let mapped = await sitemapUrls(startOrigin).catch(() => []);
      debug.tMap = Date.now() - tH; debug.tIdent = tIdent;
      // If the sitemap already points to matching pages, don't wait long for a slow homepage.
      const strong = mapped.some((u) => score(words(u), it) >= 3);
      const hr = await within(homeP, Math.max(400, (strong ? 4500 : 9000) - (Date.now() - tH)));
      let home = hr.ok && !isChallenge(hr.v) ? hr.v : null;
      const site = host(home?.url || info.website);
      const root = site.split(".").slice(-3).join(".");
      const addHome = (h) => h.paras.forEach((t) => passages.push({ t, s: score(t, it) * 1.1, src: { title: site, url: h.url } }));
      if (home) addHome(home);
      const seen = new Set(home ? [home.url] : []);
      if (!mapped.length && home && new URL(home.url).origin !== startOrigin) mapped = await sitemapUrls(new URL(home.url).origin);
      const fromMap = mapped.map((u) => ({ url: u, text: "" }));
      const cands = [...(home?.links || []), ...fromMap]
        .filter((l) => host(l.url).endsWith(root))
        .map((l) => ({ ...l, s: score(`${l.text} ${words(l.url)}`, it) * (l.text ? 1.2 : 1) }))
        .filter((l) => l.s > 0 && !seen.has(l.url) && (seen.add(l.url), true))
        .sort((a, b) => b.s - a.s);
      debug.home = home ? { url: home.url, title: home.title, paras: home.paras.length, links: home.links.length } : { failed: hr.timeout ? "slow, skipped" : hr.e?.message || "bot check" };
      debug.sitemap = fromMap.length; debug.top = cands.slice(0, 6).map((c) => `${c.s.toFixed(1)} ${c.text.slice(0, 30)} ${c.url}`);
      for (const l of cands.filter((l) => /\.pdf(\?|$)/i.test(l.url)).slice(0, 3)) docs.push({ title: pdfTitle(l), url: l.url });
      const pages = cands.filter((l) => !/\.(pdf|jpe?g|png|docx?|xlsx?|zip)(\?|$)/i.test(l.url)).slice(0, 3);
      const left = 15000 - (Date.now() - t0);
      const tP = Date.now();
      const got = left > 2500 ? await Promise.allSettled(pages.map((l) => fetchPage(l.url, Math.min(5500, left)))) : [];
      debug.tPages = Date.now() - tP;
      debug.pages = got.map((g, i) => `${g.status === "fulfilled" ? (isChallenge({ title: g.value.title, paras: [1, 2, 3] }) ? "bot check" : "ok") : "fail " + (g.reason?.message || "").slice(0, 40)} ${pages[i].url}`);
      got.forEach((g, i) => {
        if (g.status !== "fulfilled" || /validation|captcha|attention required|access denied/i.test(g.value.title)) return;
        const label = `${site} · ${(pages[i].text || g.value.title || "page").slice(0, 40)}`;
        htmlToParagraphs(g.value.html).forEach((t) => passages.push({ t, s: score(t, it) * 1.3, src: { title: label, url: g.value.url } }));
        linksOf(g.value.html, g.value.url).filter((l) => /\.pdf(\?|$)/i.test(l.url) && score(`${l.text} ${pdfName(l.url)}`, it) > 0).slice(0, 2)
          .forEach((l) => { if (!docs.some((d) => d.url === l.url)) docs.push({ title: pdfTitle(l), url: l.url }); });
      });
      if (!home) { const late = await within(homeP, 50); if (late.ok && !isChallenge(late.v)) { home = late.v; addHome(home); debug.lateHome = true; } }
    } catch (e) { console.warn("site read failed", info.website, e.message); debug.error = e.message; }
  }
  info.wiki.forEach((t) => passages.push({ t, s: score(t, it), src: { title: "Wikipedia", url: info.wikiUrl } }));

  // best passages, no near-duplicates, about 2,600 characters in total
  const picked = [];
  let size = 0;
  for (const p of passages.filter((p) => p.s > 0).sort((a, b) => b.s - a.s)) {
    const k = p.t.slice(0, 60).toLowerCase();
    if (picked.some((x) => x.t.slice(0, 60).toLowerCase() === k)) continue;
    picked.push(p); size += p.t.length; addSource(p.src.title, p.src.url);
    if (size > 2600 || picked.length >= 9) break;
  }
  if (!picked.length && info.wiki.length) { picked.push({ t: info.wiki.slice(0, 2).join(" "), src: { title: "Wikipedia", url: info.wikiUrl } }); addSource("Wikipedia", info.wikiUrl); }
  docs.slice(0, 3).forEach((d) => addSource(`PDF: ${d.title.slice(0, 40)}`, d.url));
  console.log(`research ${Date.now() - t0}ms site=${info.website || "-"} passages=${picked.length} docs=${docs.length} :: ${college} :: ${question.slice(0, 60)}`);
  return { college: info.title, website: info.website, wikiUrl: info.wikiUrl, passages: picked, docs: docs.slice(0, 3), sources: sources.slice(0, 5), ms: Date.now() - t0, debug };
}

// Notes for a voice agent's LLM: it answers only from these.
export function notesFor(r) {
  const lines = [`College: ${r.college}${r.website ? ` (official website: ${host(r.website)})` : " (official website not found)"}.`];
  if (!r.passages.length) lines.push("No relevant information was found on the official website or Wikipedia for this question.");
  r.passages.forEach((p) => lines.push(`[${p.src.title}] ${p.t}`));
  if (r.docs.length) lines.push(`Documents on the official website: ${r.docs.map((d) => `"${d.title}" (PDF)`).join("; ")}.`);
  lines.push("Answer ONLY from these notes, briefly, and mention the source. If the exact answer isn't here, say so honestly and suggest the official website or admission office (mention a matching PDF document if one is listed). Information may be from an earlier year: say which year if the notes show it.");
  return lines.join("\n");
}

// ---------- typed questions / backup voice: a short answer written by Gemini from the notes ----------
async function gemini(model, notes, question, lang, timeoutMs) {
  const generationConfig = { temperature: 0.2 };
  if (/^gemini-3/.test(model)) generationConfig.thinkingConfig = { thinkingLevel: /lite/.test(model) ? "minimal" : "low" };
  const sys = `You are CampusVoice, a friendly college helpdesk. Answer the question using ONLY the notes. Reply in ${lang === "ta" ? "simple spoken Tamil (words like B.Tech, hostel, NIRF can stay in English)" : "English"}, at most 3 short sentences for speaking aloud, no markdown, no links. Mention where the info comes from (official website or Wikipedia) and the year if shown. If the notes don't contain the answer, say so honestly and suggest the official website or admission office.`;
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts: [{ text: `NOTES:\n${notes}\n\nQUESTION: ${question}` }] }], generationConfig }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d?.error?.message || `AI error ${r.status}`); e.status = r.status; throw e; }
    return (d?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();
  } finally { clearTimeout(timer); }
}
const answers = new Map();
export async function answerCollegeQuestion({ college, question, lang = "en" }) {
  lang = lang === "ta" ? "ta" : "en";
  const key = `${college}|${question}|${lang}`.toLowerCase();
  const hit = answers.get(key);
  if (hit && Date.now() - hit.at < 3 * 3600_000) return { ...hit.value, cached: true, ms: 0 };
  const t0 = Date.now();
  const r = await researchCollege({ college, question });
  const notes = notesFor(r);
  let answer = "", model = null;
  if (process.env.GEMINI_API_KEY) {
    for (const m of MODELS) {
      if (Date.now() - t0 > 20000) break;
      try { answer = await gemini(m, notes, question, lang, 9000); model = m; if (answer) break; }
      catch (e) { console.warn(`gemini ${m} ${e.status || ""} ${e.message.slice(0, 80)}`); }
    }
  }
  if (!answer) {
    // AI busy: read out the most relevant line from the official sources instead of failing.
    const top = r.passages[0];
    answer = top ? `Here's what ${top.src.title.split(" · ")[0]} says: ${top.t.slice(0, 280)}` : `I couldn't find that for ${r.college}. Please check the official website${r.website ? ` (${host(r.website)})` : ""} or call the admission office.`;
    if (lang === "ta" && top) answer = `${top.src.title.split(" · ")[0]} தகவல்: ${top.t.slice(0, 280)}`;
  }
  const value = { answer, sources: r.sources, college: r.college, website: r.website, model, lang };
  answers.set(key, { at: Date.now(), value });
  if (answers.size > 400) answers.delete(answers.keys().next().value);
  return { ...value, ms: Date.now() - t0 };
}
