// Arbeitszeugnisse: ein gesammeltes PDF erkennen, nach Arbeitgeber/Jahr gliedern und in Einzel-PDFs teilen.
// Die Erkennung arbeitet auf dem Text der PDF-Seiten (nur Text-PDFs; Scans müssen von Hand eingeteilt werden).

const MONTHS = { januar: 1, jänner: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12 };
const KIND_RX = /(arbeitszeugnis|zwischenzeugnis|endzeugnis|dienstzeugnis|ausbildungszeugnis|praktikumszeugnis|qualifiziertes zeugnis|zeugnis)/i;
const COMPANY_RX = /\b(GmbH(?:\s*&\s*Co\.?\s*KG)?|AG|KG|SE|mbH|OHG|e\.\s?K\.|e\.\s?V\.|Inc\.?|Ltd\.?|S\.A\.|B\.V\.|N\.V\.|Group|Gruppe)\b/;

const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const lines = t => String(t || '').split('\n').map(clean).filter(Boolean);

/** Alle Datumsangaben { d, m, y, idx } in einem Text (31.03.2019 oder 31. März 2019). */
export function findDates(text) {
  const out = [];
  for (const m of String(text).matchAll(/(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*((?:19|20)\d{2})/g)) out.push({ d: +m[1], m: +m[2], y: +m[3], idx: m.index });
  for (const m of String(text).matchAll(/(\d{1,2})\s*\.\s*([A-Za-zäöüÄÖÜ]{3,9})\s+((?:19|20)\d{2})/g)) { const mo = MONTHS[m[2].toLowerCase()]; if (mo) out.push({ d: +m[1], m: mo, y: +m[3], idx: m.index }); }
  return out.sort((a, b) => a.idx - b.idx);
}

/** Beginnt auf dieser Seite ein neues Zeugnis? (Überschrift „…zeugnis“ in den ersten Zeilen) */
export function startsDocument(pageText) {
  return lines(pageText).slice(0, 14).some(l => l.length <= 70 && KIND_RX.test(l) && !/^(sehr|in diesem|das zeugnis|dieses)/i.test(l));
}

export function guessEmployer(text) {
  const ls = lines(text);
  const head = ls.slice(0, 20);
  const strip = l => l.replace(/\s*[|•·].*$/, '').replace(/^(firma|arbeitgeber)\s*:?\s*/i, '').trim();
  let c = head.find(l => COMPANY_RX.test(l) && !KIND_RX.test(l) && l.length <= 70);
  if (c) return strip(c).slice(0, 60);
  const m = String(text).match(/(?:bei der Firma|bei der|beim|in der Firma|bei dem Unternehmen|bei)\s+((?:[A-ZÄÖÜ][\wäöüß&.\-]+\s?){1,5}(?:GmbH|AG|KG|SE|mbH)?)/);
  if (m) return clean(m[1]).slice(0, 60);
  c = ls.find(l => COMPANY_RX.test(l) && !KIND_RX.test(l) && l.length <= 70);
  return c ? strip(c).slice(0, 60) : '';
}

/** Jahr des Zeugnisses: Ende der Beschäftigung („bis zum 31.03.2019“), sonst Ausstellungsdatum (letztes Datum). */
export function guessYear(text) {
  const t = String(text);
  const end = [...t.matchAll(/(?:bis(?:\s+zum)?|zum|endete|ausgeschieden|ausscheiden|verl(?:ie(?:ss|ß)|ä(?:sst|ßt)))[^.\d]{0,50}?((\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*((?:19|20)\d{2})|(\d{1,2})\s*\.\s*[A-Za-zäöüÄÖÜ]{3,9}\s+((?:19|20)\d{2}))/gi)];
  if (end.length) { const e = end[end.length - 1]; return { year: +(e[4] || e[6]), basis: 'Ende der Tätigkeit' }; }
  const ds = findDates(t); if (ds.length) return { year: ds[ds.length - 1].y, basis: 'Ausstellungsdatum' };
  return { year: null, basis: '' };
}

/** Teilt die Seitentexte in Zeugnisse. Rückgabe: Abschnitte nach Jahr absteigend (neueste zuerst). */
export function segment(pages) {
  const segs = [];
  pages.forEach((txt, i) => {
    if (!segs.length || startsDocument(txt)) segs.push({ from: i + 1, to: i + 1, texts: [txt] });
    else { const s = segs[segs.length - 1]; s.to = i + 1; s.texts.push(txt); }
  });
  const out = segs.map(s => {
    const full = s.texts.join('\n');
    const y = guessYear(full);
    const kind = (full.match(/zwischenzeugnis/i) ? 'Zwischenzeugnis' : 'Arbeitszeugnis');
    return { from: s.from, to: s.to, employer: guessEmployer(s.texts[0]) || guessEmployer(full), year: y.year, basis: y.basis, kind, hasText: full.replace(/\s+/g, '').length > 80 };
  });
  return sortSegments(out);
}
export const sortSegments = segs => [...segs].sort((a, b) => (b.year || 0) - (a.year || 0) || a.from - b.from);

export const segmentName = s => [s.year || 'ohne-Jahr', (s.employer || 'Arbeitgeber').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '_'), s.kind || 'Arbeitszeugnis'].join('_') + '.pdf';

// ---- Browser: PDF lesen und teilen ----
let pdfjs;
async function loadPdfJs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('../lib/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../lib/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}
function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = new URL('../lib/pdf-lib.min.js', import.meta.url).href; s.onload = () => res(window.PDFLib); s.onerror = () => rej(new Error('PDF-Bibliothek konnte nicht geladen werden')); document.head.appendChild(s); });
}

