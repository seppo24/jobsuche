import { h, uid, fmtRel, hostOf, normUrl, debounce, lsGet, lsSet } from '../util.js';
import { S, list, get, put, del, settings } from '../store.js';
import { sheet, toast, confirmDialog, field, input, textarea, select, statusPill, emptyState, mount } from '../ui.js';
import { PORTAL_TYPES, canTrigger, triggerCrawl, searchUrl, watchForResult, isWatching } from '../portals.js';

const rawTest = id => S.jobs.sources?.[id]?.test || S.jobs.sources?.[id] || null;
const isConfirmed = e => !!(e && e.confirm && e.confirm.url === e.url);
// Manuell bestätigte Ergebnisse gelten nicht mehr als „unsicher“ (sofort in der App, der Abruf übernimmt es beim nächsten Lauf)
const testOf = id => { const t = rawTest(id), e = get('employers', id); return t && t.status === 'unsicher' && isConfirmed(e) ? { ...t, status: t.count ? 'ok' : 'leer', confirmed: true, message: 'Von dir bestätigt' } : t; };
const countOf = id => (S.jobs.jobs || []).filter(j => j.employerId === id).length;
const sameUrl = (a, b) => String(a || '').replace(/\/+$/, '').toLowerCase() === String(b || '').replace(/\/+$/, '').toLowerCase();
export const isStale = (e, t) => !!(t && t.url && !sameUrl(t.url, e.url));
const f = lsGet('jobsuche.empview', { q: '', kind: 'alle' });

