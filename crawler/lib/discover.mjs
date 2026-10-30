// Weitere Arbeitgeber im Umkreis finden: Bundesagentur-Jobsuche → Arbeitgeber mit offenen Stellen → Webseite, Beschreibung, Größe, Karriereseite.
import { nameTokens } from './adapters.mjs';
import { discoverCareerUrls } from './extract.mjs';

const API = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4';
const KEY = { 'X-API-Key': 'jobboerse-jobsuche' };
const AGENCY = /(zeitarbeit|personal(dienst|service|beratung|vermittlung|management)|arbeitnehmer(über|ueber)lassung|randstad|adecco|manpower|persona service|hays|gulp|brunel|ferchau|akka|bertrandt|expertum|dis ag|piening|tempton|orizon|aps |kelly|e-?personal|jobvermittlung|recruiting)/i;
const AGGREGATOR = /(arbeitsagentur|stepstone|indeed|linkedin|xing|kimeta|jobware|monster|meinestadt|stellenanzeigen|jobs\.de|jobscout|jooble|gigajob|careerjet|bewerbung\.net|google|facebook|kununu|wikipedia)/i;
const nrm = x => String(x || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();

export const stats = { requests: 0, failed: 0, lastStatus: '', lastError: '' };
async function jget(url, headers = {}, ms = 20000, asText = false) {
  stats.requests++;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/124.0', 'Accept-Language': 'de', ...headers }, signal: ctl.signal, redirect: 'follow' }); if (!r.ok) { stats.failed++; stats.lastStatus = 'HTTP ' + r.status; return null; } return asText ? await r.text() : await r.json(); } catch (e) { stats.failed++; stats.lastError = String(e.message || e).slice(0, 120); return null; } finally { clearTimeout(t); }
}

/** Größe aus Text („über 1.200 Mitarbeitende“) → Zahl oder null. */
export function employeesFrom(text) {
  const rx = /(?:über|rund|ca\.?|mehr als|etwa|ungefähr|more than|over|around)?\s*(\d{1,3}(?:[.\s]\d{3})+|\d{2,6})\s*(?:\+\s*)?(?:Mitarbeiter\w*|Beschäftigte\w*|Angestellte\w*|Kolleg\w*|employees|Mitarbeitende|Menschen arbeiten|Arbeitsplätze)/gi;
  let best = null;
  for (const m of String(text || '').matchAll(rx)) { const n = parseInt(m[1].replace(/[.\s]/g, ''), 10); if (n >= 5 && n <= 1000000 && (best === null || n > best)) best = n; }
  return best;
}
export const sizeLabel = n => n == null ? '' : n < 50 ? 'Kleinstunternehmen' : n < 250 ? 'kleines Unternehmen' : n < 1000 ? 'mittelständisch' : n < 10000 ? 'großes Unternehmen' : 'Konzern';

/** Sammelt Arbeitgeber mit offenen Stellen im Umkreis. Rückgabe: Liste nach Stellenzahl sortiert. */
export async function collectEmployers({ ort, radius, queries, maxPages = 3 }) {
  const map = new Map();
  for (const q of queries) {
    for (let page = 1; page <= maxPages; page++) {
      const j = await jget(`${API}/jobs?was=${encodeURIComponent(q)}&wo=${encodeURIComponent(ort)}&umkreis=${radius}&angebotsart=1&size=50&page=${page}`, KEY);
      const list = (j && j.stellenangebote) || [];
      for (const s of list) {
        const name = (s.arbeitgeber || '').trim(); if (!name) continue;
        const k = nameTokens(name).join(' '); if (!k) continue;
        const e = map.get(k) || { name, key: k, count: 0, titles: [], locations: new Set(), minKm: null, refnr: s.refnr, agency: AGENCY.test(name) };
        e.count++; if (e.titles.length < 4 && !e.titles.includes(s.titel)) e.titles.push(s.titel || s.beruf);
        const loc = s.arbeitsort || {}; if (loc.ort) e.locations.add(loc.ort);
        const km = loc.entfernung != null ? Math.round(parseFloat(String(loc.entfernung).replace(',', '.'))) : null;
        if (km != null && (e.minKm == null || km < e.minKm)) e.minKm = km;
        map.set(k, e);
      }
      if (list.length < 50) break;
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** Homepage aus der BA-Stellendetailseite (Feldnamen sind nicht garantiert – es wird defensiv gesucht). */
export async function homepageFor(refnr) {
  const d = await jget(`${API}/jobdetails/${Buffer.from(String(refnr)).toString('base64')}`, KEY);
  if (!d) return '';
  const urls = [];
  const walk = (o, key = '') => { if (typeof o === 'string') { if (/^https?:\/\//i.test(o) && /url|homepage|web|extern/i.test(key)) urls.push(o); } else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, k); };
  walk(d);
  for (const u of urls) { try { const h = new URL(u).hostname; if (!AGGREGATOR.test(h)) return new URL(u).origin; } catch { /* nächste */ } }
  return '';
}

async function profileOf(origin) {
  const html = await jget(origin, {}, 15000, true);
  if (!html) return { description: '', employees: null, title: '' };
  const meta = (n) => { const m = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${n}["'][^>]*content=["']([^"']+)["']`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${n}["']`, 'i')); return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim() : ''; };
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  return { description: (meta('description') || meta('og:description')).slice(0, 300), employees: employeesFrom(text), title: (html.match(/<title>([^<]+)<\/title>/i) || [])[1]?.trim() || '' };
}

export async function discoverEmployers({ context, ort, radius, queries, known = [], ignored = [], limit = 40, log = () => {} }) {
  const knownKeys = new Set(known.map(n => nameTokens(n).join(' ')).concat(ignored.map(n => nameTokens(n).join(' '))));
  const broad = ['Ingenieur', 'Techniker', 'Konstrukteur', 'Leiter', 'Maschinenbau', 'Servicetechniker', 'Elektroniker', 'Mechatroniker'];
  const all = await collectEmployers({ ort, radius, queries: [...new Set([...queries, ...broad])] });
  log(`Arbeitgeber mit offenen Stellen: ${all.length} (Anfragen ${stats.requests}, fehlgeschlagen ${stats.failed} ${stats.lastStatus} ${stats.lastError})`);
  const afterKnown = all.filter(e => !e.agency && !knownKeys.has(e.key));
  const fresh = afterKnown.slice(0, limit);
  const out = [];
  let i = 0;
  const worker = async () => {
    while (i < fresh.length) {
      const e = fresh[i++];
      let website = '', prof = { description: '', employees: null }, careerUrl = '';
      try {
        website = await homepageFor(e.refnr);
        if (website) {
          prof = await profileOf(website);
          const c = await Promise.race([discoverCareerUrls(context, website), new Promise(r => setTimeout(() => r([]), 40000))]);
          careerUrl = (c && c[0] && (c[0].url || c[0])) || '';
        }
      } catch { /* Teilergebnis genügt */ }
      out.push({ name: e.name, count: e.count, titles: e.titles, locations: [...e.locations].slice(0, 4), minKm: e.minKm, website, careerUrl, description: prof.description, employees: prof.employees, size: sizeLabel(prof.employees), tarifHint: null });
      log(`  ${e.name}: ${e.count} Stellen ${website ? '· ' + website : '· keine Webseite gefunden'}`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { generatedAt: new Date().toISOString(), ort, radius, total: all.length, skippedAgencies: all.filter(e => e.agency).length, skippedKnown: all.filter(e => !e.agency && knownKeys.has(e.key)).length, more: Math.max(0, afterKnown.length - fresh.length), requests: stats.requests, failed: stats.failed, error: stats.failed && !all.length ? (stats.lastStatus || stats.lastError || 'Anfrage fehlgeschlagen') : '', items: out.sort((a, b) => b.count - a.count) };
}
