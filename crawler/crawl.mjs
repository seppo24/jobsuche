// Täglicher Stellenabruf. Liest Arbeitgeber aus der Dropbox (db.json), schreibt jobs.json zurück.
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { discoverEmployers } from './lib/discover.mjs';
import { scanTarif } from './lib/tarif.mjs';
import { makeStore } from './lib/dropbox.mjs';
import { crawlEmployer, fetchDescription, fetchJobLocation } from './lib/extract.mjs';
import { crawlBA } from './lib/adapters.mjs';
import { distanceFor, lookupBuiltin, isForeign } from './lib/geo.mjs';
import { synonymsFromText, matchTitle, parseQuery } from '../js/search.js';

const ONLY = (process.env.ONLY || '').trim();
const CONCURRENCY = +(process.env.CONCURRENCY || 4);
const SOURCE_TIMEOUT = +(process.env.SOURCE_TIMEOUT || 210000);
const NOW = new Date().toISOString();
const PORTAL_LINK_ONLY = new Set(['stepstone', 'linkedin', 'indeed', 'xing']);

const jobId = (empId, url) => crypto.createHash('sha1').update(empId + '|' + url.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase()).digest('hex').slice(0, 12);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function withTimeout(p, ms, label) {
  let t;
  try { return await Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('Zeitüberschreitung bei ' + label + ' – die Seite hat zu lange gebraucht (sehr lange Liste oder langsamer Server)')), ms); })]); } finally { clearTimeout(t); }
}

const store = makeStore();
log('Speicher:', store.mode, ONLY ? `· nur Quelle ${ONLY}` : '');
const dbText = await store.read('db.json');
if (!dbText) throw new Error('db.json nicht gefunden – bitte zuerst die App öffnen und mit Dropbox verbinden.');
const db = JSON.parse(dbText);
const settings = db.settings || {};
const profile = settings.profile || {};
const home = profile.home || { lat: 51.2867, lon: 7.295 };
const employers = Object.values(db.employers || {}).filter(e => !e.deleted && e.crawl !== false && e.url);
const savedIds = new Set(Object.values(db.savedJobs || {}).filter(x => !x.deleted).map(x => x.jobId));

let prev = { jobs: [], sources: {}, geo: {} };
try { const t = await store.read('jobs.json'); if (t) prev = { ...prev, ...JSON.parse(t) }; } catch { /* neu beginnen */ }
const prevById = new Map((prev.jobs || []).map(j => [j.id, j]));
const geo = prev.geo || {};

const browser = await chromium.launch();
const mkContext = () => browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: 1366, height: 900 }, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' });

let altBrowser = null, altCtx = null;
/** Zweiter Browser ohne HTTP/2 – manche Server (z. B. ABB) brechen HTTP/2-Verbindungen von Automaten ab. */
async function altContext() {
  if (!altCtx) { altBrowser = await chromium.launch({ args: ['--disable-http2'] }); altCtx = await altBrowser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: 1366, height: 900 }, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' }); }
  return altCtx;
}

// Sondermodus „Weitere Arbeitgeber finden“: ONLY = discover:<Ort>|<km>
if (ONLY.startsWith('discover:')) {
  const [dOrt, dKm] = ONLY.slice(9).split('|');
  const ctxD = await mkContext();
  const known = Object.values(db.employers || {}).filter(e => !e.deleted).map(e => e.baName || e.name);
  const queries = (profile.queries && profile.queries.length ? profile.queries : ['Projektleiter', 'Teamleiter']);
  const res = await discoverEmployers({ context: ctxD, ort: dOrt || profile.ort || 'Schwelm', radius: parseInt(dKm, 10) || profile.radiusKm || 50, queries, known, ignored: settings.ignoredEmployers || [], log });
  await store.write('vorschlaege.json', JSON.stringify(res));
  log(`Vorschläge gespeichert: ${res.items.length} (von ${res.total} Arbeitgebern mit offenen Stellen)`);
  await ctxD.close(); await browser.close(); process.exit(0);
}

const todo = employers.filter(e => !ONLY || e.id === ONLY);
const results = new Map();
let idx = 0;

