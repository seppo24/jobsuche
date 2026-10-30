// Versionsverlauf – wird in der App unter „Info“ angezeigt.
// Bei jeder Änderung: neuen Eintrag OBEN einfügen, VERSION erhöhen und in sw.js die CACHE-Version anpassen.

export const VERSION = '1.0.13';

export const CHANGELOG = [
  {
    version: '1.0.13',
    date: '2026-10-30',
    title: 'Meldung, wenn der Abruf fertig ist',
    items: [
      'Nach „Abruf jetzt starten“, „Test starten“ oder „Diesen Arbeitgeber neu abrufen“ erscheint oben ein Banner, sobald der Abruf abgeschlossen ist. Es bleibt, bis du „OK“ drückst – auch nach einem Neuladen der App.',
    ],
  },
  {
    version: '1.0.12',
    date: '2026-10-30',
    title: 'Einsatzort, Ausland, Ausblenden, weitere Listenformen',
    items: [
      'Ausgeblendete Stellen (Ausbildung/Studium, Rüstung, Automotive) sind jetzt standardmäßig sichtbar; in der Stellensuche gibt es dafür eigene „Ausblenden“-Schalter.',
      'Einsatzort wird bei Bedarf aus der Stellen-Detailseite gelesen (Pin-Symbol, Feld „Standort“, strukturierte Daten). Zufällige Wörter wie „Berufserfahrene“ werden nicht mehr als Ort übernommen.',
      'Stellen im Ausland (z. B. Niederlande) werden beim Umkreisfilter ausgeschlossen und mit „Ausland“ markiert. Neuer Schalter „Ort bekannt“.',
      'Neue Listenerkennung: Stellen als Überschriften-Karten (mit oder ohne Link), Akkordeons mit #-Links, Stellen als Überschriften im Fließtext.',
      'Jahreszahlen wie „2026“ werden nicht mehr als Stellenanzahl gewertet.'
    ],
  },
  {
    version: '1.0.11',
    date: '2026-10-29',
    title: 'Installationshilfe',
    items: [
      'Info → Einstellungen → „Installation auf dem Handy“: zeigt, ob der Browser die Installation anbietet, bietet einen Installieren-Knopf und nennt bei Problemen die wahrscheinlichen Ursachen.',
    ],
  },
  {
    version: '1.0.10',
    date: '2026-10-29',
    title: 'Einsatzort besser erkannt',
    items: [
      'Stellenlisten: Der Einsatzort wird aus mehr Schreibweisen gelesen (Klassen wie „location/standort/city“, „Standort: …“, PLZ + Ort, „DE-Köln“, einzelne Ortszeilen neben „Vollzeit“ usw.).',
      'Fehlt der Ort in der Liste, liest der Abruf ihn aus der Einzelseite der Stelle (strukturierte Daten oder „Einsatzort: …“), höchstens 60 Stellen je Lauf.',
      'Entfernung: Ortsangaben wie „Wuppertal, Nordrhein-Westfalen, Deutschland“, „Hybrid | Köln / Hagen“ oder „Hagen (DE)“ werden bereinigt; bei mehreren Orten zählt der nächste.',
    ],
  },
  {
    version: '1.0.9',
    date: '2026-10-29',
    title: 'Karriereseiten mit Suchmaske',
    items: [
      'Zeigt eine Karriereseite zunächst nur eine Suchmaske (z. B. Bilfinger), schickt der Abruf sie leer ab und liest die dann angezeigten Stellen.',
      'Bei SuccessFactors-Suchlisten werden Folgeseiten auch dann geladen, wenn kein „Weiter“-Link erkennbar ist.',
    ],
  },
  {
    version: '1.0.8',
    date: '2026-10-29',
    title: 'Arbeitszeugnisse',
    items: [
      'Dokumente: eigene Kategorie „Arbeitszeugnisse“ mit Schnellknopf „Arbeitszeugnis hochladen“ und optionaler Bezeichnung (Firma, Zeitraum). Die bisherige Kategorie „Zeugnisse“ heißt jetzt „Schul- und Studienzeugnisse“.',
    ],
  },
  {
    version: '1.0.7',
    date: '2026-10-29',
    title: 'Sehr lange Stellenlisten',
    items: [
      'Seiten mit sehr vielen Stellen (z. B. Personaldienstleister) brechen nicht mehr mit „Zeitüberschreitung“ ab: Der Abruf liest höchstens 800 Stellen pro Quelle und hört nach ca. 90 Sekunden Nachladen auf; das Gesamtzeitlimit pro Quelle beträgt 3,5 Minuten.',
    ],
  },
  {
    version: '1.0.6',
    date: '2026-10-29',
    title: 'Alle Stellen laden',
    items: [
      'Der Abruf lädt lange Stellenlisten vollständig: Er klickt „Mehr laden“ / „Weitere Jobs anzeigen“ (Schaltfläche oder Link) so lange, bis die von der Seite genannte Zahl erreicht ist, scrollt bei endlosen Listen weiter und wechselt per „Weiter“-Schaltfläche die Seite.',
      'Zeitlimit pro Karriereseite: ca. 2 Minuten.',
    ],
  },
  {
    version: '1.0.5',
    date: '2026-10-29',
    title: 'Test starten zeigt das Ergebnis',
    items: [
      'Nach „Test starten“ wartet die App auf das Ergebnis und zeigt es automatisch an (bisher musste man selbst abgleichen).',
      'Geänderte Adressen werden vor dem Start in die Dropbox geschrieben, damit der Abruf die neue Adresse sicher kennt.',
    ],
  },
  {
    version: '1.0.4',
    date: '2026-10-29',
    title: 'Gesperrte Karriereseiten',
    items: [
      'Neu am Arbeitgeber: „Stellen über die Bundesagentur für Arbeit suchen“ – für Firmen, deren Karriereseite den automatischen Abruf sperrt (HTTP 403). Bei blockierten Quellen gibt es dafür einen Knopf im Quellen-Test.',
      'Fehler „ERR_HTTP2_PROTOCOL_ERROR“ (z. B. ABB): Der Abruf versucht es jetzt automatisch ein zweites Mal ohne HTTP/2.',
    ],
  },
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