/** Text jeder Seite (Zeilen nach Position) */
export async function pageTexts(buf) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: buf.slice(0) }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    let line = '', y = null; const ls = [];
    for (const it of tc.items) {
      const yy = it.transform ? Math.round(it.transform[5]) : y;
      if (y !== null && Math.abs(yy - y) > 3) { ls.push(line); line = ''; }
      line += (line && !/\s$/.test(line) && it.str && !/^\s/.test(it.str) ? ' ' : '') + (it.str || ''); y = yy;
      if (it.hasEOL) { ls.push(line); line = ''; y = null; }
    }
    if (line) ls.push(line);
    out.push(ls.join('\n'));
  }
  return out;
}

/** PDF in Abschnitte teilen → [{name, bytes}] */
export async function splitPdf(buf, segs) {
  const { PDFDocument } = await loadPdfLib();
  const src = await PDFDocument.load(buf, { ignoreEncryption: true });
  const res = [];
  for (const s of segs) {
    const out = await PDFDocument.create();
    const idx = []; for (let i = s.from; i <= Math.min(s.to, src.getPageCount()); i++) idx.push(i - 1);
    (await out.copyPages(src, idx)).forEach(p => out.addPage(p));
    res.push({ seg: s, name: segmentName(s), bytes: await out.save() });
  }
  return res;
}

// ---- Bewertung des Zeugnisses (Notensystem 1–5) ----
export const NOTEN = [[1, 'sehr gut', 'stets zur vollsten Zufriedenheit'], [2, 'gut', 'stets zur vollen Zufriedenheit'], [3, 'befriedigend', 'zur vollen Zufriedenheit'], [4, 'ausreichend', 'zur Zufriedenheit'], [5, 'mangelhaft', 'hat sich bemüht / im Großen und Ganzen zur Zufriedenheit']];
export const noteText = n => n == null ? '' : n <= 1.5 ? 'sehr gut' : n <= 2.5 ? 'gut' : n <= 3.5 ? 'befriedigend' : n <= 4.5 ? 'ausreichend' : 'mangelhaft';

/** Grobe Note nur aus der Zufriedenheitsformel (ohne KI). null, wenn keine Formel gefunden wird. */
export function formulaGrade(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const z = '(?:zu|zur|zu\\s+unserer|zur)\\s*(?:unserer\\s+)?';
  const rules = [
    [new RegExp('stets\\s+(?:und\\s+in\\s+jeder\\s+Hinsicht\\s+)?' + z + '(?:vollsten|vollen\\s+und\\s+h[öo]chsten)\\s+Zufriedenheit|(?:stets|immer)\\s+in\\s+jeder\\s+Hinsicht\\s+' + z + 'vollsten', 'i'), 1, 'stets zur vollsten Zufriedenheit'],
    [new RegExp('stets\\s+' + z + '(?:vollen\\s+)?Zufriedenheit|' + z + 'vollsten\\s+Zufriedenheit', 'i'), 2, 'stets zur vollen Zufriedenheit'],
    [new RegExp('(?:im\\s+Gro(?:ß|ss)en\\s+und\\s+Ganzen|insgesamt)\\s+' + z + 'Zufriedenheit|hat\\s+sich\\s+(?:stets\\s+)?bem[üu]ht|war\\s+bem[üu]ht', 'i'), 5, 'im Großen und Ganzen zur Zufriedenheit / bemüht'],
    [new RegExp(z + 'vollen\\s+Zufriedenheit', 'i'), 3, 'zur vollen Zufriedenheit'],
    [new RegExp(z + 'Zufriedenheit', 'i'), 4, 'zur Zufriedenheit'],
  ];
  for (const [rx, n, formel] of rules) if (rx.test(t)) return { note: n, formel };
  return null;
}

