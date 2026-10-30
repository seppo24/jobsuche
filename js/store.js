// Zentraler Zustand: Datenbank (Dropbox: /Jobsuche/db.json), Stellenliste (jobs.json vom Crawler), Abgleich.
import { lsGet, lsSet, idb, nowIso, debounce } from './util.js';
import * as dbx from './dropbox.js';
import { DEFAULT_SYNONYMS, synonymsToText, DEFAULT_EXCLUDE_STUDENT, DEFAULT_EXCLUDE_DEFENCE } from './search.js';

const LS_DB = 'jobsuche.db.v1';
export const COLLS = ['employers', 'applications', 'documents', 'savedJobs', 'texts'];
export const SEED_TS = '2026-10-29T00:00:00.000Z';

export function defaultSettings() {
  return {
    updatedAt: SEED_TS,
    profile: {
      name: '', email: '', phone: '', address: '', ort: 'Schwelm',
      home: { lat: 51.2867, lon: 7.295 }, radiusKm: 50,
      queries: ['Projektleiter', 'Teamleiter'],
    },
    synonymsText: synonymsToText(DEFAULT_SYNONYMS),
    excludeStudent: DEFAULT_EXCLUDE_STUDENT,
    excludeDefence: DEFAULT_EXCLUDE_DEFENCE,
    hide: { student: false, defence: false, branche: false, branchen: ['Automotive'] }, hideV: 2,
    followUpWeeks: [6, 8],
    github: { owner: '', repo: '' },
    ai: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
  };
}

export function emptyDb() {
  const d = { schema: 1, settings: defaultSettings() };
  COLLS.forEach(c => d[c] = {});
  return d;
}

function normalizeDb(x) {
  const d = emptyDb();
  if (!x || typeof x !== 'object') return d;
  if (x.settings) d.settings = { ...d.settings, ...x.settings, profile: { ...d.settings.profile, ...(x.settings.profile || {}) }, hide: { ...d.settings.hide, ...(x.settings.hide || {}) }, github: { ...d.settings.github, ...(x.settings.github || {}) }, ai: { ...d.settings.ai, ...(x.settings.ai || {}) } };
  if (x.settings && x.settings.hideV !== 2) d.settings.hide = { student: false, defence: false, branche: false, branchen: ['Automotive'] }, d.settings.hideV = 2; // ab 1.0.12: nichts standardmäßig ausblenden
  COLLS.forEach(c => { if (x[c] && typeof x[c] === 'object') d[c] = x[c]; });
  return d;
}

/** Zusammenführen zweier Datenstände: pro Eintrag gewinnt der jüngere Zeitstempel. */
export function mergeDb(a, b) {
  const out = emptyDb();
  out.settings = (a.settings?.updatedAt || '') >= (b.settings?.updatedAt || '') ? a.settings : b.settings;
  for (const c of COLLS) {
    const m = {};
    const ids = new Set([...Object.keys(a[c] || {}), ...Object.keys(b[c] || {})]);
    for (const id of ids) {
      const x = a[c]?.[id], y = b[c]?.[id];
      m[id] = !x ? y : !y ? x : ((x.updatedAt || '') >= (y.updatedAt || '') ? x : y);
    }
    out[c] = m;
  }
  return out;
}

function purgeTombstones(db) {
  const limit = Date.now() - 90 * 86400000;
  for (const c of COLLS) for (const [id, v] of Object.entries(db[c])) if (v.deleted && new Date(v.updatedAt).getTime() < limit) delete db[c][id];
}

export const S = {
  db: normalizeDb(lsGet(LS_DB)),
  jobs: { generatedAt: null, sources: {}, jobs: [] },
  sync: { state: 'local', msg: '', lastSync: null },
  ready: false,
};

const listeners = new Set();
export const on = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = kind => listeners.forEach(f => { try { f(kind); } catch (e) { console.error(e); } });

function persist() { lsSet(LS_DB, S.db); }
const pushSoon = debounce(() => push().catch(() => {}), 1500);

function changed() { persist(); emit('db'); if (dbx.isConnected()) pushSoon(); }

