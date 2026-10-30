import { h, fmtRel, daysBetween, debounce, lsGet, lsSet, uid, nowIso } from '../util.js';
import { S, list, get, put, del, settings, setSettings } from '../store.js';
import { norm, parseQuery, matchTitle, excludedBy, synonymsFromText } from '../search.js';
import { toast, statusPill, emptyState, mount, input } from '../ui.js';
import { portals, searchUrl, canTrigger, triggerCrawl, watchForResult } from '../portals.js';
import { openTailor } from './tailor.js';
import { openApplicationForm } from './applications.js';

const PREF = 'jobsuche.jobsview';
const st = Object.assign({ q: null, emp: '', similar: true, near: false, fresh: false, saved: false, known: false, limit: 60 }, lsGet(PREF, {}));
const savePref = () => lsSet(PREF, { similar: st.similar, near: st.near, fresh: st.fresh, known: st.known });

export const NEW_DAYS = 7;
export const isNew = j => j.firstSeen && daysBetween(j.firstSeen) <= NEW_DAYS;

/** Sucht und filtert; liefert { rows, hidden, total }. */
export function searchJobs({ q, emp = '', similar = true, near = false, fresh = false, known = false, showHidden = false }) {
  const s = settings();
  const groups = synonymsFromText(s.synonymsText);
  const phrases = parseQuery(q);
  const emps = new Map(list('employers').map(e => [e.id, e]));
  const rows = []; let hidden = 0, total = 0;
  for (const j of S.jobs.jobs || []) {
    if (emp && j.employerId !== emp) continue;
    total++;
    const e = emps.get(j.employerId);
    if (!e || e.crawl === false) continue;
    const m = matchTitle(j.title, phrases, groups, similar, j.description || '');
    if (!m) continue;
    let reason = null;
    if (s.hide?.student && (reason = excludedBy(j, s.excludeStudent, j.meta))) reason = 'Ausbildung/Studium (' + reason + ')';
    else if (s.hide?.defence && (reason = excludedBy(j, s.excludeDefence, j.employer + ' ' + (j.meta || '')))) reason = 'Rüstung (' + reason + ')';
    else if (s.hide?.branche && e.branche && (s.hide.branchen || []).includes(e.branche)) reason = 'Branche ' + e.branche;
    if (reason && !showHidden) { hidden++; continue; }
    if (near && ((j.distanceKm != null && j.distanceKm > (s.profile.radiusKm || 50)) || j.foreign)) continue;
    if (known && j.distanceKm == null) continue;
    if (fresh && !isNew(j)) continue;
    rows.push({ job: j, match: m, emp: e, hiddenReason: reason });
  }
  rows.sort((a, b) => b.match.score - a.match.score || (a.job.distanceKm ?? 999) - (b.job.distanceKm ?? 999) || String(b.job.firstSeen).localeCompare(String(a.job.firstSeen)));
  return { rows, hidden, total };
}

export const savedFor = jobId => list('savedJobs').find(x => x.jobId === jobId);
export function toggleSave(j) {
  const ex = savedFor(j.id);
  if (ex) { del('savedJobs', ex.id); return false; }
  put('savedJobs', { id: 'sj-' + j.id, jobId: j.id, employerId: j.employerId, employer: j.employer, title: j.title, url: j.url, location: j.location || '', savedAt: nowIso() });
  return true;
}
export function jobText(j) {
  const sj = savedFor(j.id);
  return j.description || sj?.description || '';
}

const KIND_LABEL = { exakt: 'passt', aehnlich: 'ähnlich', verwandt: 'verwandt', teilweise: 'teilweise', alle: '' };

