// Import der bisherigen Excel-Dateien (Jobsuche.xlsx = Arbeitgeberliste, Jobsuche_Status.xlsx = Bewerbungen).
// Reine Logik: JSZip wird als Parameter übergeben (Browser: window.JSZip).
import { norm } from './search.js';
import { readXlsxRows } from './xlsxread.js';

const LEGAL = /\b(gmbh|ag|kg|se|co|mbh|ohg|inc|ltd|group|gruppe|deutschland|germany|international|holding|und|u)\b/g;
export const nameKey = s => norm(s).replace(LEGAL, ' ').replace(/\(\d+\)/g, ' ').replace(/\s+/g, ' ').trim();
const slug = s => norm(s).replace(/\s+/g, '-').slice(0, 24);

const sheetRows = (JSZip, buf) => readXlsxRows(JSZip, buf);

function serialToIso(v) {
  if (typeof v === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = String(v || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

// ---------- Arbeitgeberliste ----------
export async function parseEmployerSheet(JSZip, buf) {
  const rows = await sheetRows(JSZip, buf);
  const hi = rows.findIndex(r => r && String(r[0] || '').trim().toLowerCase() === 'firma');
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    if (!r || !r[0] || !r[1]) continue;
    const url = String(r[1]).trim();
    out.push({ name: String(r[0]).trim(), url, distanceKm: typeof r[2] === 'number' ? r[2] : null });
  }
  return out;
}

/** Vergleicht Import mit vorhandenen Arbeitgebern; liefert {neu, vorhanden, geaendert}. */
export function planEmployerImport(rows, employers) {
  const byKey = new Map(employers.map(e => [nameKey(e.name), e]));
  const neu = [], geaendert = [], vorhanden = [];
  for (const r of rows) {
    const e = byKey.get(nameKey(r.name));
    if (!e) neu.push(r);
    else if (e.url !== r.url && e.oldUrl !== r.url) geaendert.push({ employer: e, row: r });
    else vorhanden.push(e);
  }
  return { neu, geaendert, vorhanden };
}

// ---------- Bewerbungen ----------
const TYPE_RULES = [
  ['absage', /absage|abgesagt|besetzt|abgelehnt|entschieden\b|nicht (mehr )?zu besetzen|nuancen|besser (zu|entsprochen)|sachgründen|berufserfahrung hat/i],
  ['interview', /vorstellungsgespr|interview|gespräch am|gespraech am/i],
  ['nachfrage', /nachfrage|nachgefragt|nachfragen|nachgehakt/i],
  ['telefonat', /telefon|angerufen|anruf/i],
  ['rueckmeldung', /zwischenbescheid|eingangsbest|rückmeldung|rueckmeldung|antwort|geduld|auswahl dauert|1\. auswahl|vorgemerkt/i],
];
function classify(text) {
  const head = text.replace(/^\s*(?:e-?mail|telefon\w*|tel\.?)?\s*(?:\d{1,2}\.\s?\d{1,2}\.?(?:\d{2,4})?\s*:?)?\s*/i, '');
  if (/^absage|^abgesagt/i.test(head)) return 'absage';
  if (/^nachfrage|^nachgefragt/i.test(head)) return 'nachfrage';
  for (const [t, re] of TYPE_RULES) if (re.test(text)) return t;
  return 'notiz';
}

/** Zerlegt die Spalte „Anmerkungen“ in Ereignisse mit Datum (soweit erkennbar). */
export function parseNotes(note, appliedIso) {
  if (!note) return [];
  const base = new Date(appliedIso + 'T00:00:00Z');
  let last = base;
  const evs = [];
  // an Semikolons/Zeilenumbrüchen trennen und zusätzlich dort, wo ein neues „dd.mm.:“ beginnt
  const raw = String(note).split(/;\s*|\n+/).flatMap(p => p.split(/[,\s]\s*(?=(?:e-?mail\s+|telefon\w*\s+)?\d{1,2}\.\s?\d{1,2}\.?(?:\d{2,4})?\s*:)|,\s*(?=\d{1,2}\.\d{1,2}\.\d{4}\b)/i));
  const pieces = [];
  for (let i = 0; i < raw.length; i++) {          // „Email“ / „Telefon“ gehört zum folgenden Teil
    const p = (raw[i] || '').trim();
    if (/^(e-?mail|telefon\w*|tel\.?)$/i.test(p) && raw[i + 1]) raw[i + 1] = p + ' ' + raw[i + 1];
    else pieces.push(p);
  }
  for (const seg of pieces.map(s => s.trim().replace(/^,\s*/, '')).filter(Boolean)) {
    const m = seg.match(/(\d{1,2})\.\s?(\d{1,2})\.?(\d{2,4})?/);
    let date = '';
    if (m && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12) {
      let y = m[3] ? +m[3] : last.getUTCFullYear();
      if (y < 100) y += 2000;
      let d = new Date(Date.UTC(y, +m[2] - 1, +m[1]));
      if (!m[3] && d < last) d = new Date(Date.UTC(y + 1, +m[2] - 1, +m[1]));
      date = d.toISOString().slice(0, 10);
      if (d > last) last = d;
    }
    evs.push({ date, type: classify(seg), text: seg });
  }
  return evs;
}

export async function parseStatusSheet(JSZip, buf) {
  const rows = await sheetRows(JSZip, buf);
  const hi = rows.findIndex(r => r && String(r[0] || '').trim() === 'Datum' && String(r[1] || '').trim() === 'Firma');
  if (hi < 0) throw new Error('Spaltenüberschriften „Datum“ und „Firma“ nicht gefunden – ist das die Datei „Jobsuche_Status.xlsx“?');
  const out = [];
  const used = new Set();
  for (const r of rows.slice(hi + 1)) {
    const iso = serialToIso(r?.[0]);
    if (!iso || !r[1]) continue;
    const flag = i => r[i] === 1 || r[i] === true || String(r[i]).trim() === '1';
    const company = String(r[1]).trim();
    const title = String(r[2] || '').trim();
    const f = { gesendet: flag(3), rueckmeldung: flag(4), absage: flag(5), nachfrageStand: flag(6), nachfrageAbsage: flag(7), interview: flag(8) };
    const note = r[9] ? String(r[9]).trim() : '';

    const events = [{ date: iso, type: 'gesendet', text: 'Bewerbung abgeschickt' }, ...parseNotes(note, iso)];
    const has = t => events.some(e => e.type === t);
    const lastDate = events.reduce((a, e) => (e.date > a ? e.date : a), iso);
    const add = (type, text) => events.push({ date: '', type, text, fromFlag: true });
    if (f.rueckmeldung && !has('rueckmeldung') && !has('interview') && !has('absage')) add('rueckmeldung', 'Rückmeldung erhalten (laut Excel)');
    if (f.interview && !has('interview')) add('interview', 'Vorstellungsgespräch (laut Excel)');
    if ((f.nachfrageStand || f.nachfrageAbsage) && !has('nachfrage')) add('nachfrage', f.nachfrageAbsage ? 'Nachfrage nach Absage (laut Excel)' : 'Nachfrage zum Stand (laut Excel)');
    if (f.absage && !has('absage')) add('absage', 'Absage (laut Excel)');
    // chronologisch; undatierte Excel-Markierungen ans Ende
    events.sort((a, b) => (a.date || '9999') < (b.date || '9999') ? -1 : (a.date || '9999') > (b.date || '9999') ? 1 : 0);

    let status = 'gesendet';
    if (f.rueckmeldung || has('rueckmeldung')) status = 'rueckmeldung';
    if (f.interview || has('interview')) status = 'interview';
    if (f.absage || has('absage')) status = 'absage';

    let id = `imp-${iso.replace(/-/g, '')}-${slug(company)}-${slug(title).slice(0, 12)}`;
    while (used.has(id)) id += 'x';
    used.add(id);
    out.push({ id, company, title, appliedAt: iso, status, events, notes: note, source: 'Excel-Import', archive: '2020/21', flags: f });
  }
  return out;
}

/** Ordnet Bewerbungen den vorhandenen Arbeitgebern zu (eindeutige Treffer). */
export function matchEmployer(company, employers) {
  const k = nameKey(company);
  if (!k) return null;
  const exact = employers.filter(e => nameKey(e.name) === k);
  if (exact.length === 1) return exact[0];
  const first = k.split(' ')[0];
  if (first.length < 4) return null;
  const cands = employers.filter(e => nameKey(e.name).split(' ')[0] === first);
  return cands.length === 1 && nameKey(company).split(' ').length <= 2 ? cands[0] : null;
}
