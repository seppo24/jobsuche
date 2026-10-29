// Stellensuche mit Synonymen / ähnlichen Berufsbezeichnungen.
// Reine Logik ohne DOM – wird auch in den Tests unter crawler/test genutzt.

/** Vereinfachte Schreibweise: klein, ohne Umlaute/Akzente, ohne (m/w/d)-Zusätze. */
export function norm(s) {
  let t = String(s ?? '').toLowerCase();
  t = t.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  t = t.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  // Geschlechtszusätze: (m/w/d), (w/m/x), m|w|d, (all genders), (gn), *in, :in, /in
  t = t.replace(/\(?\b[mwdfxi]\s*[\/|\\-]\s*[mwdfxi](\s*[\/|\\-]\s*[mwdfxi])?\b\)?/g, ' ');
  t = t.replace(/\(\s*(all|alle)\s+genders?\s*\)/g, ' ').replace(/\(\s*gn\s*\)/g, ' ');
  t = t.replace(/[*:_\/]in(nen)?\b/g, '');
  t = t.replace(/[^a-z0-9+#.]+/g, ' ').replace(/\.(?=\s|$)/g, '');
  return t.replace(/\s+/g, ' ').trim();
}

/** Standard-Gruppen. strong = gleichwertig, related = verwandt. Begriffe sind Wortstämme (normalisiert). */
export const DEFAULT_SYNONYMS = [
  { name: 'Projektleitung',
    strong: ['projektleit', 'projektmanag', 'project manag', 'projektverantwort', 'projektkoordin', 'project lead', 'projektsteuer', 'programmleit', 'programmmanag', 'program manag', 'technischer projektleiter'],
    related: ['projektingenieur', 'project engineer', 'projektplan', 'pmo', 'projektabwicklung'] },
  { name: 'Teamleitung',
    strong: ['teamleit', 'team leit', 'teamlead', 'team lead', 'team leader', 'gruppenleit', 'abteilungsleit', 'bereichsleit', 'fachbereichsleit', 'head of', 'leiter team', 'leiterin team'],
    related: ['leiter', 'leitung', 'manager entwicklung', 'engineering manager'] },
  { name: 'Konstruktion / Entwicklung',
    strong: ['konstrukteur', 'konstruktionsingenieur', 'design engineer', 'entwicklungsingenieur', 'produktentwickl', 'mechanical design', 'development engineer'],
    related: ['cad', 'produktdesigner', 'konstruktion', 'r&d engineer', 'entwickler'] },
  { name: 'Produktmanagement',
    strong: ['produktmanag', 'product manag', 'product owner', 'produktverantwort'],
    related: ['produktmarketing', 'technical product'] },
  { name: 'Technischer Vertrieb',
    strong: ['vertriebsingenieur', 'technischer vertrieb', 'sales engineer', 'technical sales', 'anwendungstechnik'],
    related: ['key account', 'applikationsingenieur', 'application engineer'] },
  { name: 'Qualität',
    strong: ['qualitaetsingenieur', 'quality engineer', 'qualitaetsmanag', 'quality manag'],
    related: ['qualitaetssicher', 'qualitaetsplan', 'supplier quality'] },
  { name: 'Fertigung / Prozess',
    strong: ['fertigungsplan', 'arbeitsvorbereit', 'produktionsplan', 'industrial engineer', 'prozessingenieur', 'manufacturing engineer', 'fertigungsingenieur'],
    related: ['produktionsleit', 'fertigungsleit', 'lean', 'prozessoptimier'] },
  { name: 'Einkauf',
    strong: ['technischer einkaeufer', 'strategischer einkaeufer', 'projekteinkaeufer', 'einkaeufer', 'buyer'],
    related: ['beschaffung', 'supply chain', 'procurement'] },
];

/** Gruppen <-> Text (eine Zeile pro Gruppe:  Name: strong, strong | related, related) */
export function synonymsToText(groups) {
  return groups.map(g => `${g.name}: ${g.strong.join(', ')}${g.related?.length ? ' | ' + g.related.join(', ') : ''}`).join('\n');
}
export function synonymsFromText(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^\s*([^:]+):\s*(.*)$/);
    if (!m) continue;
    const [s, r = ''] = m[2].split('|');
    const list = x => x.split(',').map(v => norm(v)).filter(Boolean);
    out.push({ name: m[1].trim(), strong: list(s), related: list(r) });
  }
  return out;
}

function lev1(a, b) { // true, wenn Levenshtein-Distanz <= 1
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

/** Zerlegt eine Sucheingabe in Alternativen ("a, b" / "a oder b"). */
export function parseQuery(q) {
  return String(q || '').split(/,|;|\||\boder\b|\bor\b/i).map(norm).filter(Boolean);
}

/**
 * Prüft eine Stelle gegen die Suche.
 * Rückgabe: null (kein Treffer) oder { score, kind: 'exakt'|'aehnlich'|'verwandt'|'teilweise', via }
 */
export function matchTitle(title, phrases, groups = DEFAULT_SYNONYMS, useSimilar = true, extraText = '') {
  const t = norm(title);
  if (!phrases.length) return { score: 0, kind: 'alle', via: '' };
  let best = null;
  const take = (score, kind, via) => { if (!best || score > best.score) best = { score, kind, via }; };
  const tTokens = t.split(' ');
  for (const p of phrases) {
    if (t.includes(p)) { take(100, 'exakt', p); continue; }
    const tokens = p.split(' ').filter(x => x.length > 1);
    if (tokens.length && tokens.every(tok => t.includes(tok))) take(85, 'exakt', p);
    if (!useSimilar) continue;
    for (const g of groups) {
      const hit = g.strong.some(s => p.includes(s) || (p.length >= 5 && s.includes(p)));
      if (!hit) continue;
      for (const s of g.strong) if (t.includes(s)) take(70, 'aehnlich', labelFor(s, t));
      for (const s of (g.related || [])) {
        if (t.includes(s)) take(40, 'verwandt', labelFor(s, t));
      }
    }
    // unscharf: ein Wort ≥ 6 Zeichen mit Tippfehler
    for (const tok of tokens) if (tok.length >= 6) for (const w of tTokens) if (w.length >= 6 && w !== tok && lev1(tok, w)) take(30, 'teilweise', w);
  }
  if (!best && extraText && phrases.some(p => norm(extraText).includes(p))) take(20, 'teilweise', 'Beschreibung');
  return best;
}

/** Zeigt für die Anzeige das konkrete Wort im Titel, das den Treffer ausgelöst hat. */
function labelFor(stem, normTitle) {
  const words = normTitle.split(' ');
  const w = words.find(x => x.includes(stem.trim()));
  return w || stem.trim();
}

/** Ausschlusslogik: liefert den ersten gefundenen Ausschlussbegriff (oder null). */
export function excludedBy(job, terms, extra = '') {
  if (!terms?.length) return null;
  const hay = ' ' + norm(job.title + ' ' + (extra || '')) + ' ';
  for (const raw of terms) {
    const t = norm(raw);
    if (t && hay.includes(t)) return raw;
  }
  return null;
}

export const DEFAULT_EXCLUDE_STUDENT = ['praktikum', 'praktikant', 'werkstudent', 'abschlussarbeit', 'bachelorarbeit', 'masterarbeit', 'thesis', 'ausbildung', 'auszubildende', 'azubi', 'duales studium', 'dualer student', 'schueler', 'ferienjob', 'aushilfe', 'trainee programm'];
export const DEFAULT_EXCLUDE_DEFENCE = ['ruestung', 'verteidigung', 'defence', 'defense', 'waffen', 'munition', 'bundeswehr', 'militaer', 'military'];
