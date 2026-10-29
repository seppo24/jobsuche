import { h, fmtRel, fmtDate, downloadBlob, isoDay, uid, lsGet, lsSet } from '../util.js';
import { S, list, get, put, replaceAll, setSettings, settings, pull, flush, mergeDb, defaultSettings, emptyDb, on } from '../store.js';
import { VERSION, CHANGELOG } from '../changelog.js';
import { sheet, toast, confirmDialog, field, input, textarea, mount } from '../ui.js';
import { synonymsFromText, synonymsToText, DEFAULT_SYNONYMS, DEFAULT_EXCLUDE_STUDENT, DEFAULT_EXCLUDE_DEFENCE } from '../search.js';
import * as dbx from '../dropbox.js';
import { aiKey, setAiKey } from './tailor.js';
import { ghToken, setGhToken, canTrigger, triggerCrawl } from '../portals.js';
import { parseEmployerSheet, planEmployerImport, parseStatusSheet, matchEmployer } from '../importers.js';

const copy = async t => { try { await navigator.clipboard.writeText(t); toast('Kopiert', 'ok'); } catch { toast('Kopieren nicht möglich', 'bad'); } };
const sect = (title, ...kids) => h('details', { class: 'card flat' }, h('summary', { style: 'cursor:pointer;font-weight:600;font-family:var(--font-head);font-size:1.05rem' }, title), h('div', { style: 'margin-top:.75rem' }, kids));
const lines = t => String(t || '').split(/\n|,/).map(x => x.trim()).filter(Boolean);

function dropboxSection() {
  const key = input({ value: dbx.appKey(), placeholder: 'App-Key aus der Dropbox App Console', autocomplete: 'off' });
  const tok = h('span', { class: 'mono' }, '••••••••');
  const connected = dbx.isConnected();
  return sect('Dropbox (Datenablage)',
    h('p', null, connected ? h('span', { class: 'pill ok' }, h('i'), 'verbunden') : h('span', { class: 'pill warn' }, h('i'), 'nicht verbunden'), ' Deine Daten liegen in deiner Dropbox im Ordner „Jobsuche“ – so sind Handy und Laptop immer gleich.'),
    field('App-Key', key),
    field('Weiterleitungs-Adresse (Redirect URI)', h('div', { class: 'row' }, h('span', { class: 'mono grow' }, dbx.redirectUri()), h('button', { class: 'btn small', type: 'button', onclick: () => copy(dbx.redirectUri()) }, 'Kopieren')), 'Diese Adresse muss in der Dropbox App Console unter „Redirect URIs“ eingetragen sein – auf Handy und Laptop ist es dieselbe.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', type: 'button', onclick: async () => { try { await dbx.startAuth(key.value); } catch (e) { toast(e.message, 'bad'); } } }, connected ? 'Neu verbinden' : 'Mit Dropbox verbinden'),
      connected ? [h('button', { class: 'btn', type: 'button', onclick: async () => { try { await pull(); toast('Abgeglichen', 'ok'); } catch (e) { toast(e.message, 'bad'); } } }, 'Jetzt abgleichen'),
        h('button', { class: 'btn', type: 'button', onclick: async () => { if (await confirmDialog('Verbindung auf diesem Gerät trennen? Deine Daten in der Dropbox bleiben erhalten.', { ok: 'Trennen' })) { dbx.disconnect(); toast('Getrennt'); location.reload(); } } }, 'Trennen')] : null),
    connected ? [h('h3', { style: 'margin-top:1.25rem' }, 'Zugangsdaten für den automatischen Abruf'),
      h('p', { class: 'muted small' }, 'Diese zwei Werte trägst du einmalig in GitHub als „Secrets“ ein (Anleitung: Schritt 5). Der Token ist wie ein Passwort – gib ihn nicht weiter.'),
      h('div', { class: 'row', style: 'margin-bottom:.5rem' }, h('b', null, 'DROPBOX_APP_KEY'), h('button', { class: 'btn small', type: 'button', onclick: () => copy(dbx.appKey()) }, 'Kopieren')),
      h('div', { class: 'row' }, h('b', null, 'DROPBOX_REFRESH_TOKEN'), tok, h('button', { class: 'btn small', type: 'button', onclick: () => { tok.textContent = tok.textContent.startsWith('•') ? dbx.refreshToken() : '••••••••'; } }, 'Zeigen'), h('button', { class: 'btn small', type: 'button', onclick: () => copy(dbx.refreshToken()) }, 'Kopieren'))] : null);
}

