import { h, uid, isoDay, fmtDate, daysBetween, nowIso } from '../util.js';
import { list, get, put, del, settings } from '../store.js';
import { sheet, toast, confirmDialog, field, input, textarea, select, appPill, APP_STATUS, EVENT_LABEL, emptyState, mount } from '../ui.js';
import { openTailor } from './tailor.js';

const today = () => isoDay(new Date());
export const lastActivity = a => (a.events || []).reduce((m, e) => (e.date && e.date > m ? e.date : m), a.appliedAt || '');
export function followUpState(a) {
  if (a.archive || !['gesendet', 'rueckmeldung'].includes(a.status)) return null;
  const [w1, w2] = settings().followUpWeeks || [6, 8];
  const days = daysBetween(lastActivity(a));
  if (days >= w2 * 7) return { level: 'overdue', weeks: Math.floor(days / 7) };
  if (days >= w1 * 7) return { level: 'due', weeks: Math.floor(days / 7) };
  return null;
}
const STATUS_BY_EVENT = { gesendet: 'gesendet', rueckmeldung: 'rueckmeldung', interview: 'interview', absage: 'absage', angebot: 'angebot' };
const RANK = { geplant: 0, gesendet: 1, rueckmeldung: 2, interview: 3, angebot: 4, absage: 5, zurueckgezogen: 5 };