async function worker() {
  const ctx = await mkContext();
  while (idx < todo.length) {
    const emp = todo[idx++];
    const t0 = Date.now();
    try {
      if (emp.kind === 'portal') {
        if (emp.portalType === 'ba') {
          const r = await withTimeout(crawlBA({ queries: profile.queries || [], ort: profile.ort || 'Schwelm', radius: profile.radiusKm || 50 }), SOURCE_TIMEOUT, emp.name);
          results.set(emp.id, { items: r.items, test: { status: r.items.length ? 'ok' : 'unsicher', confidence: 'hoch', method: 'ba', count: r.items.length, httpStatus: r.httpStatus, checkedAt: NOW, durationMs: Date.now() - t0, message: r.items.length ? '' : 'Keine Treffer (oder Schnittstelle nicht erreichbar)', checks: [{ ok: r.httpStatus < 400, text: `Schnittstelle der Bundesagentur antwortet (HTTP ${r.httpStatus})` }, { ok: r.items.length > 0, text: `${r.items.length} Stellen für ${(profile.queries || []).join(', ') || 'alle Begriffe'} im Umkreis von ${profile.radiusKm || 50} km um ${profile.ort || 'Schwelm'}` }], sample: r.items.slice(0, 6).map(i => ({ title: i.title, url: i.url, location: i.location })), suggestions: [], url: emp.url } });
        } else if (PORTAL_LINK_ONLY.has(emp.portalType) || emp.portalType === 'link') {
          results.set(emp.id, { items: [], test: { status: 'nur-link', confidence: 'keine', method: '', count: 0, checkedAt: NOW, message: 'Dieses Portal bietet keine freie Schnittstelle – die App öffnet die Suche mit deinen Suchbegriffen direkt dort.', checks: [], sample: [], suggestions: [], url: emp.url } });
        } else {
          results.set(emp.id, await withTimeout(crawlEmployer(ctx, emp, { discover: false }), SOURCE_TIMEOUT, emp.name));
        }
      } else if (emp.baSearch) {
        const name = emp.baName || emp.name;
        const r = await withTimeout(crawlBA({ queries: [''], ort: profile.ort || 'Schwelm', radius: Math.max(profile.radiusKm || 50, 100), arbeitgeber: name, maxPerQuery: 200 }), SOURCE_TIMEOUT, emp.name);
        results.set(emp.id, { items: r.items, test: { status: r.items.length ? 'ok' : 'leer', confidence: 'hoch', method: 'ba', count: r.items.length, httpStatus: r.httpStatus, checkedAt: NOW, durationMs: Date.now() - t0, message: r.items.length ? 'Stellen über die Bundesagentur für Arbeit gefunden (die Karriereseite selbst wird nicht abgerufen).' : `Bei der Bundesagentur für Arbeit gibt es aktuell keine Stellen für „${name}“ (oder der Firmenname lautet dort anders – dann unter „BA-Suchname“ anpassen).`, checks: [{ ok: r.httpStatus < 400, text: `Schnittstelle der Bundesagentur antwortet (HTTP ${r.httpStatus})` }, { ok: r.items.length > 0, text: `${r.items.length} Stellen für „${name}“ im Umkreis von ${Math.max(profile.radiusKm || 50, 100)} km um ${profile.ort || 'Schwelm'}` }], sample: r.items.slice(0, 6).map(i => ({ title: i.title, url: i.url, location: i.location })), suggestions: [], url: emp.url } });
      } else {
        results.set(emp.id, await withTimeout(crawlEmployer(ctx, emp, { altContext }), SOURCE_TIMEOUT, emp.name));
      }
      const r = results.get(emp.id);
      log(`${r.test.status.padEnd(9)} ${String(r.items.length).padStart(4)}  ${emp.name}`);
    } catch (e) {
      log('Fehler', emp.name, e.message);
      results.set(emp.id, { items: [], test: { status: 'fehler', confidence: 'keine', method: '', count: 0, checkedAt: NOW, message: e.message, checks: [{ ok: false, text: e.message }], sample: [], suggestions: [], url: emp.url } });
    }
  }
  await ctx.close();
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length || 1) }, worker));

// ---- Zusammenführen mit dem letzten Stand ----
const jobs = [];
const sources = { ...(prev.sources || {}) };
for (const e of employers) if (!sources[e.id]) sources[e.id] = undefined;
for (const emp of todo) {
  const r = results.get(emp.id);
  if (!r) continue;
  const failed = ['fehler', 'blockiert'].includes(r.test.status);
  // Vom Nutzer bestätigtes Ergebnis (manuell geprüft, Adresse unverändert): nicht mehr „unsicher“
  if (emp.confirm && emp.confirm.url === emp.url && r.test.status === 'unsicher') {
    r.test.status = r.items.length ? 'ok' : 'leer'; r.test.confidence = 'mittel'; r.test.confirmed = true; r.test.message = 'Von dir bestätigt';
  }
  // Unsichere Treffer (niedrige Erkennungssicherheit) werden nicht als Stellen übernommen – nur als Stichprobe im Quellen-Test gezeigt
  const discard = r.test.confidence === 'niedrig' && r.items.length > 0;
  if (discard) { r.test.discarded = r.items.length; r.items = []; }
  const pt = (prev.sources || {})[emp.id] || {};
  sources[emp.id] = { ...r.test, count: r.items.length, tarifHint: pt.tarifHint, tarifChecked: pt.tarifChecked };
  if (failed) { // kurzzeitige Fehler dürfen die bisherigen Stellen nicht löschen
    for (const j of prev.jobs || []) if (j.employerId === emp.id) jobs.push({ ...j, stale: true });
    continue;
  }
  for (const it of r.items) {
    const id = jobId(emp.id, it.url);
    const old = prevById.get(id);
    jobs.push({
      id, employerId: emp.id, employer: it.employer || emp.name, title: it.title, url: it.url, location: (it.location && (!it.locWeak || lookupBuiltin(it.location)) ? it.location : '') || old?.location || '', locChecked: old?.locChecked, meta: (it.meta || '').slice(0, 200),
      postedAt: it.postedAt || '', distanceKm: it.distanceKm ?? old?.distanceKm, description: old?.description,
      firstSeen: old?.firstSeen || NOW, lastSeen: NOW, source: r.test.method,
    });
  }
}
// Quellen, die in diesem Lauf nicht dran waren, behalten ihre Stellen
const touched = new Set(todo.map(e => e.id));
const alive = new Set(employers.map(e => e.id));
for (const j of prev.jobs || []) if (!touched.has(j.employerId) && alive.has(j.employerId)) jobs.push(j);
for (const k of Object.keys(sources)) if (!alive.has(k)) delete sources[k];