function testPanel(e, test, close) {
  const blocked = ['blockiert', 'fehler'].includes(test?.status) && !e.baSearch && e.kind !== 'portal';
  if (!test) return h('div', { class: 'banner info' }, 'Diese Quelle wurde noch nicht abgerufen. Der nächste automatische Lauf prüft sie – oder starte den Test jetzt.');
  const sug = test.suggestions || [];
  const confirmBtn = rawTest(e.id)?.status === 'unsicher' && !isConfirmed(e) && !blocked
    ? h('div', { class: 'banner info', style: 'margin-top:.6rem' }, 'Hast du die Seite selbst geprüft und das Ergebnis stimmt (auch „keine Stellen“)? ',
      h('button', { class: 'btn small primary', type: 'button', onclick: () => { put('employers', { ...e, confirm: { url: e.url, at: new Date().toISOString() } }); toast('Als geprüft bestätigt. Gilt ab dem nächsten Abruf auch für die Stellen.', 'ok'); close(); } }, 'Ergebnis ist richtig'))
    : (isConfirmed(e) ? h('p', { class: 'muted small' }, 'Von dir bestätigt. ', h('button', { class: 'btn ghost small', type: 'button', onclick: () => { const { confirm, ...rest } = e; put('employers', { ...rest, confirm: null }); toast('Bestätigung zurückgenommen', 'ok'); close(); } }, 'Zurücknehmen')) : null);
  const diagBox = test.diag ? h('details', { class: 'log', style: 'margin-top:.6rem' }, h('summary', null, 'Diagnose (bei Problemen an Claude schicken)'),
    h('div', { style: 'padding:0 1rem 1rem' }, h('button', { class: 'btn small', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(`${e.name}\n${e.url}\nMeldung: ${test.message || ''}\n${test.diag}`); toast('Diagnose kopiert', 'ok'); } catch { toast('Kopieren nicht möglich – Text markieren und kopieren', 'bad'); } } }, 'Diagnose kopieren'),
      h('pre', { style: 'white-space:pre-wrap;font-size:.75rem;max-height:14rem;overflow:auto;margin-top:.5rem' }, test.diag))) : null;
  return h('div', null, confirmBtn, diagBox,
    h('div', { class: 'row' }, statusPill(test.status, test.message), test.confidence && test.confidence !== 'keine' ? h('span', { class: 'chip' }, 'Sicherheit: ' + test.confidence) : null, test.method ? h('span', { class: 'chip' }, 'Erkennung: ' + methodName(test.method)) : null, h('span', { class: 'muted small' }, test.checkedAt ? 'geprüft ' + fmtRel(test.checkedAt) : '')),
    test.message ? h('p', { style: 'margin-top:.5rem' }, test.message) : null,
    blocked ? h('div', { class: 'banner' }, 'Die Karriereseite lässt sich nicht automatisch abrufen. ', h('button', { class: 'btn small', type: 'button', onclick: () => { put('employers', { ...e, baSearch: true }); toast('Ab dem nächsten Abruf werden die Stellen über die Bundesagentur gesucht.', 'ok'); close(); } }, 'Stellen über die Bundesagentur suchen')) : null,
    (test.checks || []).length ? h('ul', { class: 'checks', style: 'margin-top:.5rem' }, test.checks.map(c => h('li', null, h('span', { class: 'm ' + (c.ok === true ? 'y' : c.ok === false ? 'n' : 'q') }, c.ok === true ? '✓' : c.ok === false ? '✗' : '?'), c.text))) : null,
    (test.sample || []).length ? [h('h3', null, `Stichprobe (${test.count ?? test.sample.length} Stellen insgesamt)`), h('ul', { class: 'sample' }, test.sample.map(x => h('li', null, x.url ? h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, x.title) : x.title, x.location ? h('span', { class: 'muted small' }, ' · ' + x.location) : null)))] : null,
    sug.length ? [h('h3', { style: 'margin-top:1rem' }, 'Gefundene Adressen'), sug.map(s => h('div', { class: 'row', style: 'margin-bottom:.4rem' }, h('div', { class: 'grow' }, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', class: 'mono' }, s.url), s.reason ? h('div', { class: 'muted small' }, s.reason) : null), h('button', { class: 'btn small', type: 'button', onclick: () => { put('employers', { ...e, oldUrl: e.url, url: s.url, urlStatus: 'aktualisiert', note: (e.note ? e.note + ' · ' : '') + 'Adresse aus Test übernommen' }); toast('Adresse übernommen – wird beim nächsten Lauf geprüft', 'ok'); close(); } }, 'Übernehmen')))] : null);
}
const methodName = m => ({ jsonld: 'Strukturierte Daten (JSON-LD)', successfactors: 'SuccessFactors-Liste', liste: 'Wiederkehrende Liste', workday: 'Workday-Schnittstelle', ueberschriften: 'Stellen-Überschriften', ba: 'Bundesagentur-Schnittstelle' }[m] || m);

export function openEmployer(id, after = () => {}) {
  const ex = id ? get('employers', id) : null;
  const e = ex || { id: uid('emp'), kind: 'arbeitgeber', crawl: true, branche: '', note: '' };
  sheet(ex ? e.name : 'Arbeitgeber oder Portal hinzufügen', (close) => {
    const test = ex ? testOf(e.id) : null;
    const k = { name: input({ value: e.name || '' }), url: input({ type: 'url', value: e.url || '', placeholder: 'https://karriere.firma.de' }),
      kind: select([['arbeitgeber', 'Arbeitgeber (Karriereseite)'], ['dienstleister', 'Personaldienstleister / Ingenieurbüro'], ['portal', 'Jobportal']], e.kind),
      portalType: select(PORTAL_TYPES, e.portalType || 'link'), searchUrl: input({ value: e.searchUrl || '', placeholder: 'https://portal.de/suche?was={q}&wo={ort}&umkreis={radius}' }),
      branche: input({ value: e.branche || '', placeholder: 'z. B. Automotive' }), note: textarea({ rows: 2, value: e.note || '' }) };
    const crawl = h('input', { type: 'checkbox', checked: e.crawl !== false });
    const baSearch = h('input', { type: 'checkbox', checked: !!e.baSearch });
    const baName = input({ value: e.baName || '', placeholder: e.name || 'Firmenname wie bei der Bundesagentur' });
    const portalRow = h('div', null, field('Portal-Typ', k.portalType), field('Eigene Such-Adresse (nur bei „Anderes Portal“)', k.searchUrl, 'Platzhalter: {q} Suchbegriff, {ort}, {radius}')); const syncKind = () => { portalRow.style.display = k.kind.value === 'portal' ? '' : 'none'; }; k.kind.addEventListener('change', syncKind); syncKind();
    const body = [];
    if (ex) {
      body.push(h('div', { class: 'row', style: 'margin-bottom:.5rem' }, h('a', { class: 'btn small', href: e.url, target: '_blank', rel: 'noopener noreferrer' }, 'Karriereseite öffnen'),
        e.kind !== 'portal' || e.portalType === 'ba' ? h('a', { class: 'btn small primary', href: '#/stellen?arbeitgeber=' + encodeURIComponent(e.id), onclick: close }, `Stellen anzeigen (${countOf(e.id)})`) : null,
        h('button', { class: 'btn small', type: 'button', onclick: async ev => { ev.target.disabled = true; try { await triggerCrawl(e.id); toast('Test gestartet – das Ergebnis erscheint hier automatisch (ca. 2–5 Minuten).', 'ok'); watchForResult(ok => { window.dispatchEvent(new HashChangeEvent('hashchange')); }); } catch (x) { toast(x.message, 'bad'); } ev.target.disabled = false; } }, isWatching() ? 'Test läuft …' : canTrigger() ? 'Test starten' : 'Test starten (GitHub-Zugang fehlt)')));
      if (e.urlStatus || e.oldUrl) body.push(h('div', { class: 'banner info' }, e.urlStatus ? h('b', null, 'Adresse: ' + e.urlStatus + '. ') : null, e.oldUrl && e.oldUrl !== e.url ? ['Vorher: ', h('span', { class: 'mono' }, e.oldUrl)] : null));
      if (isStale(e, test)) {
        body.push(h('h3', null, 'Quellen-Test'), h('div', { class: 'banner' }, h('b', null, 'Adresse geändert – noch nicht neu geprüft. '), 'Das untenstehende Ergebnis gehört zur alten Adresse ', h('span', { class: 'mono' }, test.url), '. ', canTrigger() ? 'Mit „Test starten“ wird die neue Adresse jetzt geprüft.' : ['Die neue Adresse wird beim nächsten täglichen Abruf geprüft. Sofort geht es in GitHub unter Actions → Stellen abrufen → Run workflow mit der Eingabe ', h('span', { class: 'mono' }, e.id), '.']),
          h('details', { class: 'log' }, h('summary', null, 'Ergebnis für die alte Adresse'), h('div', { style: 'padding:0 1rem 1rem' }, testPanel(e, { ...test, suggestions: [] }, () => { close(); after(); }))));
      } else body.push(h('h3', null, 'Quellen-Test'), testPanel(e, test, () => { close(); after(); }));
      if (e.kind !== 'portal' && test && test.status !== 'nur-link' && !isStale(e, test)) body.push(h('div', { class: 'btn-row' }, h('button', { class: 'btn small', type: 'button', onclick: () => { put('employers', { ...e, confirmedAt: new Date().toISOString(), confirmedCount: test.count ?? null }); toast('Als korrekt bestätigt', 'ok'); close(); after(); } }, e.confirmedAt ? 'Erneut als korrekt bestätigen' : 'Als korrekt bestätigen')), e.confirmedAt ? h('p', { class: 'muted small' }, 'Von dir bestätigt ' + fmtRel(e.confirmedAt)) : null);
      body.push(h('hr', { style: 'border:0;border-top:1px solid var(--line);margin:1.25rem 0' }), h('h3', null, 'Bearbeiten'));
    }
    body.push(h('form', { onsubmit: ev => {
      ev.preventDefault();
      const url = normUrl(k.url.value);
      if (!k.name.value.trim() || !url) { toast('Name und Adresse sind Pflicht.', 'bad'); return; }
      const urlChanged = ex && url !== e.url;
      put('employers', { ...e, name: k.name.value.trim(), url, kind: k.kind.value, portalType: k.kind.value === 'portal' ? k.portalType.value : undefined, searchUrl: k.searchUrl.value.trim() || undefined, branche: k.branche.value.trim(), note: k.note.value.trim(), crawl: crawl.checked, baSearch: baSearch.checked || undefined, baName: baName.value.trim() || undefined,
        ...(urlChanged ? { oldUrl: e.url, urlStatus: 'von dir geändert', confirmedAt: undefined } : {}) });
      toast('Gespeichert', 'ok'); close(); after();
    } },
      field('Name', k.name), field('Adresse der Karriereseite', k.url), field('Art', k.kind),
      portalRow,
      field('Branche (Markierung)', k.branche, 'Branchen aus Info → Einstellungen → „Ausblenden“ werden in der Stellensuche ausgeblendet.'),
      field('Notiz', k.note), h('label', { class: 'check' }, crawl, 'Stellen automatisch abrufen'),
      h('div', null, h('label', { class: 'check' }, baSearch, 'Stellen über die Bundesagentur für Arbeit suchen (statt Karriereseite)'), h('p', { class: 'muted small' }, 'Für Firmen, deren Karriereseite den Abruf sperrt. Es erscheinen nur Stellen, die die Firma auch bei der Bundesagentur eingetragen hat.'), field('Firmenname bei der Bundesagentur (optional)', baName)),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Speichern'), ex ? h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (await confirmDialog(`„${e.name}“ aus der Liste entfernen?`)) { del('employers', e.id); close(); after(); } } }, 'Entfernen') : null)));
    return h('div', null, body);
  }, { wide: true });
}

export function render(el) {
  const all = list('employers');
  const box = h('div');
  const qIn = input({ type: 'search', value: f.q, placeholder: 'Arbeitgeber suchen', 'aria-label': 'Arbeitgeber suchen' });
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Art' }, [['alle', 'Alle'], ['arbeitgeber', 'Arbeitgeber'], ['dienstleister', 'Dienstleister'], ['portal', 'Portale'], ['pruefen', 'Prüfen']].map(([k, l]) =>
    h('button', { type: 'button', 'aria-pressed': String(f.kind === k), onclick: ev => { f.kind = k; lsSet('jobsuche.empview', f); [...seg.children].forEach(b => b.setAttribute('aria-pressed', String(b === ev.currentTarget))); draw(); } }, l)));
  const needsCheck = e => { const t = testOf(e.id); return e.crawl !== false && e.kind !== 'portal' && (isStale(e, t) || e.urlStatus === 'unsicher' || (t && ['fehler', 'blockiert', 'unsicher'].includes(t.status))); };
  function draw() {
    const q = f.q.toLowerCase();
    const rows = all.filter(e => (f.kind === 'alle' || (f.kind === 'pruefen' ? needsCheck(e) : e.kind === f.kind)) && (!q || (e.name + ' ' + hostOf(e.url)).toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    mount(box, rows.length ? rows.map(e => {
      const t = testOf(e.id);
      return h('button', { class: 'emp', type: 'button', onclick: () => openEmployer(e.id, () => render(el)) },
        h('div', { class: 'grow' }, h('div', { class: 'n' }, e.name), h('div', { class: 's' }, hostOf(e.url) + (e.branche ? ' · ' + e.branche : ''))),
        e.urlStatus === 'unsicher' && !t ? h('span', { class: 'pill warn' }, h('i'), 'Adresse prüfen') : null,
        t && isStale(e, t) ? h('span', { class: 'pill warn' }, h('i'), 'Adresse geändert') : t ? statusPill(t.status, t.message) : (e.kind === 'portal' ? null : h('span', { class: 'pill mute' }, h('i'), 'nicht geprüft')),
        countOf(e.id) ? h('span', { class: 'chip' }, countOf(e.id) + ' Stellen') : null);
    }) : emptyState('Keine Einträge', 'Mit „Hinzufügen“ trägst du einen Arbeitgeber oder ein Jobportal ein.'));
  }
  qIn.addEventListener('input', debounce(() => { f.q = qIn.value; lsSet('jobsuche.empview', f); draw(); }, 150));
  const tests = all.map(e => testOf(e.id)).filter(Boolean);
  mount(el,
    h('div', { class: 'row' }, h('h1', { class: 'grow', style: 'margin:0' }, 'Arbeitgeber'), h('button', { class: 'btn primary', type: 'button', onclick: () => openEmployer(null, () => render(el)) }, '+ Hinzufügen')),
    h('p', { class: 'muted' }, `${all.filter(e => e.kind !== 'portal').length} Arbeitgeber, ${all.filter(e => e.kind === 'portal').length} Portale` + (tests.length ? ` · ${tests.filter(t => t.status === 'ok').length} sicher erkannt, ${tests.filter(t => ['unsicher', 'fehler', 'blockiert'].includes(t.status)).length} zu prüfen` : '')),
    h('div', { class: 'filters' }, seg), h('div', { class: 'field' }, qIn), box);
  draw();
}