export function openApplicationForm(pre = {}, onDone) {
  const ex = pre.id ? get('applications', pre.id) : null;
  const a = ex || { id: uid('app'), status: 'gesendet', appliedAt: today(), events: [], ...pre };
  const f = {
    company: input({ value: a.company || '' }), title: input({ value: a.title || '' }), url: input({ type: 'url', value: a.url || '', placeholder: 'https://…' }),
    appliedAt: input({ type: 'date', value: a.appliedAt || today() }), status: select(Object.entries(APP_STATUS).map(([k, v]) => [k, v[0]]), a.status),
    contact: input({ value: a.contact || '' }), notes: textarea({ value: a.notes || '', rows: 3 }),
  };
  sheet(ex ? 'Bewerbung bearbeiten' : 'Bewerbung anlegen', close => h('form', { onsubmit: e => {
    e.preventDefault();
    if (!f.company.value.trim() || !f.title.value.trim()) { toast('Firma und Stelle sind Pflicht.', 'bad'); return; }
    const events = a.events?.length ? a.events : [{ date: f.appliedAt.value, type: f.status.value === 'geplant' ? 'notiz' : 'gesendet', text: f.status.value === 'geplant' ? 'Bewerbung geplant' : 'Bewerbung abgeschickt' }];
    put('applications', { ...a, company: f.company.value.trim(), title: f.title.value.trim(), url: f.url.value.trim(), appliedAt: f.appliedAt.value, status: f.status.value, contact: f.contact.value.trim(), notes: f.notes.value, events });
    close(); toast('Gespeichert', 'ok'); onDone ? onDone() : location.hash.startsWith('#/bewerbungen') && window.dispatchEvent(new HashChangeEvent('hashchange'));
  } },
    field('Firma', f.company), field('Stelle', f.title), field('Link zur Anzeige', f.url),
    h('div', { class: 'grid2' }, field('Datum der Bewerbung', f.appliedAt), field('Status', f.status)),
    field('Ansprechpartner', f.contact), field('Notizen', f.notes),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Speichern'), h('button', { class: 'btn', type: 'button', onclick: close }, 'Abbrechen'))));
}

function openDetail(id, redraw) {
  const s = sheet('', (close, body) => {
    const paint = () => {
      const a = get('applications', id);
      if (!a) { close(); return; }
      const evs = [...(a.events || [])].sort((x, y) => (x.date || '9999').localeCompare(y.date || '9999'));
      const fu = followUpState(a);
      const d = { date: input({ type: 'date', value: today() }), type: select(Object.entries(EVENT_LABEL).filter(([k]) => k !== 'gesendet').map(([k, v]) => [k, v]), 'rueckmeldung'), text: input({ placeholder: 'Was wurde mitgeteilt?' }) };
      mount(body,
        h('h2', { style: 'margin-bottom:.1rem' }, a.company), h('p', { class: 'muted' }, a.title),
        h('div', { class: 'row' }, appPill(a.status), h('span', { class: 'muted small' }, 'beworben am ' + fmtDate(a.appliedAt)), a.archive ? h('span', { class: 'chip' }, 'Archiv ' + a.archive) : null),
        fu ? h('div', { class: 'banner', style: 'margin-top:.75rem' }, `Seit ${fu.weeks} Wochen keine Nachricht – ${fu.level === 'overdue' ? 'jetzt nachfragen' : 'bald nachfragen'}.`) : null,
        h('div', { class: 'btn-row' },
          a.url ? h('a', { class: 'btn small', href: a.url, target: '_blank', rel: 'noopener noreferrer' }, 'Anzeige öffnen') : null,
          h('button', { class: 'btn small', type: 'button', onclick: () => { close(); openApplicationForm(a, redraw); } }, 'Bearbeiten'),
          h('button', { class: 'btn small', type: 'button', onclick: () => openTailor({ title: a.title, company: a.company, url: a.url, text: a.jobText || '', applicationId: a.id }) }, 'Unterlagen anpassen'),
          h('button', { class: 'btn small danger', type: 'button', onclick: async () => { if (await confirmDialog(`Bewerbung bei ${a.company} löschen?`)) { del('applications', a.id); close(); redraw(); } } }, 'Löschen')),
        h('h3', { style: 'margin-top:1.25rem' }, 'Verlauf'),
        h('ul', { class: 'timeline' }, evs.map((e, i) => h('li', { class: 't-' + e.type },
          h('div', { class: 'd' }, (e.date ? fmtDate(e.date) : 'ohne Datum') + ' · ' + (EVENT_LABEL[e.type] || e.type)),
          h('div', null, e.text),
          h('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'Eintrag entfernen', onclick: () => { put('applications', { ...a, events: a.events.filter(x => !(x.date === e.date && x.text === e.text && x.type === e.type)) }); paint(); redraw(); } }, 'entfernen')))),
        h('h3', null, 'Neuer Eintrag'),
        h('form', { onsubmit: ev => {
          ev.preventDefault();
          if (!d.text.value.trim() && d.type.value === 'notiz') return;
          const event = { date: d.date.value, type: d.type.value, text: d.text.value.trim() || EVENT_LABEL[d.type.value] };
          const next = { ...a, events: [...(a.events || []), event] };
          const ns = STATUS_BY_EVENT[event.type];
          if (ns && (RANK[ns] >= RANK[a.status] || ns === 'absage')) next.status = ns;
          put('applications', next); paint(); redraw();
        } }, h('div', { class: 'grid2' }, field('Datum', d.date), field('Art', d.type)), field('Text', d.text), h('button', { class: 'btn primary', type: 'submit' }, 'Eintragen')),
        a.notes ? [h('h3', { style: 'margin-top:1rem' }, 'Notizen'), h('p', { style: 'white-space:pre-wrap' }, a.notes)] : null);
    };
    paint();
  }, { wide: true });
}

const flt = { f: 'aktiv', q: '' };
export function render(el) {
  const all = list('applications');
  const act = all.filter(a => !a.archive);
  const due = act.filter(followUpState);
  const stats = [
    ['Gesamt', all.length], ['Aktuell offen', act.filter(a => ['gesendet', 'rueckmeldung'].includes(a.status)).length],
    ['Gespräche', all.filter(a => ['interview', 'angebot'].includes(a.status)).length], ['Absagen', all.filter(a => a.status === 'absage').length],
  ];
  const withReply = all.filter(a => a.status !== 'gesendet' && a.status !== 'geplant').length;
  const box = h('div');
  const qIn = input({ type: 'search', placeholder: 'Firma oder Stelle suchen', value: flt.q, 'aria-label': 'Bewerbungen durchsuchen', oninput: e => { flt.q = e.target.value; draw(); } });
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter' }, [['aktiv', `Aktuell (${act.length})`], ['nachfassen', `Nachfassen (${due.length})`], ['archiv', 'Archiv'], ['alle', 'Alle']].map(([k, l]) =>
    h('button', { type: 'button', 'aria-pressed': String(flt.f === k), onclick: e => { flt.f = k; [...seg.children].forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); draw(); } }, l)));
  function draw() {
    const q = flt.q.toLowerCase();
    let rows = all.filter(a => flt.f === 'alle' || (flt.f === 'aktiv' && !a.archive) || (flt.f === 'archiv' && a.archive) || (flt.f === 'nachfassen' && followUpState(a)));
    if (q) rows = rows.filter(a => (a.company + ' ' + a.title).toLowerCase().includes(q));
    rows.sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)));
    mount(box, rows.length ? rows.map(a => {
      const fu = followUpState(a);
      return h('button', { class: 'emp', type: 'button', onclick: () => openDetail(a.id, draw) },
        h('div', { class: 'grow' }, h('div', { class: 'n' }, a.company), h('div', { class: 's' }, a.title)),
        fu ? h('span', { class: 'pill warn' }, h('i'), `nachfassen · ${fu.weeks} Wo.`) : null,
        appPill(a.status), h('span', { class: 'muted small' }, fmtDate(a.appliedAt)));
    }) : emptyState(all.length ? 'Nichts in diesem Filter' : 'Noch keine Bewerbungen', all.length ? '' : 'Lege eine Bewerbung an oder importiere deine Excel-Datei unter Info → Einstellungen → Daten.'));
  }
  mount(el,
    h('div', { class: 'row' }, h('h1', { class: 'grow', style: 'margin:0' }, 'Bewerbungen'), h('button', { class: 'btn primary', type: 'button', onclick: () => openApplicationForm({}, () => render(el)) }, '+ Neue Bewerbung')),
    h('div', { class: 'stats', style: 'margin-top:1rem' }, stats.map(([l, n]) => h('div', { class: 'stat' }, h('b', null, n), h('span', null, l))), due.length ? h('div', { class: 'stat due' }, h('b', null, due.length), h('span', null, 'Nachfassen fällig')) : null),
    all.length > 3 ? h('p', { class: 'muted small' }, `Rückmeldung auf ${withReply} von ${all.length} Bewerbungen (${Math.round(100 * withReply / all.length)} %).`) : null,
    h('div', { class: 'filters' }, seg), h('div', { class: 'field' }, qIn), box);
  draw();
}