// ---- Fehlender Einsatzort: Detailseite der Stelle lesen (jede Stelle einmal je Verfahrensversion; passende Stellen zuerst) ----
const LOC_V = 3;
{
  const groups = synonymsFromText(settings.synonymsText || '');
  const phrases = parseQuery((profile.queries || []).join(','));
  const rank = j => { const m = phrases.length ? matchTitle(j.title, phrases, groups, true) : { score: 1 }; return m ? m.score : -1; };
  const missing = jobs.filter(j => !j.location && j.locChecked !== LOC_V && j.url && !String(j.url).includes('#job-')).map(j => [rank(j), j]).sort((a, b) => b[0] - a[0]).filter(x => x[0] > 0).slice(0, 150).map(x => x[1]);
  if (missing.length) {
    const lctx = await mkContext();
    let k = 0; const t1 = Date.now();
    await Promise.all(Array.from({ length: Math.min(4, missing.length) }, async () => {
      while (k < missing.length && Date.now() - t1 < 8 * 60000) {
        const j = missing[k++];
        const r = await fetchJobLocation(lctx, j.url);
        let loc = r.location;
        if (!loc && r.candidates?.length) { const hit = r.candidates.find(c => lookupBuiltin(c)); if (hit) loc = hit; }
        j.location = String(loc || '').slice(0, 120); j.locChecked = LOC_V;
      }
    }));
    await lctx.close();
    log(`Einsatzort nachgeladen: ${missing.filter(j => j.location).length} von ${missing.length} Stellen`);
  }
}

// ---- Entfernungen ----
let geoCalls = 0;
for (const j of jobs) {
  if (j.distanceKm != null || !j.location) continue;
  const online = geoCalls < 60;
  const before = Object.keys(geo).length;
  j.distanceKm = (await distanceFor(j.location, home, geo, { online })) ?? undefined;
  if (Object.keys(geo).length > before) geoCalls++;
}

for (const j of jobs) { j.foreign = (j.distanceKm == null || j.distanceKm > 300) && isForeign(j.location) ? true : undefined; }

// ---- Beschreibungstexte für gemerkte Stellen ----
const ctx = await mkContext();
let nDesc = 0;
for (const j of jobs) {
  if (nDesc >= 40) break;
  if (savedIds.has(j.id) && !j.description) { j.description = await fetchDescription(ctx, j.url); nDesc++; }
}
// ---- Tarifbindung: ausdrückliche Hinweise in den Stellenanzeigen (je Arbeitgeber höchstens 2 Anzeigen, alle 30 Tage) ----
{
  const manual = new Set(Object.values(db.employers || {}).filter(e => !e.deleted && e.tarif && e.tarif.name).map(e => e.id));
  let nT = 0;
  for (const emp of todo) {
    const src = sources[emp.id]; if (!src || manual.has(emp.id) || emp.kind === 'portal') continue;
    if (src.tarifChecked && (Date.parse(NOW) - Date.parse(src.tarifChecked)) < 30 * 864e5) continue;
    const mine = jobs.filter(j => j.employerId === emp.id && j.url && !String(j.url).includes('#job-')).slice(0, 2);
    if (!mine.length || nT >= 60) continue;
    for (const j of mine) {
      nT++;
      const text = j.description || await fetchDescription(ctx, j.url);
      const t = scanTarif(text);
      if (t) { src.tarifHint = { name: t.name, eg: t.eg, gesichert: true, quelle: 'Stellenanzeige: „' + t.evidence + '“' }; break; }
    }
    src.tarifChecked = NOW;
  }
  log('Tarifhinweise geprüft:', nT, 'Anzeigen');
}
await ctx.close();
await browser.close();
if (altBrowser) await altBrowser.close();

jobs.sort((a, b) => (b.firstSeen || '').localeCompare(a.firstSeen || ''));
const out = { generatedAt: NOW, version: 1, sources, geo, jobs };
await store.write('jobs.json', JSON.stringify(out));
log(`Fertig: ${jobs.length} Stellen aus ${Object.keys(sources).length} Quellen · ${nDesc} Beschreibungen geladen`);