function profileSection() {
  const s = settings(), p = s.profile;
  const f = { name: input({ value: p.name }), email: input({ value: p.email }), phone: input({ value: p.phone }), address: input({ value: p.address, placeholder: 'Straße, PLZ Ort' }), ort: input({ value: p.ort }), radius: input({ type: 'number', value: p.radiusKm, min: 5, max: 300 }), queries: input({ value: (p.queries || []).join(', ') }), lat: input({ value: p.home?.lat }), lon: input({ value: p.home?.lon }) };
  return sect('Profil & Suche',
    h('p', { class: 'muted small' }, 'Diese Angaben werden nur in deiner Dropbox gespeichert und für Anschreiben und die Entfernungsberechnung verwendet.'),
    h('div', { class: 'grid2' }, field('Name', f.name), field('E-Mail', f.email), field('Telefon', f.phone), field('Adresse', f.address)),
    h('div', { class: 'grid2' }, field('Wohnort (Suche)', f.ort), field('Umkreis (km)', f.radius), field('Breitengrad', f.lat), field('Längengrad', f.lon)),
    field('Suchbegriffe (mit Komma trennen)', f.queries, 'Damit startet die Stellensuche und der Abruf bei der Bundesagentur.'),
    h('button', { class: 'btn primary', type: 'button', onclick: () => {
      setSettings({ profile: { ...p, name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), address: f.address.value.trim(), ort: f.ort.value.trim() || 'Schwelm', radiusKm: +f.radius.value || 50, queries: lines(f.queries.value), home: { lat: +f.lat.value || p.home.lat, lon: +f.lon.value || p.home.lon } } });
      toast('Gespeichert', 'ok');
    } }, 'Speichern'));
}

function searchSection() {
  const s = settings();
  const syn = textarea({ rows: 10, value: s.synonymsText });
  const st = textarea({ rows: 3, value: (s.excludeStudent || []).join(', ') });
  const df = textarea({ rows: 3, value: (s.excludeDefence || []).join(', ') });
  const hs = h('input', { type: 'checkbox', checked: s.hide.student }), hd = h('input', { type: 'checkbox', checked: s.hide.defence });
  const br = input({ value: (s.hide.branchen || []).join(', ') });
  return sect('Ähnliche Titel & Ausblenden',
    h('p', { class: 'muted small' }, 'Eine Gruppe pro Zeile: „Name: Begriff, Begriff | verwandter Begriff“. Begriffe vor dem „|“ gelten als gleichwertig (z. B. Projektleiter = Projektmanager), dahinter stehende werden als verwandt schwächer gewertet.'),
    field('Gruppen ähnlicher Berufsbezeichnungen', syn),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: () => { syn.value = synonymsToText(DEFAULT_SYNONYMS); } }, 'Standard wiederherstellen')),
    h('h3', { style: 'margin-top:1rem' }, 'Ausblenden'),
    h('label', { class: 'check' }, hs, 'Ausbildung, Studium, Praktikum ausblenden'), field('Begriffe', st),
    h('label', { class: 'check' }, hd, 'Rüstung/Verteidigung ausblenden'), field('Begriffe', df),
    field('Branchen ausblenden (Markierung am Arbeitgeber)', br, 'Aktuell: Automotive und Rüstung. Leer lassen, um nichts nach Branche auszublenden.'),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => {
      setSettings({ synonymsText: syn.value, excludeStudent: lines(st.value), excludeDefence: lines(df.value), hide: { student: hs.checked, defence: hd.checked, branchen: lines(br.value) } });
      toast('Gespeichert', 'ok');
    } }, 'Speichern'), h('button', { class: 'btn', type: 'button', onclick: () => { st.value = DEFAULT_EXCLUDE_STUDENT.join(', '); df.value = DEFAULT_EXCLUDE_DEFENCE.join(', '); } }, 'Begriffe zurücksetzen')));
}

