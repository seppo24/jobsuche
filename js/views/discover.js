// „Weitere Arbeitgeber finden“: Vorschläge aus der Bundesagentur-Jobsuche (Arbeitgeber mit offenen Stellen im Umkreis).
import { h, uid, fmtRel } from '../util.js';
import { settings, setSettings, put } from '../store.js';
import * as dbx from '../dropbox.js';
import { sheet, toast, notice, field, input, emptyState } from '../ui.js';
import { canTrigger, triggerCrawl } from '../portals.js';

let polling = false;
async function load() {
  if (!dbx.isConnected()) return null;
  const f = await dbx.download(dbx.ROOT + '/vorschlaege.json');
  try { return f ? JSON.parse(f.data) : null; } catch { return null; }
}

function watch(before, onDone) {
  if (polling) return; polling = true;
  const t0 = Date.now();
  const tick = async () => {
    const d = await load().catch(() => null);
    if (d && d.generatedAt !== before) { polling = false; notice(`Die Suche nach weiteren Arbeitgebern ist abgeschlossen: ${d.items.length} Vorschläge für ${d.ort}.`, 'ok'); onDone(d); return; }
    if (Date.now() - t0 > 20 * 60000) { polling = false; notice('Die Arbeitgebersuche hat nach 20 Minuten kein Ergebnis geliefert. Bitte in GitHub unter „Actions“ nachsehen.', 'bad'); return; }
    setTimeout(tick, 20000);
  };
  setTimeout(tick, 20000);
}

function candidateSheet(c, done) {
  sheet(c.name, (close) => {
    const url = input({ type: 'url', value: c.careerUrl || c.website || '', placeholder: 'https://karriere.firma.de' });
    const ignore = () => { const l = settings().ignoredEmployers || []; setSettings({ ignoredEmployers: [...new Set([...l, c.name])] }); toast('Wird nicht mehr vorgeschlagen', 'ok'); close(); done(); };
    return h('div', null,
      h('p', null, h('b', null, 'Ist dieser Arbeitgeber interessant?')),
      c.description ? h('p', null, c.description) : h('p', { class: 'muted' }, 'Keine Beschreibung gefunden. Die Webseite des Unternehmens gibt mehr Auskunft.'),
      h('ul', { class: 'checks' },
        h('li', null, c.employees ? `Größe: ca. ${c.employees.toLocaleString('de-DE')} Mitarbeitende (${c.size}) – laut Webseite` : 'Größe: nicht ermittelbar'),
        h('li', null, `${c.count} offene Stellen zu deinen Suchbegriffen bei der Bundesagentur`),
        c.locations?.length ? h('li', null, 'Orte: ' + c.locations.join(', ') + (c.minKm != null ? ` (nächste Stelle ca. ${c.minKm} km)` : '')) : null,
        c.titles?.length ? h('li', null, 'Beispiele: ' + c.titles.join(' · ')) : null,
        c.website ? h('li', null, 'Webseite: ', h('a', { href: c.website, target: '_blank', rel: 'noopener noreferrer' }, c.website)) : h('li', null, 'Webseite nicht gefunden – ', h('a', { href: 'https://www.google.com/search?q=' + encodeURIComponent(c.name + ' Karriere'), target: '_blank', rel: 'noopener noreferrer' }, 'selbst suchen'))),
      field('Adresse der Karriereseite', url, c.careerUrl ? 'Automatisch gefunden – bitte kurz prüfen.' : 'Bitte eintragen oder prüfen.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => {
          let u = url.value.trim(); if (!u) { toast('Bitte die Adresse der Karriereseite eintragen.', 'bad'); return; }
          if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
          put('employers', { id: uid('emp'), name: c.name, url: u, kind: 'arbeitgeber', crawl: true, branche: '', note: 'Aus „Weitere Arbeitgeber finden“', description: c.description || undefined, employees: c.employees || undefined });
          toast(`${c.name} aufgenommen. Der nächste Abruf prüft die Karriereseite.`, 'ok'); close(); done();
        } }, 'Ja, aufnehmen'),
        h('button', { class: 'btn', type: 'button', onclick: ignore }, 'Nicht interessant'),
        h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Später')));
  });
}

export function openDiscover(after = () => {}) {
  sheet('Weitere Arbeitgeber finden', (close, body) => {
    const p = settings().profile || {};
    const ort = input({ value: p.ort || 'Schwelm' }), km = input({ type: 'number', value: p.radiusKm || 50, min: 5, max: 200 });
    const list = h('div');
    const paint = (d) => {
      list.replaceChildren(...(d && d.items.length ? [
        h('p', { class: 'muted small' }, `Stand ${fmtRel(d.generatedAt)} · ${d.ort}, ${d.radius} km · ${d.total} Arbeitgeber mit passenden offenen Stellen, ${d.skippedAgencies || 0} Personaldienstleister ausgelassen.`),
        ...d.items.filter(c => !(settings().ignoredEmployers || []).includes(c.name)).map(c => h('button', { class: 'emp', type: 'button', onclick: () => candidateSheet(c, () => { paint(d); after(); }) },
          h('div', { class: 'grow' }, h('div', { class: 'n' }, c.name), h('div', { class: 's' }, (c.size ? c.size + (c.employees ? ` (~${c.employees.toLocaleString('de-DE')})` : '') + ' · ' : '') + (c.locations || []).slice(0, 2).join(', ') + (c.minKm != null ? ` · ${c.minKm} km` : ''))),
          h('span', { class: 'chip' }, c.count + ' Stellen')))] : [d ? emptyState('Keine neuen Arbeitgeber', 'Alle gefundenen Arbeitgeber stehen schon in deiner Liste oder wurden ausgeblendet.') : h('p', { class: 'muted' }, 'Noch keine Suche durchgeführt.')]));
    };
    let last = null;
    load().then(d => { last = d; paint(d); }).catch(() => paint(null));
    return h('div', null,
      h('p', { class: 'muted' }, 'Sucht Arbeitgeber mit offenen Stellen zu deinen Suchbegriffen (Info → Einstellungen) im Umkreis eines Ortes. Personaldienstleister und Arbeitgeber, die du schon hast, werden ausgelassen. Vor dem Aufnehmen siehst du eine Kurzbeschreibung und die Größe.'),
      field('Ort', ort), field('Umkreis (km)', km),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onclick: async ev => {
        if (!canTrigger()) { toast('Unter Info → Einstellungen → „Automatischer Abruf“ den GitHub-Zugang eintragen.', 'bad'); return; }
        ev.target.disabled = true;
        try {
          await triggerCrawl(`discover:${ort.value.trim()}|${parseInt(km.value, 10) || 50}`);
          toast('Suche gestartet – dauert etwa 5–15 Minuten. Oben erscheint eine Meldung, sobald sie fertig ist.', 'ok');
          watch(last?.generatedAt, d => { last = d; paint(d); });
        } catch (e) { toast(e.message, 'bad'); }
        ev.target.disabled = false;
      } }, 'Suche starten')),
      list);
  }, { wide: true });
}