export function renderJobCard(r, rerender) {
  const { job: j, match: m, emp } = r;
  const saved = !!savedFor(j.id);
  const dist = j.distanceKm != null ? `${Math.round(j.distanceKm)} km` : null;
  return h('article', { class: 'job' + (saved ? ' saved' : '') },
    h('div', { class: 'ruler l-' + m.kind, 'aria-hidden': 'true' }),
    h('div', null,
      h('h3', null, h('a', { href: j.url, target: '_blank', rel: 'noopener noreferrer' }, j.title)),
      h('div', { class: 'meta' },
        h('span', null, j.employer || emp.name),
        j.location ? h('span', null, j.location + (dist ? ` · ${dist}` : '')) : (dist ? h('span', null, dist) : null),
        isNew(j) ? h('span', { class: 'chip new' }, 'neu') : null,
        j.foreign ? h('span', { class: 'chip' }, 'Ausland') : (!j.location ? h('span', { class: 'chip', title: 'Der Einsatzort ließ sich nicht erkennen – bitte in der Anzeige prüfen' }, 'Ort unbekannt') : null),
        m.kind !== 'alle' && m.kind !== 'exakt' ? h('span', { class: 'chip match', title: m.via ? `über „${m.via}“` : '' }, KIND_LABEL[m.kind] + (m.via ? `: ${m.via}` : '')) : null,
        j.stale ? h('span', { class: 'chip', title: 'Beim letzten Abruf nicht erreichbar – Stand von früher' }, 'älterer Stand') : null,
        r.hiddenReason ? h('span', { class: 'chip' }, 'normalerweise ausgeblendet: ' + r.hiddenReason) : null),
      h('div', { class: 'acts' },
        h('button', { class: 'icon-btn' + (saved ? ' on' : ''), type: 'button', 'aria-label': saved ? 'Nicht mehr merken' : 'Merken', 'aria-pressed': String(saved), title: saved ? 'Gemerkt' : 'Merken', onclick: () => { toast(toggleSave(j) ? 'Gemerkt' : 'Entfernt'); rerender(); } }, saved ? '★' : '☆'),
        h('a', { class: 'btn small', href: j.url, target: '_blank', rel: 'noopener noreferrer' }, 'Original öffnen'),
        h('button', { class: 'btn small', type: 'button', onclick: () => openApplicationForm({ company: j.employer || emp.name, title: j.title, url: j.url, employerId: j.employerId, jobId: j.id, location: j.location }) }, 'Bewerbung anlegen'),
        h('button', { class: 'btn small', type: 'button', onclick: () => openTailor({ title: j.title, company: j.employer || emp.name, url: j.url, text: jobText(j), jobId: j.id }) }, 'Unterlagen anpassen'))));
}

