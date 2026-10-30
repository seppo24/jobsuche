// Jobportale: Suchlinks (Stepstone, LinkedIn, Indeed, XING, Bundesagentur) und Anstoßen des Crawlers.
import { lsGet, lsSet } from './util.js';
import { S, put, settings, flush, pullJobs } from './store.js';
import * as dbx from './dropbox.js';
import { notice } from './ui.js';

const slug = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const nearest = (v, steps) => steps.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
const enc = encodeURIComponent;

export const PORTAL_TYPES = [
  ['ba', 'Bundesagentur für Arbeit (offizielle Schnittstelle)'],
  ['stepstone', 'Stepstone (nur Suchlink)'],
  ['linkedin', 'LinkedIn (nur Suchlink)'],
  ['indeed', 'Indeed (nur Suchlink)'],
  ['xing', 'XING (nur Suchlink)'],
  ['link', 'Anderes Portal mit eigener Such-Adresse'],
];

export function searchUrl(emp, q, ort, radius) {
  const r = radius || 50;
  switch (emp.portalType) {
    case 'stepstone': return `https://www.stepstone.de/jobs/${slug(q)}/in-${slug(ort)}?radius=${nearest(r, [5, 10, 20, 30, 40, 50, 100])}`;
    case 'linkedin': return `https://www.linkedin.com/jobs/search/?keywords=${enc(q)}&location=${enc(ort + ', Deutschland')}&distance=${nearest(r / 1.609, [5, 10, 25, 50, 100])}`;
    case 'indeed': return `https://de.indeed.com/jobs?q=${enc(q)}&l=${enc(ort)}&radius=${nearest(r, [5, 10, 15, 25, 50, 100])}`;
    case 'xing': return `https://www.xing.com/jobs/search?keywords=${enc(q)}&location=${enc(ort)}&radius=${nearest(r, [10, 20, 30, 50, 100])}`;
    case 'ba': return `https://www.arbeitsagentur.de/jobsuche/suche?was=${enc(q)}&wo=${enc(ort)}&umkreis=${nearest(r, [5, 10, 15, 20, 25, 30, 50, 100, 200])}`;
    default: {
      const t = emp.searchUrl || emp.url || '';
      return t.replace(/\{q\}/g, enc(q)).replace(/\{ort\}/g, enc(ort)).replace(/\{radius\}/g, String(r));
    }
  }
}

const SEED_PORTALS = [
  { id: 'portal-ba', name: 'Bundesagentur für Arbeit – Jobbörse', url: 'https://www.arbeitsagentur.de/jobsuche/', portalType: 'ba', note: 'Offizielle Schnittstelle: Die App ruft hier automatisch Stellen für deine Suchbegriffe im Umkreis ab.' },
  { id: 'portal-stepstone', name: 'Stepstone', url: 'https://www.stepstone.de/', portalType: 'stepstone', note: 'Keine freie Schnittstelle – die App öffnet die Suche mit deinen Begriffen direkt bei Stepstone.' },
  { id: 'portal-linkedin', name: 'LinkedIn', url: 'https://www.linkedin.com/jobs/', portalType: 'linkedin', note: 'Keine freie Schnittstelle – Suchlink mit deinen Begriffen. Für LinkedIn bitte angemeldet im Browser öffnen.' },
  { id: 'portal-indeed', name: 'Indeed', url: 'https://de.indeed.com/', portalType: 'indeed', note: 'Keine freie Schnittstelle – Suchlink.' },
  { id: 'portal-xing', name: 'XING Jobs', url: 'https://www.xing.com/jobs', portalType: 'xing', note: 'Keine freie Schnittstelle – Suchlink.' },
];
export function seedPortals() {
  for (const p of SEED_PORTALS) if (!S.db.employers[p.id]) put('employers', { ...p, kind: 'portal', branche: '', crawl: p.portalType === 'ba' });
}
export const portals = list => list.filter(e => e.kind === 'portal');

