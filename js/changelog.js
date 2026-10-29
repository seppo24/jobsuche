// Versionsverlauf – wird in der App unter „Info“ angezeigt.
// Bei jeder Änderung: neuen Eintrag OBEN einfügen, VERSION erhöhen und in sw.js die CACHE-Version anpassen.

export const VERSION = '1.0.3';

export const CHANGELOG = [
  {
    version: '1.0.3',
    date: '2026-10-29',
    title: 'Geänderte Adresse',
    items: [
      'Wird die Adresse einer Karriereseite geändert, zeigt die App das alte Testergebnis nicht mehr als aktuell: Es erscheint „Adresse geändert – noch nicht neu geprüft“ samt Hinweis, wie die neue Adresse sofort geprüft wird.',
      'Die Alt-Vorschläge („gefundene Adressen“) der geänderten Quelle werden ausgeblendet; im Filter „Prüfen“ taucht die Quelle bis zur neuen Prüfung auf.',
    ],
  },
  {
    version: '1.0.2',
    date: '2026-10-29',
    title: 'Updates greifen sofort',
    items: [
      'Behoben: Nach „Jetzt aktualisieren“ blieb die alte Version sichtbar, weil veraltete Dateien aus dem Zwischenspeicher geladen wurden.',
    ],
  },
  {
    version: '1.0.1',
    date: '2026-10-29',
    title: 'Installation auf dem Handy',
    items: [
      'Eigene App-Kennung, damit Android die Jobsuche nicht mit anderen Apps desselben GitHub-Kontos verwechselt.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-29',
    title: 'Erste Version',
    items: [
      'Stellensuche über alle Arbeitgeber oder einzeln, mit ähnlichen Berufsbezeichnungen (z. B. Projektleiter = Projektmanager).',
      'Arbeitgeber- und Portalverwaltung inkl. Quellen-Test (Ampel, Stichprobe, Methode).',
      'Bewerbungsverlauf mit Zeitleiste, Nachfass-Erinnerung nach 6–8 Wochen und Statistik.',
      'Dokumentenverwaltung in der Dropbox; Anpassungshelfer für Lebenslauf, Anschreiben und Motivationsschreiben.',
      'Import deiner Excel-Dateien „Jobsuche.xlsx“ und „Jobsuche_Status.xlsx“.',
      'Daten liegen in deiner Dropbox (Ordner „Jobsuche“); Abgleich zwischen Handy und Laptop.',
      'Automatischer Stellenabruf täglich über GitHub Actions; BA-Jobbörse als offizielle Schnittstelle, Suchlinks für Stepstone, LinkedIn, Indeed, XING.',
    ],
  },
];