function crawlerSection() {
  const g = settings().github || {};
  const o = input({ value: g.owner, placeholder: 'dein GitHub-Benutzername' }), r = input({ value: g.repo, placeholder: 'Name des Repositories' }), t = input({ type: 'password', value: ghToken(), placeholder: 'optional: Zugriffstoken (Fine-grained PAT)', autocomplete: 'off' });
  return sect('Automatischer Abruf (GitHub)',
    h('p', { class: 'muted small' }, 'Der Abruf läuft täglich automatisch in GitHub. Mit Konto, Repository und Token kannst du ihn zusätzlich per Knopfdruck aus der App starten. Das Token bleibt nur auf diesem Gerät.'),
    h('div', { class: 'grid2' }, field('GitHub-Benutzer', o), field('Repository', r)), field('Zugriffstoken', t, 'Berechtigung nur für dieses Repository: „Actions: Read and write“.'),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { setSettings({ github: { owner: o.value.trim(), repo: r.value.trim() } }); setGhToken(t.value); toast('Gespeichert', 'ok'); } }, 'Speichern'),
      h('button', { class: 'btn', type: 'button', onclick: async ev => { setSettings({ github: { owner: o.value.trim(), repo: r.value.trim() } }); setGhToken(t.value); ev.target.disabled = true; try { await triggerCrawl(''); toast('Abruf gestartet. In 3–10 Minuten hier „Jetzt abgleichen“ drücken.', 'ok'); } catch (e) { toast(e.message, 'bad'); } ev.target.disabled = false; } }, 'Abruf jetzt starten'),
      o.value && r.value ? h('a', { class: 'btn', href: `https://github.com/${g.owner}/${g.repo}/actions`, target: '_blank', rel: 'noopener noreferrer' }, 'Protokoll in GitHub') : null));
}

function aiSection() {
  const s = settings();
  const k = input({ type: 'password', value: aiKey(), placeholder: 'sk-ant-…', autocomplete: 'off' }), m = input({ value: s.ai.model });
  return sect('KI-Anpassung (optional)',
    h('p', { class: 'muted small' }, 'Ohne Zugang erstellt die App Entwürfe aus deinen Vorlagen und eine Anweisung zum Kopieren. Mit eigenem Anthropic-API-Schlüssel passt Claude Lebenslauf und Anschreiben direkt an. Der Schlüssel bleibt nur in diesem Browser; Stelle und Lebenslauf gehen bei Nutzung an Anthropic.'),
    field('API-Schlüssel', k), field('Modell', m),
    h('button', { class: 'btn primary', type: 'button', onclick: () => { setAiKey(k.value); setSettings({ ai: { ...s.ai, model: m.value.trim() || 'claude-sonnet-5-5' } }); toast('Gespeichert', 'ok'); } }, 'Speichern'));
}

async function importExcel() {
  sheet('Excel-Dateien importieren', close => {
    const fe = h('input', { type: 'file', accept: '.xlsx', 'aria-label': 'Jobsuche.xlsx' });
    const fs = h('input', { type: 'file', accept: '.xlsx', 'aria-label': 'Jobsuche_Status.xlsx' });
    const out = h('div', { role: 'status' });
    return h('div', null,
      h('p', null, 'Wähle deine bisherigen Dateien. Vorhandene Einträge werden nicht doppelt angelegt.'),
      field('Arbeitgeberliste (Jobsuche.xlsx)', fe), field('Bewerbungen (Jobsuche_Status.xlsx)', fs),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onclick: async ev => {
        ev.target.disabled = true; const msgs = [];
        try {
          if (fe.files[0]) {
            const rows = await parseEmployerSheet(window.JSZip, await fe.files[0].arrayBuffer());
            const plan = planEmployerImport(rows, list('employers'));
            for (const r of plan.neu) put('employers', { id: uid('emp'), name: r.name, url: r.url, kind: 'arbeitgeber', crawl: true, branche: '', note: 'Aus Excel importiert' });
            msgs.push(`Arbeitgeber: ${plan.neu.length} neu, ${plan.vorhanden.length} bereits vorhanden` + (plan.geaendert.length ? `, ${plan.geaendert.length} mit abweichender Adresse (die aktuellere in der App bleibt)` : '') + '.');
          }
          if (fs.files[0]) {
            const apps = await parseStatusSheet(window.JSZip, await fs.files[0].arrayBuffer());
            const emps = list('employers'); let n = 0, skip = 0;
            for (const a of apps) { if (get('applications', a.id)) { skip++; continue; } const m = matchEmployer(a.company, emps); put('applications', { ...a, employerId: m?.id }); n++; }
            msgs.push(`Bewerbungen: ${n} importiert${skip ? `, ${skip} schon vorhanden` : ''} (im Archiv „2020/21“).`);
          }
          if (!msgs.length) msgs.push('Bitte mindestens eine Datei wählen.');
        } catch (e) { msgs.push('Fehler: ' + e.message); }
        mount(out, msgs.map(m => h('p', null, m))); ev.target.disabled = false;
      } }, 'Importieren')), out);
  });
}

