# Jobsuche – Einrichtung (einmalig, ca. 30 Minuten)

Die App besteht aus drei Teilen:

- **App** (diese Dateien) – liegt kostenlos auf GitHub Pages und läuft auf Handy und Laptop im Browser.
- **Datenbank** – liegt in deiner Dropbox im Ordner `Jobsuche`. Deine persönlichen Daten (Bewerbungen, Unterlagen, Name) stehen **nicht** im öffentlichen GitHub, nur in deiner Dropbox.
- **Stellenabruf** – ein kleines Programm, das GitHub täglich automatisch ausführt, die Karriereseiten besucht und die Stellen in die Dropbox schreibt.

## 1. Auf GitHub hochladen
1. Auf github.com anmelden → **New repository** → Name z. B. `jobsuche` → **Public** → *Create repository*.
2. **Add file → Upload files** → den **Inhalt** der ZIP-Datei hineinziehen (nicht den Ordner selbst) → *Commit changes*.
3. Prüfen, dass der Ordner `.github/workflows` mit der Datei `crawl.yml` angekommen ist. Falls nicht (versteckte Ordner werden manchmal übersprungen): **Add file → Create new file**, als Name `.github/workflows/crawl.yml` eintippen und den Inhalt der Datei aus der ZIP einfügen.
4. **Settings → Pages** → *Source*: **Deploy from a branch** → Branch `main`, Ordner `/ (root)` → *Save*. Nach ca. 1 Minute steht oben die Adresse, z. B. `https://DEINNAME.github.io/jobsuche/`.

## 2. Dropbox-App anlegen (nur wenn du keinen vorhandenen App-Key nutzen willst)
Du kannst den App-Key deiner bisherigen App wiederverwenden – dann nur Punkt c) ergänzen.
1. dropbox.com/developers/apps → **Create app** → *Scoped access* → *App folder* (empfohlen) → Name frei wählen.
2. Reiter **Permissions**: `files.metadata.read`, `files.metadata.write`, `files.content.read`, `files.content.write` ankreuzen → *Submit*.
3. Reiter **Settings** → **Redirect URIs**: die Adresse aus Schritt 1.4 **mit Schrägstrich am Ende** eintragen (z. B. `https://DEINNAME.github.io/jobsuche/`) → *Add*. Den **App key** kopieren.

## 3. In der App verbinden
1. Adresse aus Schritt 1.4 auf dem Laptop öffnen → **Info → Einstellungen → Dropbox** → App-Key einfügen → **Mit Dropbox verbinden** → in Dropbox „Zulassen“.
2. Auf dem Handy dieselbe Adresse öffnen, App-Key eintragen, verbinden. Im Browser-Menü **„Zur Startseite hinzufügen“ / „App installieren“** wählen.
3. Beim ersten Start sind deine ca. 105 Arbeitgeber (mit aktualisierten Karriere-Adressen) und die Portale schon eingetragen.

## 4. Excel-Dateien importieren
**Info → Einstellungen → Daten → Excel-Dateien importieren**: `Jobsuche.xlsx` und `Jobsuche_Status.xlsx` wählen. Die Bewerbungen landen im Archiv „2020/21“ mit Verlauf.

## 5. Automatischen Stellenabruf aktivieren
1. In der App: **Info → Einstellungen → Dropbox → Zugangsdaten für den automatischen Abruf**: dort stehen `DROPBOX_APP_KEY` und `DROPBOX_REFRESH_TOKEN` zum Kopieren.
2. GitHub → dein Repository → **Settings → Secrets and variables → Actions → New repository secret**: zwei Secrets mit **genau diesen Namen** anlegen und die Werte einfügen.
3. Reiter **Actions** → *Stellen abrufen* → **Run workflow**. Nach 10–40 Minuten liegt `jobs.json` in der Dropbox. In der App **Info → Jetzt abgleichen**.
4. Danach läuft der Abruf **täglich automatisch**. Bei Inaktivität schaltet GitHub geplante Abläufe nach 60 Tagen ab – dann in *Actions* einmal „Enable workflow“ drücken.

**Optional – Abruf aus der App starten:** GitHub → Settings → Developer settings → Fine-grained tokens → Token nur für dein Repository mit *Actions: Read and write*. In der App unter *Automatischer Abruf* Benutzer, Repository und Token eintragen.

## 6. Quellen prüfen
Unter **Arbeitgeber** zeigt jede Quelle eine Ampel: *sicher erkannt*, *unsicher*, *keine Stellen*, *Fehler*, *blockiert*, *nur Link*. Ein Tipp auf den Eintrag zeigt Prüfungen, Stichprobe der erkannten Stellen und gefundene neuere Adressen („Übernehmen“). Mit **Als korrekt bestätigen** merkst du dir, dass du eine Quelle gegen die echte Seite verglichen hast. Der Filter **Prüfen** zeigt alles, was Aufmerksamkeit braucht.

## 7. Updates einspielen
Neue ZIP-Version entpacken → im GitHub-Repository **Add file → Upload files** → Inhalt hineinziehen → *Commit*. Nach ca. 1 Minute erscheint in der App „Neue Version verfügbar“. Den Versionsverlauf findest du unter **Info**.

## Gut zu wissen
- **Stepstone, LinkedIn, Indeed, XING** bieten keine freie Schnittstelle. Die App öffnet dort die Suche mit deinen Begriffen und Umkreis. Automatisch abgerufen wird die **Jobbörse der Bundesagentur für Arbeit** sowie jede eingetragene Karriereseite.
- Manche Karriereseiten blockieren automatische Abrufe oder sind ungewöhnlich gebaut. Das erkennt der Quellen-Test; solche Quellen erscheinen als *unsicher* oder *blockiert*, statt falsche Stellen zu zeigen.
- Die **KI-Anpassung** braucht einen eigenen Anthropic-API-Schlüssel (Info → Einstellungen). Ohne ihn gibt es Entwurf aus Vorlage und eine kopierbare Anweisung für Claude.
- Zwei Geräte gleichzeitig: Änderungen werden pro Eintrag zusammengeführt, bei Konflikt gewinnt die jüngere.
