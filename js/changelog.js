// Versionsverlauf – wird in der App unter „Info“ angezeigt.
// Bei jeder Änderung: neuen Eintrag OBEN einfügen, VERSION erhöhen und in sw.js die CACHE-Version anpassen.

export const VERSION = '1.0.23';

export const CHANGELOG = [
  {
    version: '1.0.23',
    date: '2026-10-30',
    title: 'Zeugnis-Bewertung robuster',
    items: [
      'Die KI-Antwort wird auch gelesen, wenn sie wegen der Länge abgeschnitten ankommt (Fehler „Expected ',' or ']' …“). Die Antwort darf länger sein und wird kürzer gehalten.',
      'Bei einem Fehler steht jetzt der wahre Grund da und nicht mehr „KI-Zugang hinterlegen“.',
    ],
  },
  {
    version: '1.0.22',
    date: '2026-10-30',
    title: 'Gescannte Zeugnisse lesen',
    items: [
      'Gescannte Arbeitszeugnisse (PDF ohne Text) werden jetzt gelesen: Die Seiten gehen als Bilder an die KI, die den Text abschreibt. Danach wird das Sammel-PDF wie gewohnt nach Arbeitgeber und Jahr geteilt und bewertet. Der abgeschriebene Text bleibt am Zeugnis gespeichert, „Erneut bewerten“ braucht dann kein neues Lesen.',
      'Dafür ist der KI-Zugang aus Info → Einstellungen nötig. Ohne ihn lassen sich Scans nur von Hand einteilen.',
    ],
  },
  {
    version: '1.0.21',
    date: '2026-10-30',
    title: 'Zeugnis-Bewertung mit Noten',
    items: [
      'Beim Hochladen eines Arbeitszeugnisses wird es bewertet: Gesamtnote (1–5), Einzelnoten (Leistung, Arbeitsweise, Verhalten, Schlussformel …), auffällige Formulierungen mit Bedeutung, Stärken, Schwächen und fehlende Bestandteile. Ein Klick auf das Zeugnis (oder „Note …“) zeigt die Einschätzung samt Notensystem.',
      'Die Bewertung nutzt den KI-Zugang aus Info → Einstellungen (der Zeugnistext geht an Claude). Ohne Zugang gibt es eine Note nur aus der Zufriedenheitsformel („stets zur vollen Zufriedenheit“ = 2). „Erneut bewerten“ ist jederzeit möglich.',
    ],
  },
  {
    version: '1.0.20',
    date: '2026-10-30',
    title: 'Zeugnisse aufteilen, Abruf-Meldung, Einstellungen zuerst',
    items: [
      'Dokumente → Arbeitszeugnis hochladen: Ein Sammel-PDF wird automatisch in einzelne Zeugnisse geteilt, nach Arbeitgeber und Jahr benannt und mit dem neuesten zuerst abgelegt. Vor dem Speichern lassen sich Arbeitgeber, Jahr und Seiten korrigieren. Bei Scans ohne Text trägst du die Seitenbereiche selbst ein.',
      'Neue Kategorie „Abschlusszeugnis (Master)“.',
      'Info: „Einstellungen“ stehen jetzt vor dem Versionsverlauf.',
      'Abruf-Meldung: Die App prüft bei GitHub, ob der Lauf wirklich fertig oder gescheitert ist, statt nach 15 Minuten aufzugeben (Gesamtabrufe dauern oft länger). Der Crawler speichert bereits nach dem Abruf der Karriereseiten einen Zwischenstand und beginnt höchstens 100 Minuten lang neue Quellen.',
    ],
  },
  {
    version: '1.0.19',
    date: '2026-10-30',
    title: 'Umkreis: Ortsverzeichnis, Ausland, mehr Detailseiten',
    items: [
      'Der Abruf lädt ein Verzeichnis aller deutschen Postleitzahlen und Orte (GeoNames). Damit bekommt fast jede Stelle mit Ort oder Postleitzahl eine Entfernung (z. B. Bitburg, Kaarst).',
      'Stellen im Ausland (Österreich, USA, … auch mit Länderkürzel wie „AT“) werden sicher erkannt und nie mit gleichnamigen deutschen Orten verwechselt; sie fallen beim Umkreisfilter heraus.',
      'Einsatzort aus der Stellen-Detailseite: Adresszeilen wie „41564 Kaarst“ werden auch weit unten auf der Seite gefunden; bis zu 400 Stellen je Lauf, alle bisher ungeklärten werden neu geprüft.',
    ],
  },
  {
    version: '1.0.18',
    date: '2026-10-30',
    title: 'Bundesagentur: neue Schnittstellenversion',
    items: [
      'Abfragen bei der Bundesagentur (Arbeitgebersuche, Portal „Bundesagentur“, „Stellen über die Bundesagentur suchen“) nutzen jetzt die aktuelle Schnittstellenversion v6 und fallen bei Fehlern auf v4 zurück. Der Fehlertext der Bundesagentur wird mit angezeigt.',
    ],
  },
  {
    version: '1.0.17',
    date: '2026-10-30',
    title: 'Arbeitgebersuche: mehr Treffer, klare Meldung',
    items: [
      'Die Arbeitgebersuche nutzt zusätzlich breitere Suchbegriffe (Ingenieur, Techniker, Konstrukteur, Leiter …) und zeigt bis zu 40 Vorschläge.',
      'Das Ergebnis nennt jetzt, wie viele Arbeitgeber gefunden wurden, wie viele schon in deiner Liste stehen oder Personaldienstleister sind – und meldet, wenn die Bundesagentur nicht antwortet.',
    ],
  },
  {
    version: '1.0.16',
    date: '2026-10-30',
    title: 'Gehaltsschätzung, Tarif, weitere Arbeitgeber finden',
    items: [
      'Jede Stelle zeigt eine grobe Gehaltsschätzung (Marktspanne nach Stellenbezeichnung, Region, Tarif, Größe). Abschaltbar unter Info → Einstellungen.',
      'Tarifvertrag je Arbeitgeber (mit Quelle = „gesichert“, optional Entgeltgruppe) und Hinweise aus Stellenanzeigen („nach IG-Metall-Tarif“, „Entgeltgruppe 11“). Anzeige an den Stellen.',
      'Arbeitgeber → „Weitere Arbeitgeber finden“: Suche über die Bundesagentur nach Firmen mit passenden offenen Stellen im Umkreis eines Ortes, mit Kurzbeschreibung, Größe und Rückfrage vor dem Aufnehmen. Personaldienstleister werden ausgelassen.',
      'Arbeitgeber haben zusätzlich Felder „Mitarbeitende“ und „Beschreibung“.',
    ],
  },
  {
    version: '1.0.15',
    date: '2026-10-30',
    title: 'Entfernung auch für unbekannte Orte',
    items: [
      'Wenn ein Ort weder in der eingebauten Liste steht noch über die Ortssuche gefunden wird (z. B. „89407 Dillingen an der Donau“), schätzt der Abruf die Entfernung jetzt über die Postleitzahl. Solche Stellen fallen dadurch aus dem Umkreis heraus. Die Entfernung ist Luftlinie und bei diesem Notbehelf nur grob.',
    ],
  },
  {
    version: '1.0.14',
    date: '2026-10-30',
    title: 'Prüfung bestätigen, Seitenwechsel, Diagnose',
    items: [
      'Quellen-Test: Bei „unsicher“ gibt es jetzt „Ergebnis ist richtig“. Damit bestätigst du eine manuell geprüfte Quelle; sie gilt dann nicht mehr als unklar (zurücknehmbar, verfällt bei geänderter Adresse).',
      'SuccessFactors-Seiten mit mehreren Seiten (Eberspächer, Grimme …): „Einträge pro Seite“ wird auf den größten Wert gestellt, Pfeile (▶, Bild-Pfeile, Javascript-Links) werden als „Weiter“ erkannt.',
      '„Alle Jobs anzeigen“ als Link auf eine eigene Ergebnisseite (Bosch) wird verfolgt.',
      'Quellen-Test: „Diagnose“ zum Kopieren (Überschriften, Schaltflächen, Beispiel-Karte) – damit lassen sich schwierige Seiten schnell einordnen.',
    ],
  },
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