function dataSection() {
  const imp = h('input', { type: 'file', accept: '.json', 'aria-label': 'Sicherung wählen', onchange: async e => {
    try { const d = JSON.parse(await e.target.files[0].text()); replaceAll(mergeDb(S.db, d)); toast('Sicherung eingespielt', 'ok'); } catch (x) { toast('Datei nicht lesbar: ' + x.message, 'bad'); }
  } });
  return sect('Daten',
    h('div', { class: 'btn-row', style: 'margin-top:0' }, h('button', { class: 'btn', type: 'button', onclick: importExcel }, 'Excel-Dateien importieren …'),
      h('button', { class: 'btn', type: 'button', onclick: () => downloadBlob(new Blob([JSON.stringify(S.db, null, 1)], { type: 'application/json' }), `jobsuche-sicherung-${isoDay(new Date())}.json`) }, 'Sicherung herunterladen')),
    field('Sicherung einspielen (.json)', imp, 'Wird mit dem aktuellen Stand zusammengeführt.'),
    h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (await confirmDialog('Lokalen Zwischenspeicher dieses Geräts löschen? Bei verbundener Dropbox werden die Daten danach neu geladen.', { ok: 'Löschen' })) { try { localStorage.removeItem('jobsuche.db.v1'); } catch { /* egal */ } indexedDB.deleteDatabase('jobsuche'); location.reload(); } } }, 'Zwischenspeicher dieses Geräts leeren'));
}

export function render(el) {
  const sy = S.sync;
  const jobs = S.jobs;
  mount(el,
    h('h1', null, 'Info'),
    h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h2', { style: 'margin:0' }, 'Jobsuche'), h('span', { class: 'muted' }, 'Version ' + VERSION)),
      h('button', { class: 'btn', type: 'button', onclick: async () => { try { if (navigator.serviceWorker) { const r = await navigator.serviceWorker.getRegistration(); await r?.update(); } await pull(); toast('Auf Updates geprüft und abgeglichen', 'ok'); } catch (e) { toast(e.message, 'bad'); } } }, 'Nach Update suchen')),
      h('p', { class: 'muted small', style: 'margin-top:.75rem' }, `Abgleich: ${dbx.isConnected() ? (sy.state === 'error' ? 'Fehler – ' + sy.msg : sy.lastSync ? 'zuletzt ' + fmtRel(sy.lastSync) : 'bereit') : 'Dropbox nicht verbunden – Daten nur auf diesem Gerät'} · Stellenstand: ${jobs.generatedAt ? fmtRel(jobs.generatedAt) : 'noch kein Abruf'}`)),
    h('h2', null, 'Versionsverlauf'),
    CHANGELOG.map((c, i) => h('details', { class: 'log', open: i === 0 }, h('summary', null, 'Version ' + c.version, h('span', { class: 'muted small' }, fmtDate(c.date) + ' · ' + c.title)), h('ul', null, c.items.map(x => h('li', null, x))))),
    h('h2', { style: 'margin-top:1.5rem' }, 'Einstellungen'),
    dropboxSection(), profileSection(), searchSection(), crawlerSection(), aiSection(), dataSection());
}