export const list = coll => Object.values(S.db[coll]).filter(x => !x.deleted);
export const get = (coll, id) => { const x = S.db[coll][id]; return x && !x.deleted ? x : null; };
export function put(coll, item) {
  if (!item.id) throw new Error('Eintrag ohne ID');
  S.db[coll][item.id] = { ...item, updatedAt: nowIso(), deleted: undefined };
  changed();
  return S.db[coll][item.id];
}
export function del(coll, id) {
  S.db[coll][id] = { id, deleted: true, updatedAt: nowIso() };
  changed();
}
export function setSettings(patch) {
  S.db.settings = { ...S.db.settings, ...patch, updatedAt: nowIso() };
  changed();
}
export function replaceAll(db) { S.db = normalizeDb(db); changed(); }
export const settings = () => S.db.settings;

// ---- Seed: mitgelieferte Arbeitgeberliste (aus deiner Jobsuche.xlsx, URLs aktualisiert) ----
export async function seedEmployers() {
  try {
    const r = await fetch('data/seed-employers.json', { cache: 'no-cache' });
    if (!r.ok) return 0;
    const seed = await r.json();
    let n = 0;
    for (const e of seed) {
      if (S.db.employers[e.id]) continue;
      S.db.employers[e.id] = { ...e, seed: true, updatedAt: SEED_TS };
      n++;
    }
    if (n) { persist(); emit('db'); }
    return n;
  } catch { return 0; }
}

// ---- Abgleich mit Dropbox ----
const setSync = (state, msg = '') => { S.sync = { ...S.sync, state, msg, ...(state === 'ok' ? { lastSync: nowIso() } : {}) }; emit('sync'); };
let remoteRev = null;
let pulling = null;

export function pull() {
  if (!dbx.isConnected()) return Promise.resolve();
  if (pulling) return pulling;
  pulling = (async () => {
    setSync('syncing');
    try {
      const r = await dbx.download(dbx.ROOT + '/db.json');
      if (r) {
        remoteRev = r.rev;
        const remote = normalizeDb(JSON.parse(r.data));
        const merged = mergeDb(S.db, remote);
        const differs = JSON.stringify(merged) !== JSON.stringify(S.db);
        S.db = merged; persist();
        if (differs) emit('db');
        // Wenn lokal Neueres existiert → hochladen
        if (JSON.stringify(merged) !== JSON.stringify(remote)) pushSoon();
      } else {
        remoteRev = null; pushSoon();
      }
      await pullJobs();
      setSync('ok');
    } catch (e) { setSync('error', e.message); throw e; }
    finally { pulling = null; }
  })();
  return pulling;
}

export async function pullJobs() {
  if (!dbx.isConnected()) return;
  const j = await dbx.download(dbx.ROOT + '/jobs.json');
  if (j) {
    try {
      const data = JSON.parse(j.data);
      if (!S.jobs.generatedAt || data.generatedAt !== S.jobs.generatedAt) { S.jobs = data; idb.set('jobs', data); emit('jobs'); }
    } catch { /* kaputte Datei ignorieren */ }
  }
}

export async function loadCachedJobs() {
  const j = await idb.get('jobs');
  if (j?.jobs) { S.jobs = j; emit('jobs'); }
}

export async function push(retry = true) {
  if (!dbx.isConnected()) return;
  try {
    setSync('syncing');
    purgeTombstones(S.db);
    await dbx.ensureFolder(dbx.ROOT);
    const res = await dbx.upload(dbx.ROOT + '/db.json', JSON.stringify(S.db), { rev: remoteRev });
    remoteRev = res.rev;
    setSync('ok');
  } catch (e) {
    if (e.conflict && retry) { remoteRev = null; await pull(); return push(false); }
    setSync('error', e.message); throw e;
  }
}

export async function flush() { pushSoon.cancel(); return push(); }

// Beim Zurückkehren zur App (z. B. vom Handy-Sperrbildschirm) neu abgleichen
document.addEventListener('visibilitychange', () => { if (!document.hidden && dbx.isConnected()) pull().catch(() => {}); });
window.addEventListener('online', () => { if (dbx.isConnected()) pull().catch(() => {}); });
