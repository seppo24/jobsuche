// Tarifbindung aus dem Text einer Stellenanzeige erkennen. Nur ausdrückliche Hinweise der Anzeige zählen.
const RULES = [
  [/IG[\s-]?Metall|Metall-?\s*(und|&)\s*Elektro|M\s?\+\s?E[-\s]?Tarif|Tarifvertrag der Metall|Metalltarif/i, 'IG Metall (Metall- und Elektroindustrie)'],
  [/IG[\s-]?BCE|Chemietarif|Tarif(vertrag)? der chemischen Industrie|BAVC/i, 'IG BCE (Chemie)'],
  [/\bTVöD\b|\bTV-?L\b|\bTV-?V\b|Tarifvertrag für den öffentlichen Dienst|\bAVR\b/i, 'TVöD/TV-L (öffentlicher Dienst)'],
  [/Haustarif|Firmentarif|Unternehmenstarif/i, 'Haustarif'],
  [/(nach|gemäß|gemaess|entsprechend)\s+(dem\s+)?Tarif|tarifvertraglich\w*|tarifgebunden|Tarifbindung|Tarifvertrag/i, 'Tarifvertrag (nicht näher benannt)'],
];
export function scanTarif(text) {
  const t = String(text || '');
  for (const [rx, name] of RULES) {
    const m = rx.exec(t); if (!m) continue;
    const ctx = t.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60).replace(/\s+/g, ' ').trim();
    const eg = (t.match(/\bEntgeltgruppe\s*(\d{1,2})\b|\bEG\s?(\d{1,2})\b/i) || []);
    return { name, eg: eg[1] || eg[2] || '', evidence: ctx };
  }
  return null;
}