export function analysisPrompt(text, employer) {
  const system = 'Du bist Experte für die Auswertung deutscher Arbeitszeugnisse (Zeugnissprache, Schulnotensystem 1 = sehr gut bis 5 = mangelhaft). Du bewertest ausschließlich, was im Text steht, erfindest nichts und nennst Unsicherheit offen. Antworte NUR mit einem JSON-Objekt, ohne Erklärtext davor oder danach.';
  const user = `Bewerte dieses Arbeitszeugnis${employer ? ' von „' + employer + '“' : ''}.

Fasse dich kurz: höchstens 6 Einzelnoten, 6 auffällige Formulierungen, je 4 Stärken/Schwächen, Zitate höchstens 15 Wörter. Liefere dieses JSON:
{
 "gesamtnote": Zahl von 1.0 bis 5.0 (eine Nachkommastelle),
 "einzelnoten": [ { "bereich": "Leistung/Arbeitserfolg" | "Arbeitsweise" | "Fachwissen" | "Führung (falls vorhanden)" | "Verhalten" | "Schlussformel", "note": Zahl, "beleg": "kurzes wörtliches Zitat" } ],
 "auffaelligkeiten": [ { "stelle": "wörtliches Zitat", "bedeutung": "was die Formulierung in der Zeugnissprache tatsächlich aussagt" } ],
 "fehlende_elemente": [ "z. B. fehlende Dankes-/Bedauernsformel, fehlende Führungsbeurteilung" ],
 "staerken": [ "…" ],
 "schwaechen": [ "…" ],
 "fazit": "2–3 Sätze, wie das Zeugnis insgesamt ausfällt und was es für Bewerbungen bedeutet",
 "sicherheit": "hoch" | "mittel" | "niedrig"
}

Zeugnistext:
"""
${String(text).slice(0, 14000)}
"""`;
  return { system, user };
}

/** JSON lesen; bei abgeschnittener Antwort (Längenlimit) werden offene Klammern geschlossen. */
export function lenientJson(text) {
  const start = String(text).indexOf('{'); if (start < 0) throw new Error('Antwort der KI nicht lesbar');
  let t = String(text).slice(start);
  try { return JSON.parse(t.slice(0, t.lastIndexOf('}') + 1)); } catch { /* reparieren */ }
  // abgeschnitten: bis zum letzten vollständigen Element kürzen und Klammern schließen
  for (let cut = t.length; cut > 0; cut = Math.max(t.lastIndexOf(',', cut - 1), -1) < 1 ? 0 : t.lastIndexOf(',', cut - 1)) {
    let c = t.slice(0, cut), inStr = false, esc = false; const st = [];
    for (const ch of c) { if (esc) { esc = false; continue; } if (ch === '\\') { esc = true; continue; } if (ch === '"') inStr = !inStr; if (inStr) continue; if (ch === '{' || ch === '[') st.push(ch); else if (ch === '}' || ch === ']') st.pop(); }
    if (inStr) continue;
    c = c.replace(/,\s*$/, '') + st.reverse().map(x => x === '{' ? '}' : ']').join('');
    try { return JSON.parse(c); } catch { /* weiter kürzen */ }
    if (!cut) break;
  }
  throw new Error('Antwort der KI nicht lesbar (zu lang abgeschnitten)');
}

export function parseAnalysis(raw) {
  const j = lenientJson(raw);
  const num = x => { const n = parseFloat(String(x).replace(',', '.')); return isFinite(n) ? Math.min(6, Math.max(1, Math.round(n * 10) / 10)) : null; };
  return {
    note: num(j.gesamtnote), einzel: (j.einzelnoten || []).map(e => ({ bereich: String(e.bereich || ''), note: num(e.note), beleg: String(e.beleg || '') })),
    auffaelligkeiten: (j.auffaelligkeiten || []).map(a => ({ stelle: String(a.stelle || ''), bedeutung: String(a.bedeutung || '') })),
    fehlend: (j.fehlende_elemente || []).map(String), staerken: (j.staerken || []).map(String), schwaechen: (j.schwaechen || []).map(String),
    fazit: String(j.fazit || ''), sicherheit: String(j.sicherheit || ''),
  };
}

