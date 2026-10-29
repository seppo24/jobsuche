// Unterlagen: Textauszug aus .docx, .docx erzeugen, Anforderungsanalyse, Anpassung per KI (optional).
import { norm } from './search.js';

const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- .docx lesen ----------
export async function docxToText(JSZip, buf) {
  const zip = await JSZip.loadAsync(buf);
  const f = zip.file('word/document.xml');
  if (!f) throw new Error('Keine gültige Word-Datei.');
  const xml = await f.async('string');
  const un = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const paras = [];
  for (const p of xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    let line = '';
    for (const m of p[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g)) line += m[1] !== undefined ? un(m[1]) : (m[0].startsWith('<w:tab') ? '\t' : '\n');
    paras.push(line);
  }
  return paras.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- .docx schreiben ----------
/** Einfaches Markup: "# Überschrift", "## Zwischenüberschrift", "- Aufzählung", sonst Absatz; Leerzeile = Absatzwechsel. */
export async function textToDocx(JSZip, text, { font = 'Calibri', size = 22 } = {}) {
  const run = (t, o = {}) => `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
  const para = (inner, o = {}) => `<w:p><w:pPr><w:spacing w:after="${o.after ?? 120}" w:line="264" w:lineRule="auto"/>${o.ind ? `<w:ind w:left="${o.ind}" w:hanging="260"/>` : ''}</w:pPr>${inner}</w:p>`;
  const body = [];
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { body.push(para('', { after: 60 })); continue; }
    if (/^##\s+/.test(line)) body.push(para(run(line.replace(/^##\s+/, ''), { b: 1, sz: size + 2 }), { after: 80 }));
    else if (/^#\s+/.test(line)) body.push(para(run(line.replace(/^#\s+/, ''), { b: 1, sz: size + 8 }), { after: 160 }));
    else if (/^[-•*]\s+/.test(line)) body.push(para(run('•  ' + line.replace(/^[-•*]\s+/, '')), { ind: 360, after: 40 }));
    else {
      const parts = line.split('\t');
      body.push(para(parts.map((p, i) => (i ? '<w:r><w:tab/></w:r>' : '') + run(p)).join('')));
    }
  }
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1247" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/><w:sz w:val="${size}"/><w:lang w:val="de-DE"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('word/document.xml', doc);
  zip.file('word/styles.xml', styles);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// ---------- Anforderungsanalyse (lokal, ohne KI) ----------
const SKILLS = [
  'Projektmanagement', 'Projektleitung', 'Scrum', 'Agile', 'Kanban', 'Lean', 'Six Sigma', 'PMP', 'Prince2', 'IPMA', 'MS Project', 'Budgetverantwortung', 'Budget', 'Lieferanten', 'Change Management',
  'Risikomanagement', 'Stakeholder', 'Reporting', 'Controlling', 'Terminplanung', 'Kostenplanung', 'Verhandlung', 'Führungserfahrung', 'Personalverantwortung', 'Disziplinarische Führung', 'Teamführung',
  'SAP', 'PLM', 'Teamcenter', 'Windchill', 'CATIA', 'Creo', 'SolidWorks', 'Siemens NX', 'Inventor', 'AutoCAD', 'Excel', 'Jira', 'Confluence',
  'FMEA', 'Lastenheft', 'Pflichtenheft', 'APQP', 'PPAP', 'ISO 9001', 'IATF', 'KVP', 'V-Modell', 'Wasserfall', 'Stage-Gate',
  'Maschinenbau', 'Anlagenbau', 'Sondermaschinenbau', 'Automatisierung', 'SPS', 'Mechatronik', 'Elektrotechnik', 'Hydraulik', 'Pneumatik', 'Konstruktion', 'Entwicklung', 'Inbetriebnahme', 'Produktion', 'Fertigung', 'Serienentwicklung', 'Maschinenrichtlinie', 'CE-Kennzeichnung', 'Normen',
  'Englisch', 'Kundenkontakt', 'Kundenprojekte', 'Reisebereitschaft', 'Digitalisierung', 'Industrie 4.0', 'Nachhaltigkeit', 'Energie', 'Wasserstoff', 'Medizintechnik', 'Bahn', 'Luftfahrt',
];
const STOP = new Set(['sie', 'ihre', 'ihr', 'ihrer', 'wir', 'unser', 'unsere', 'unserem', 'bewerbung', 'bewerben', 'unternehmen', 'team', 'mitarbeiter', 'aufgaben', 'profil', 'erfahrung', 'erfahrungen', 'kenntnisse', 'wir bieten', 'bieten', 'stelle', 'stellen', 'position', 'bereich', 'arbeit', 'arbeiten', 'zusammenarbeit', 'sowie', 'oder', 'und', 'der', 'die', 'das', 'mit', 'bei', 'fuer', 'von', 'als', 'auch', 'ein', 'eine', 'einen', 'einem', 'ihnen', 'deine', 'dein', 'dich', 'dir', 'uns', 'gute', 'guter', 'hohe', 'hoher', 'sehr', 'viele', 'neue', 'neuen', 'moeglichkeit', 'moeglichkeiten', 'jahre', 'jahren', 'bitte', 'angebot', 'kontakt', 'gehalt', 'vollzeit', 'teilzeit', 'standort', 'verantwortung', 'abgeschlossenes', 'studium', 'ausbildung', 'weiterbildung', 'flexible', 'flexibel', 'zukunft', 'zukunftssicher', 'attraktive', 'attraktives', 'unbefristete', 'unbefristeten', 'vertrag', 'urlaub', 'tage', 'arbeitszeit', 'arbeitszeiten']);

/** Liefert Schlüsselbegriffe der Stellenbeschreibung und prüft, ob sie im Lebenslauf vorkommen. */
export function analyzeRequirements(jobText, cvText = '') {
  const jt = String(jobText || '');
  const nj = norm(jt), nc = norm(cvText);
  const found = new Map();
  for (const s of SKILLS) {
    const n = norm(s);
    const re = new RegExp('(^|[^a-z0-9])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)');
    if (re.test(nj)) found.set(s, (nj.split(n).length - 1));
  }
  // Großgeschriebene Fachwörter (deutsche Substantive)
  const freq = new Map();
  for (const m of jt.matchAll(/\b[A-ZÄÖÜ][a-zäöüß]{5,}\b/g)) {
    const w = m[0], n = norm(w);
    if (STOP.has(n) || [...found.keys()].some(k => norm(k) === n)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const extra = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  const all = [...found.entries()].map(([k, c]) => ({ term: k, count: c, kind: 'skill' })).concat(extra.map(([k, c]) => ({ term: k, count: c, kind: 'wort' })));
  const hasCv = nc.length > 20;
  return all.map(x => ({ ...x, inCv: hasCv ? nc.includes(norm(x.term)) : null }));
}

// ---------- Vorlagen ----------
export function fillTemplate(text, vars) {
  return String(text || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== '' ? vars[k] : m));
}

export const DEFAULT_LETTER = `{{Name}}
{{Adresse}}

{{Firma}}
{{Ansprechpartner}}

{{Ort}}, {{Datum}}

Bewerbung als {{Stelle}}

{{Anrede}}

[Einstieg: Warum diese Stelle, warum dieses Unternehmen – ein bis zwei Sätze mit Bezug auf die Anzeige.]

[Kern: Zwei bis drei Erfahrungen aus Ihrer Projektleitung, die zu den Anforderungen passen – mit Zahlen (Budget, Teamgröße, Projektdauer).]

[Abschluss: Verfügbarkeit, Gehaltsvorstellung falls verlangt, Gesprächswunsch.]

Mit freundlichen Grüßen

{{Name}}`;

// ---------- KI (optional) ----------
export function buildTailorPrompt({ jobTitle, company, jobText, cvText, letterTemplate, motivationTemplate, want, profile, note }) {
  const system = [
    'Du bist ein erfahrener Karriereberater für technische Fach- und Führungskräfte im deutschsprachigen Raum.',
    'Du passt Bewerbungsunterlagen an eine konkrete Stelle an.',
    'Wichtige Regeln:',
    '- Erfinde NIEMALS Erfahrungen, Abschlüsse, Zahlen, Tools oder Arbeitgeber. Verwende ausschließlich Fakten aus dem bereitgestellten Lebenslauf.',
    '- Wenn eine geforderte Qualifikation im Lebenslauf nicht belegt ist, nenne sie im Abschnitt HINWEISE als Lücke – schreibe sie nicht in die Unterlagen.',
    '- Beim Lebenslauf: Reihenfolge, Gewichtung und Formulierungen der Stichpunkte an die Anzeige anpassen (relevante Stationen zuerst bzw. ausführlicher, Schlüsselbegriffe der Anzeige übernehmen, wo sie zutreffen). Keine neuen Stationen.',
    '- Sprache: Deutsch, sachlich, konkret, ohne Floskeln. Anschreiben maximal eine Seite.',
    '- Gliedere die Antwort EXAKT mit diesen Überschriften, jeweils in einer eigenen Zeile: ### LEBENSLAUF, ### ANSCHREIBEN, ### MOTIVATIONSSCHREIBEN, ### HINWEISE (nur die gewünschten Abschnitte; HINWEISE immer).',
    '- Verwende im Text einfache Markierungen: "# " Titel, "## " Zwischenüberschrift, "- " Aufzählung.',
  ].join('\n');
  const parts = [];
  parts.push(`STELLE: ${jobTitle || '(unbekannt)'} bei ${company || '(unbekannt)'}`);
  parts.push(`\nSTELLENBESCHREIBUNG:\n${jobText || '(nicht vorhanden – nutze nur Titel und Firma und weise darauf hin)'}`);
  parts.push(`\nLEBENSLAUF (Stammfassung):\n${cvText || '(nicht vorhanden)'}`);
  if (want.letter) parts.push(`\nVORLAGE/STIL ANSCHREIBEN (falls vorhanden):\n${letterTemplate || '(keine)'}`);
  if (want.motivation) parts.push(`\nVORLAGE/STIL MOTIVATIONSSCHREIBEN (falls vorhanden):\n${motivationTemplate || '(keine)'}`);
  if (profile?.name) parts.push(`\nABSENDER: ${profile.name}${profile.address ? ', ' + profile.address : ''}${profile.ort ? ' (' + profile.ort + ')' : ''}`);
  if (note) parts.push(`\nZUSÄTZLICHER HINWEIS DES BEWERBERS: ${note}`);
  const wanted = [want.cv && 'LEBENSLAUF (angepasste Fassung)', want.letter && 'ANSCHREIBEN', want.motivation && 'MOTIVATIONSSCHREIBEN'].filter(Boolean).join(', ');
  parts.push(`\nAUFGABE: Erstelle: ${wanted}. Dazu HINWEISE: (1) welche Anforderungen der Anzeige gut belegt sind, (2) welche Lücken bestehen, (3) was der Bewerber vor dem Absenden prüfen oder ergänzen sollte.`);
  return { system, user: parts.join('\n') };
}

export async function callClaude({ apiKey, model, system, user, maxTokens = 6000, signal }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Anthropic-API: HTTP ${r.status}`);
  return (j.content || []).map(c => c.text || '').join('');
}

export function parseSections(text) {
  const out = { cv: '', letter: '', motivation: '', notes: '' };
  const map = { LEBENSLAUF: 'cv', ANSCHREIBEN: 'letter', MOTIVATIONSSCHREIBEN: 'motivation', HINWEISE: 'notes' };
  const re = /^#{3}\s*(LEBENSLAUF|ANSCHREIBEN|MOTIVATIONSSCHREIBEN|HINWEISE)[^\n]*$/gm;
  const hits = [...text.matchAll(re)];
  if (!hits.length) { out.notes = text.trim(); return out; }
  hits.forEach((m, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].index : text.length;
    out[map[m[1]]] = text.slice(m.index + m[0].length, end).trim();
  });
  return out;
}
