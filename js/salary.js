// Grobe Gehaltsschätzung (Brutto pro Jahr, Vollzeit). Reine Marktspannen aus Erfahrungswerten – KEINE Angabe des Arbeitgebers.
// Basis: Stellenbezeichnung; Anpassung nach Seniorität, Region (PLZ), Tarifbindung und Unternehmensgröße.

const ROLES = [
  // [Muster, min, max, Bezeichnung]
  [/\b(ausbildung|auszubildende?r?|azubi)\b/i, 'monat', 1000, 1300, 'Ausbildungsvergütung'],
  [/\b(duales? studium|dualer? student)\b/i, 'monat', 1200, 1600, 'Dualstudium'],
  [/\b(werkstudent\w*|praktik\w*|abschlussarbeit|bachelorarbeit|masterarbeit|thesis)\b/i, 'monat', 1100, 1900, 'Studierende/Praktikum'],
  [/\b(geschäftsführ\w*|geschaeftsfuehr\w*|bereichsleit\w*|head of|director|direktor\w*|vp\b)/i, 'jahr', 100000, 150000, 'Bereichs-/Geschäftsleitung'],
  [/\b(abteilungsleit\w*|leiter\w*\s+\w*\s*(entwicklung|produktion|projekt\w*|technik|fertigung|konstruktion|service|einkauf|logistik))/i, 'jahr', 85000, 115000, 'Abteilungsleitung'],
  [/\b(team-?leit\w*|gruppenleit\w*|teamlead\w*|team lead|schichtleit\w*|werkstattleit\w*)/i, 'jahr', 68000, 90000, 'Teamleitung'],
  [/\b(projektleit\w*|projektmanag\w*|project manag\w*|bauleit\w*|programmleit\w*|programme? manag\w*)/i, 'jahr', 62000, 85000, 'Projektleitung'],
  [/\b(leiter\w*|leitung|manager\w*)/i, 'jahr', 72000, 98000, 'Leitungsfunktion'],
  [/\b(ingenieur\w*|engineer\w*|konstrukteur\w*|entwickler\w*|developer|inbetriebnahme\w*|vertriebsingenieur\w*)/i, 'jahr', 52000, 72000, 'Ingenieur/Entwicklung'],
  [/\b(einkäufer\w*|einkaeufer\w*|buyer|controller\w*|referent\w*|berater\w*|consultant\w*|analyst\w*)/i, 'jahr', 50000, 70000, 'Fachfunktion'],
  [/\b(techniker\w*|meister\w*|elektroniker\w*|mechatroniker\w*|servicetechniker\w*|monteur\w*)/i, 'jahr', 42000, 58000, 'Technik/Meister'],
  [/\b(sachbearbeit\w*|assistent\w*|disponent\w*|mitarbeiter\w*|kaufm\w*)/i, 'jahr', 38000, 52000, 'Sachbearbeitung'],
];

const fmtK = n => Math.round(n / 1000);
const fmt = n => n.toLocaleString('de-DE');

/** Liefert { text, basis, range } oder null, wenn die Stelle nicht einzuordnen ist. */
export function estimateSalary(job, employer) {
  const title = String(job?.title || '');
  const hit = ROLES.find(r => r[0].test(title));
  if (!hit) return null;
  let [, unit, lo, hi, label] = hit;
  const notes = [label];
  if (unit === 'jahr') {
    let f = 1;
    if (/\b(senior|leitend\w*|principal|lead|erfahren\w*)\b/i.test(title)) { f *= 1.1; notes.push('Senior-Stufe +10 %'); }
    if (/\b(junior|berufseinsteiger\w*|einsteiger\w*|trainee|nachwuchs\w*)\b/i.test(title)) { f *= 0.88; notes.push('Einstieg −12 %'); }
    const plz = (String(job?.location || '').match(/(?:^|\D)(\d{5})(?!\d)/) || [])[1];
    if (plz && /^[789]/.test(plz)) { f *= 1.05; notes.push('Süddeutschland +5 %'); }
    const tarif = employer?.tarif;
    if (tarif && /metall|bce|chemie/i.test(tarif.name || '')) { f *= 1.05; notes.push('Tarifbindung +5 %'); }
    const emps = employer?.employees;
    if (emps >= 5000) { f *= 1.06; notes.push('Großkonzern +6 %'); } else if (emps && emps < 200) { f *= 0.94; notes.push('Kleinbetrieb −6 %'); }
    const a = Math.round(lo * f / 1000) * 1000, b = Math.round(hi * f / 1000) * 1000;
    return { text: `≈ ${fmtK(a)}–${fmtK(b)} T€ / Jahr`, range: [a, b], basis: `Grobe Schätzung (Brutto, Vollzeit) auf Basis der Stellenbezeichnung: ${notes.join(', ')}. Keine Angabe des Arbeitgebers.` };
  }
  return { text: `≈ ${fmt(lo)}–${fmt(hi)} € / Monat`, range: [lo, hi], basis: `Grobe Schätzung (${label}). Keine Angabe des Arbeitgebers.` };
}

export const TARIFE = ['', 'IG Metall (Metall- und Elektroindustrie)', 'IG BCE (Chemie)', 'Haustarif', 'TVöD/TV-L (öffentlicher Dienst)', 'Sonstiger Tarifvertrag', 'Kein Tarifvertrag'];