/** Analyse erstellen: mit KI (wenn Zugang vorhanden), sonst nur Formel-Note. */
export async function analyzeZeugnis({ text, employer, apiKey, model, callClaude }) {
  const f = formulaGrade(text);
  const base = { at: new Date().toISOString(), formel: f ? f.formel : '', formelNote: f ? f.note : null };
  if (!apiKey || !callClaude) return { ...base, quelle: 'Formel', note: f ? f.note : null, einzel: [], auffaelligkeiten: [], fehlend: [], staerken: [], schwaechen: [], fazit: f ? `Nur anhand der Zufriedenheitsformel („${f.formel}“) eingeschätzt. Für eine ausführliche Bewertung einen KI-Zugang unter Info → Einstellungen hinterlegen.` : 'Keine Zufriedenheitsformel gefunden und kein KI-Zugang hinterlegt.', sicherheit: 'niedrig' };
  const { system, user } = analysisPrompt(text, employer);
  const raw = await callClaude({ apiKey, model, system, user, maxTokens: 8000 });
  return { ...base, ...parseAnalysis(raw), quelle: 'KI' };
}

/** Text eines Dokuments (PDF, Word) für die Analyse. */
export async function textOfFile(file, { docxToText } = {}) {
  const buf = await file.arrayBuffer();
  if (/\.pdf$/i.test(file.name)) return (await pageTexts(buf)).join('\n');
  if (/\.docx$/i.test(file.name) && docxToText) return docxToText(window.JSZip, buf);
  return '';
}

// ---- Scans: Seiten als Bilder an die KI geben und den Text abschreiben lassen ----
/** Seiten als JPEG (Base64) rendern. */
export async function renderPages(buf, { maxPx = 1500, quality = 0.78, from = 1, to = Infinity } = {}) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: buf.slice(0) }).promise;
  const out = [];
  for (let p = from; p <= Math.min(to, doc.numPages); p++) {
    const page = await doc.getPage(p);
    const v0 = page.getViewport({ scale: 1 });
    const scale = Math.min(3, maxPx / Math.max(v0.width, v0.height) * 1.0);
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    out.push(c.toDataURL('image/jpeg', quality).split(',')[1]);
  }
  return out;
}

export function parseOcr(raw, n) {
  const parts = String(raw).split(/={3}\s*SEITE\s+(\d+)\s*={3}/i);
  const res = Array(n).fill('');
  for (let i = 1; i < parts.length; i += 2) { const k = parseInt(parts[i], 10) - 1; if (k >= 0 && k < n) res[k] = (parts[i + 1] || '').trim(); }
  if (parts.length === 1 && n === 1) res[0] = String(raw).trim();
  return res;
}

/** Text aller Seiten eines Scans mit der KI erkennen (3 Seiten je Anfrage). */
export async function ocrPages({ buf, apiKey, model, callVision, onProgress = () => {}, batch = 3, total }) {
  const lib = await loadPdfJs();
  const n = total || (await lib.getDocument({ data: buf.slice(0) }).promise).numPages;
  const texts = [];
  for (let from = 1; from <= n; from += batch) {
    const to = Math.min(n, from + batch - 1);
    onProgress(from, n);
    const imgs = await renderPages(buf, { from, to });
    const content = [];
    imgs.forEach((data, i) => { content.push({ type: 'text', text: `Seite ${i + 1} von ${imgs.length} dieses Abschnitts:` }); content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }); });
    content.push({ type: 'text', text: `Schreibe den gesamten Text jeder Seite wortgetreu ab (deutsche Rechtschreibung des Originals, keine Zusammenfassung, nichts ergänzen oder korrigieren). Kennzeichne jede Seite mit einer eigenen Zeile "===SEITE k===" (k = 1 bis ${imgs.length}). Ist etwas unleserlich, schreibe [unleserlich].` });
    let raw, tries = 0;
    for (;;) { try { raw = await callVision({ apiKey, model, system: 'Du bist ein präzises OCR-System für deutsche Dokumente. Du gibst ausschließlich den abgeschriebenen Text aus.', content, maxTokens: 6000 }); break; } catch (e) { if (++tries >= 2) throw e; }
    }
    texts.push(...parseOcr(raw, imgs.length));
  }
  return texts;
}
