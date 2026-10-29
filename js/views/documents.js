import { h, fmtBytes, fmtRel, downloadBlob } from '../util.js';
import { list, settings } from '../store.js';
import { sheet, toast, confirmDialog, field, textarea, select, emptyState, mount } from '../ui.js';
import { CATEGORIES, catLabel, MASTER, getMaster, setMaster, uploadDocument, openDocument, deleteDocument, downloadDocumentBlob } from '../files.js';
import { docxToText } from '../docs.js';
import * as dbx from '../dropbox.js';
import { openTailor } from './tailor.js';

function editMaster(key, label, redraw) {
  sheet(label, close => {
    const ta = textarea({ rows: 18, value: getMaster(key), placeholder: key === 'letter' ? 'Platzhalter: {{Firma}} {{Stelle}} {{Datum}} {{Ort}} {{Ansprechpartner}} {{Anrede}} {{Name}} {{Adresse}}' : 'Text hier einfügen oder aus einer Word-Datei übernehmen.' });
    const file = h('input', { type: 'file', accept: '.docx', 'aria-label': 'Word-Datei wählen', onchange: async e => {
      const f = e.target.files[0]; if (!f) return;
      try { ta.value = await docxToText(window.JSZip, await f.arrayBuffer()); toast('Text aus Word-Datei übernommen – bitte prüfen.', 'ok'); } catch (x) { toast('Word-Datei konnte nicht gelesen werden: ' + x.message, 'bad'); }
    } });
    return h('div', null, field('Text', ta), field('Aus Word-Datei (.docx) übernehmen', file, 'Nur der Text wird übernommen, die Formatierung nicht. Deine Original-Datei bleibt unverändert in der Dropbox.'),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { setMaster(key, ta.value); toast('Gespeichert', 'ok'); close(); redraw(); } }, 'Speichern'), h('button', { class: 'btn', type: 'button', onclick: close }, 'Abbrechen')));
  }, { wide: true });
}

function uploadSheet(redraw) {
  sheet('Dokument hochladen', close => {
    const cat = select(CATEGORIES, 'lebenslauf');
    const file = h('input', { type: 'file', multiple: true, 'aria-label': 'Dateien wählen' });
    const msg = h('p', { class: 'muted small', role: 'status' });
    return h('div', null, !dbx.isConnected() ? h('div', { class: 'banner bad' }, 'Dropbox ist nicht verbunden. Verbinde sie unter Info → Einstellungen.') : null,
      field('Kategorie', cat), field('Dateien', file), msg,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onclick: async ev => {
        const files = [...file.files]; if (!files.length) { toast('Bitte eine Datei wählen.', 'bad'); return; }
        ev.target.disabled = true; let ok = 0;
        for (const f of files) { msg.textContent = `Lade hoch: ${f.name} …`; try { await uploadDocument(f, cat.value); ok++; } catch (e) { toast(`${f.name}: ${e.message}`, 'bad'); } }
        ev.target.disabled = false; if (ok) { toast(`${ok} Datei(en) in der Dropbox abgelegt`, 'ok'); close(); redraw(); }
      } }, 'Hochladen')));
  });
}

export function render(el) {
  const docs = list('documents').sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
  const draw = () => render(el);
  const masters = MASTER.map(([k, l]) => {
    const t = getMaster(k);
    return h('div', { class: 'emp', role: 'button', tabindex: '0', onclick: () => editMaster(k, l, draw), onkeydown: e => { if (e.key === 'Enter') editMaster(k, l, draw); } },
      h('div', { class: 'grow' }, h('div', { class: 'n' }, l), h('div', { class: 's' }, t ? `${t.split(/\s+/).length} Wörter` : 'noch leer – hier hinterlegen')),
      h('span', { class: 'pill ' + (t ? 'ok' : 'mute') }, h('i'), t ? 'hinterlegt' : 'leer'));
  });
  const groups = CATEGORIES.map(([k, l]) => [k, l, docs.filter(d => d.category === k)]).filter(g => g[2].length);
  mount(el,
    h('div', { class: 'row' }, h('h1', { class: 'grow', style: 'margin:0' }, 'Dokumente'), h('button', { class: 'btn primary', type: 'button', onclick: () => uploadSheet(draw) }, '+ Hochladen')),
    h('p', { class: 'muted' }, 'Dateien liegen in deiner Dropbox unter „Jobsuche/Dokumente“, nicht im öffentlichen Programmcode.'),
    h('h2', null, 'Stammtexte'),
    h('p', { class: 'muted small' }, 'Aus diesen Texten entstehen die angepassten Unterlagen für eine konkrete Stelle.'),
    masters,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: () => openTailor({ title: '', company: '', text: '' }) }, 'Unterlagen für eine Stelle anpassen …')),
    h('h2', { style: 'margin-top:1.5rem' }, 'Dateien'),
    docs.length ? groups.map(([k, l, items]) => h('div', { style: 'margin-bottom:1rem' }, h('h3', null, l), items.map(d => h('div', { class: 'emp', style: 'cursor:default' },
      h('div', { class: 'grow' }, h('div', { class: 'n' }, d.name), h('div', { class: 's' }, fmtBytes(d.size) + ' · ' + fmtRel(d.uploadedAt))),
      h('button', { class: 'btn small', type: 'button', onclick: async () => { try { await openDocument(d); } catch (e) { toast(e.message, 'bad'); } } }, 'Öffnen'),
      h('button', { class: 'btn small', type: 'button', onclick: async () => { try { downloadBlob(await downloadDocumentBlob(d), d.name); } catch (e) { toast(e.message, 'bad'); } } }, 'Laden'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': d.name + ' löschen', onclick: async () => { if (await confirmDialog(`„${d.name}“ auch aus der Dropbox löschen?`)) { try { await deleteDocument(d); draw(); } catch (e) { toast(e.message, 'bad'); } } } }, '🗑'))))) :
      emptyState('Noch keine Dateien', 'Lade Lebenslauf, Zeugnisse und Zertifikate hoch, damit sie auf Handy und Laptop bereitliegen.', [h('button', { class: 'btn primary', type: 'button', onclick: () => uploadSheet(draw) }, 'Datei hochladen')]));
}