// ---- Crawler anstoßen (GitHub Actions) ----
export const ghToken = () => lsGet('jobsuche.ghpat', '');
export const setGhToken = t => lsSet('jobsuche.ghpat', (t || '').trim());
export function canTrigger() { const g = settings().github || {}; return !!(g.owner && g.repo && ghToken()); }
export async function triggerCrawl(only = '') {
  const g = settings().github || {};
  if (!canTrigger()) throw new Error('Unter Info → Einstellungen → „Automatischer Abruf“ GitHub-Konto, Repository und Zugriffstoken eintragen.');
  if (dbx.isConnected()) await flush().catch(() => {}); // geänderte Adressen müssen vor dem Abruf in der Dropbox liegen
  const r = await fetch(`https://api.github.com/repos/${g.owner}/${g.repo}/actions/workflows/crawl.yml/dispatches`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + ghToken(), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ ref: g.branch || 'main', inputs: { only: only || '' } }),
  });
  if (r.status !== 204) {
    let m = ''; try { m = (await r.json()).message; } catch { /* leer */ }
    throw new Error(`GitHub: ${m || 'HTTP ' + r.status}${r.status === 404 ? ' – Repository, Workflow „crawl.yml“ oder Token-Rechte (Actions: Read and write) prüfen.' : ''}`);
  }
  return true;
}

// ---- Auf das Ergebnis eines gestarteten Abrufs warten (jobs.json in der Dropbox wird neu geschrieben) ----
// Der Lauf wird gemerkt, damit die Überwachung auch nach einem Neuladen der App weitergeht.
const RK = 'jobsuche.run';
let watching = false;
export const isWatching = () => watching;
/** Zustand des letzten GitHub-Laufs (braucht den GitHub-Zugang): { status, conclusion, url } oder null. */
export async function runStatus() {
  const g = settings().github || {};
  if (!canTrigger()) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${g.owner}/${g.repo}/actions/workflows/crawl.yml/runs?per_page=1`, { headers: { Authorization: 'Bearer ' + ghToken(), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    if (!r.ok) return null;
    const run = ((await r.json()).workflow_runs || [])[0];
    return run ? { status: run.status, conclusion: run.conclusion, url: run.html_url, startedAt: run.run_started_at } : null;
  } catch { return null; }
}

export function watchForResult(onDone, { everyMs = 20000, maxMs = 120 * 60000, resume = null } = {}) {
  if (watching) return;
  watching = true;
  const before = resume ? resume.before : S.jobs.generatedAt, t0 = resume ? resume.t0 : Date.now();
  try { localStorage.setItem(RK, JSON.stringify({ before, t0 })); } catch { /* ohne Speicher */ }
  const finish = (ok, msg) => {
    watching = false;
    try { localStorage.removeItem(RK); } catch { /* egal */ }
    notice(msg || (ok ? 'Der Abruf ist abgeschlossen. Die neuen Stellen sind geladen.' : 'Der Abruf hat kein Ergebnis geliefert. Bitte in GitHub unter „Actions“ nachsehen.'), ok ? 'ok' : 'bad');
    onDone && onDone(ok);
  };
  let n = 0;
  const tick = async () => {
    try { await pullJobs(); } catch { /* nächster Versuch */ }
    if (S.jobs.generatedAt !== before && !S.jobs.partial) { finish(true); return; }
    // Alle 2 Minuten den echten Zustand bei GitHub prüfen (statt nur zu raten)
    if (n++ % 6 === 5) {
      const rs = await runStatus();
      if (rs && rs.status === 'completed' && rs.conclusion && rs.conclusion !== 'success') { finish(false, `Der Abruf bei GitHub ist nicht erfolgreich beendet worden (${rs.conclusion}). Details unter „Actions“ in GitHub.`); return; }
      if (rs && rs.status === 'completed' && rs.conclusion === 'success') { await pullJobs().catch(() => {}); finish(true, 'Der Abruf ist abgeschlossen. Die neuen Stellen sind geladen.'); return; }
    }
    if (Date.now() - t0 > maxMs) { finish(false, 'Der Abruf läuft seit über 2 Stunden. Bitte in GitHub unter „Actions“ nachsehen.'); return; }
    setTimeout(tick, everyMs);
  };
  setTimeout(tick, everyMs);
}
/** Beim Start: einen noch laufenden Abruf weiter beobachten. */
export function resumeWatch() {
  try { const r = JSON.parse(localStorage.getItem(RK) || 'null'); if (r && Date.now() - r.t0 < 120 * 60000) watchForResult(null, { resume: r }); else if (r) localStorage.removeItem(RK); } catch { /* ignorieren */ }
}