export function render(el, params = {}) {
  const s = settings();
  if (params.arbeitgeber !== undefined) { st.emp = params.arbeitgeber || ''; }
  if (st.q === null) st.q = (s.profile.queries || []).join(', ');
  const empList = list('employers').filter(e => e.kind !== 'portal' || e.portalType === 'ba').sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const listBox = h('div');
  const info = h('div');
  const fresh = S.jobs.generatedAt;

  const qIn = input({ type: 'search', value: st.q, placeholder: 'z. B. Projektleiter, Teamleiter', 'aria-label': 'Suchbegriffe', autocomplete: 'off', enterkeyhint: 'search' });
  const empSel = h('select', { 'aria-label': 'Arbeitgeber', onchange: e => { st.emp = e.target.value; st.limit = 60; draw(); } },
    h('option', { value: '' }, `Alle Arbeitgeber (${empList.filter(e => e.crawl !== false).length})`),
    empList.map(e => h('option', { value: e.id, selected: e.id === st.emp }, e.name + (e.branche ? ` · ${e.branche}` : ''))));
  const tg = (label, key, title) => {
    const b = h('button', { class: 'toggle', type: 'button', title, 'aria-pressed': String(!!st[key]), onclick: () => { st[key] = !st[key]; b.setAttribute('aria-pressed', String(!!st[key])); savePref(); st.limit = 60; draw(); } }, label);
    return b;
  };

  const hideTg = (label, key) => {
    const b = h('button', { class: 'toggle', type: 'button', 'aria-pressed': String(!!settings().hide[key]), onclick: () => { const hd = settings().hide; setSettings({ hide: { ...hd, [key]: !hd[key] } }); b.setAttribute('aria-pressed', String(!!settings().hide[key])); st.limit = 60; draw(); } }, label);
    return b;
  };
  function draw() {
    const { rows, hidden, total } = searchJobs(st);
    const shown = st.saved ? rows.filter(r => savedFor(r.job.id)) : rows;
    mount(info,
      !fresh ? h('div', { class: 'banner info' }, 'Es liegen noch keine abgerufenen Stellen vor. ', h('span', null, 'Sobald der automatische Abruf (GitHub Actions) einmal gelaufen ist, erscheinen sie hier. Bis dahin helfen die Portal-Suchlinks unten.')) : null,
      fresh ? h('p', { class: 'muted small' }, `${shown.length} Treffer von ${total} Stellen · Stand ${fmtRel(fresh)}`, st.emp && canTrigger() ? [' · ', h('button', { class: 'btn ghost small', type: 'button', onclick: async e => { e.target.disabled = true; try { await triggerCrawl(st.emp); watchForResult(() => { try { draw(); } catch { /* Ansicht gewechselt */ } }); toast('Abruf gestartet – dauert ca. 1–3 Minuten. Oben erscheint eine Meldung, sobald er fertig ist.', 'ok'); } catch (x) { toast(x.message, 'bad'); } e.target.disabled = false; } }, 'Diesen Arbeitgeber jetzt neu abrufen')] : null) : null,
      null);
    const part = shown.slice(0, st.limit);
    mount(listBox,
      part.map(r => renderJobCard(r, draw)),
      shown.length > st.limit ? h('button', { class: 'btn', type: 'button', onclick: () => { st.limit += 60; draw(); } }, `Weitere ${Math.min(60, shown.length - st.limit)} anzeigen`) : null,
      !shown.length && fresh ? emptyState('Keine Treffer', st.emp ? 'Bei diesem Arbeitgeber gibt es aktuell keine passende Stelle. Prüfe unter „Arbeitgeber“, ob die Karriereseite sicher erkannt wurde.' : 'Probiere andere Suchbegriffe oder schalte „Ähnliche Titel“ ein.') : null);
  }
  const redraw = debounce(() => { st.q = qIn.value; st.limit = 60; draw(); }, 200);
  qIn.addEventListener('input', redraw);

  const pl = portals(list('employers')).filter(p => p.portalType !== 'ba');
  const queries = parseQuery(st.q).length ? st.q.split(/,|;|\boder\b/i).map(x => x.trim()).filter(Boolean) : (s.profile.queries || []);
  const portalBox = h('details', { class: 'card flat' },
    h('summary', { style: 'cursor:pointer;font-weight:600' }, 'Weitere Jobportale durchsuchen'),
    h('p', { class: 'muted small', style: 'margin-top:.5rem' }, 'Stepstone, LinkedIn, Indeed und XING bieten keine freie Schnittstelle. Die Links öffnen die Suche mit deinen Begriffen und Ort/Umkreis direkt dort.'),
    pl.length ? pl.map(p => h('div', { class: 'row', style: 'margin-bottom:.4rem' }, h('b', { style: 'min-width:110px' }, p.name), queries.slice(0, 4).map(q => h('a', { class: 'btn small', target: '_blank', rel: 'noopener noreferrer', href: searchUrl(p, q, s.profile.ort || 'Schwelm', s.profile.radiusKm) }, q)))) : h('p', { class: 'muted' }, 'Keine Portale eingetragen (Arbeitgeber → Hinzufügen).'));

  mount(el,
    h('h1', null, 'Stellen'),
    h('div', { class: 'card' },
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Suche'), qIn), h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Arbeitgeber'), empSel)),
      h('div', { class: 'filters' }, tg('Ähnliche Titel', 'similar', 'Projektleiter findet auch Projektmanager usw.'), tg(`Umkreis ${s.profile.radiusKm || 50} km`, 'near', 'Nur Stellen im Umkreis um ' + s.profile.ort + ' (Stellen im Ausland fallen heraus)'), tg('Ort bekannt', 'known', 'Stellen ohne erkennbaren Einsatzort ausblenden'), tg(`Neu (${NEW_DAYS} Tage)`, 'fresh'), tg('★ Gemerkt', 'saved')),
      h('div', { class: 'filters', style: 'margin-top:-.5rem' }, h('span', { class: 'muted small' }, 'Ausblenden:'), hideTg('Ausbildung/Studium', 'student'), hideTg('Rüstung', 'defence'), hideTg('Automotive', 'branche'))),
    info, listBox, portalBox);
  draw();
}
