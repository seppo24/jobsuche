import { h, fmtBytes, fmtRel, downloadBlob } from '../util.js';
import { list, settings, put } from '../store.js';
import { sheet, toast, confirmDialog, field, input, textarea, select, emptyState, mount } from '../ui.js';
import { CATEGORIES, catLabel, MASTER, getMaster, setMaster, uploadDocument, openDocument, deleteDocument, downloadDocumentBlob } from '../files.js';
import { docxToText, callClaude, callClaudeVision } from '../docs.js';
import { pageTexts, segment, sortSegments, splitPdf, segmentName, analyzeZeugnis, textOfFile, ocrPages, NOTEN, noteText } from '../zeugnis.js';
import * as dbx from '../dropbox.js';
import { openTailor, aiKey } from './tailor.js';

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


const noteClass = n => n == null ? 'mute' : n <= 2.5 ? 'ok' : n <= 3.5 ? 'info' : n <= 4.5 ? 'warn' : 'bad';
const fmtNote = n => n == null ? '–' : n.toFixed(1).replace('.', ',');

/** Zeugnis bewerten (KI, sonst nur Zufriedenheitsformel) und am Dokument speichern. */
async function analyzeDoc(doc, text, { keepText = false } = {}) {
  if (!text || text.replace(/\s+/g, '').length < 60) throw new Error('Im Dokument ließ sich kein Text lesen (Scan oder Foto?).');
  let a;
  try { a = await analyzeZeugnis({ text, employer: doc.employer, apiKey: aiKey(), model: settings().ai?.model || 'claude-sonnet-5-5', callClaude }); }
  catch (e) { a = { ...(await analyzeZeugnis({ text, employer: doc.employer })), fehler: e.message }; }
  put('documents', { ...doc, analysis: a, text: keepText ? text.slice(0, 12000) : doc.text });
  return a;
}

const scanned = pages => pages.every(t => t.replace(/\s+/g, '').length < 30);
async function ocrFile(buf, onProgress) {
  if (!aiKey()) throw new Error('Für Scans braucht die App den KI-Zugang (Info → Einstellungen → KI): Die KI liest den Text vom Bild ab.');
  return ocrPages({ buf, apiKey: aiKey(), model: settings().ai?.model || 'claude-sonnet-5-5', callVision: callClaudeVision, onProgress });
}

function analysisSheet(d, redraw) {
  const a = d.analysis;
  sheet('Bewertung: ' + (d.employer ? d.employer + (d.year ? ' (' + d.year + ')' : '') : d.name), close => {
    const list2 = (title, items) => items && items.length ? [h('h3', null, title), h('ul', null, items.map(x => h('li', null, x)))] : null;
    return h('div', null,
      !a ? h('p', null, 'Dieses Zeugnis wurde noch nicht bewertet.') : [
        h('div', { class: 'row' }, h('span', { class: 'pill ' + noteClass(a.note), style: 'font-size:1.3rem;padding:.3rem .8rem' }, h('i'), 'Note ' + fmtNote(a.note)), h('span', { class: 'muted' }, noteText(a.note)), a.sicherheit ? h('span', { class: 'chip' }, 'Sicherheit: ' + a.sicherheit) : null, h('span', { class: 'chip' }, a.quelle === 'KI' ? 'KI-Einschätzung' : 'nur Zufriedenheitsformel')),
        a.fehler ? h('div', { class: 'banner bad' }, 'KI-Bewertung fehlgeschlagen: ' + a.fehler + ' – angezeigt ist nur die Formel-Note.') : null,
        a.fazit ? h('p', { style: 'margin-top:.75rem' }, a.fazit) : null,
        a.formel ? h('p', { class: 'muted small' }, `Zufriedenheitsformel im Text: „${a.formel}“ (${fmtNote(a.formelNote)})`) : null,
        a.einzel && a.einzel.length ? [h('h3', null, 'Einzelbewertungen'), h('ul', { class: 'checks' }, a.einzel.map(e => h('li', null, h('span', { class: 'pill ' + noteClass(e.note), style: 'margin-right:.5rem' }, h('i'), fmtNote(e.note)), h('b', null, e.bereich), e.beleg ? h('div', { class: 'muted small' }, '„' + e.beleg + '“') : null)))] : null,
        a.auffaelligkeiten && a.auffaelligkeiten.length ? [h('h3', null, 'Auffällige Formulierungen'), h('ul', null, a.auffaelligkeiten.map(x => h('li', null, h('i', null, '„' + x.stelle + '“'), ' – ', x.bedeutung)))] : null,
        list2('Stärken', a.staerken), list2('Schwächen', a.schwaechen), list2('Fehlt im Zeugnis', a.fehlend)],
      h('h3', null, 'Notensystem'),
      h('table', { style: 'width:100%;border-collapse:collapse;font-size:.9rem' }, NOTEN.map(([n, t, f]) => h('tr', { style: a && Math.round(a.note) === n ? 'font-weight:700;background:var(--info-soft)' : '' }, h('td', { style: 'padding:.25rem .5rem' }, String(n)), h('td', { style: 'padding:.25rem .5rem' }, t), h('td', { class: 'muted', style: 'padding:.25rem .5rem' }, '„' + f + '“')))),
      h('p', { class: 'muted small' }, 'Einschätzung durch KI auf Basis des Zeugnistextes – eine Orientierung, keine Rechtsberatung. Zeugnissprache ist mehrdeutig; bei wichtigen Entscheidungen lohnt eine zweite Meinung.'),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: async ev => {
        ev.target.disabled = true; ev.target.textContent = 'Bewerte …';
        try { let text = d.text || ''; let ocr = false; if (!text) { const blob = await downloadDocumentBlob(d); const f = new File([blob], d.name, { type: blob.type }); text = await textOfFile(f, { docxToText }); if (text.replace(/\s+/g, '').length < 60 && /\.pdf$/i.test(d.name)) { text = (await ocrFile(await f.arrayBuffer(), (i, n) => { ev.target.textContent = `Lese Scan (Seite ${i} von ${n}) …`; })).join('\n'); ocr = true; } } await analyzeDoc(d, text, { keepText: ocr || !!d.text }); toast('Bewertung aktualisiert', 'ok'); close(); redraw(); } catch (e) { toast(e.message, 'bad'); ev.target.disabled = false; ev.target.textContent = a ? 'Erneut bewerten' : 'Jetzt bewerten'; }
      } }, a ? 'Erneut bewerten' : 'Jetzt bewerten')));
  }, { wide: true });
}

function splitSheet(file, buf, pages, redraw, { ocr = false } = {}) {
  const noText = scanned(pages);
  let segs = noText ? [{ from: 1, to: pages.length, employer: '', year: null, kind: 'Arbeitszeugnis' }] : segment(pages);
  sheet('Zeugnisse im PDF', close => {
    const box = h('div'), keep = h('input', { type: 'checkbox' }), ai = h('input', { type: 'checkbox', checked: true }), msg = h('p', { class: 'muted small', role: 'status' });
    const paint = () => {
      mount(box, segs.map((s, i) => {
        const emp = input({ value: s.employer || '', placeholder: 'Arbeitgeber', 'aria-label': 'Arbeitgeber' }), yr = input({ type: 'number', value: s.year || '', placeholder: 'Jahr', 'aria-label': 'Jahr' });
        const fr = input({ type: 'number', value: s.from, min: 1, max: pages.length, 'aria-label': 'Von Seite' }), to = input({ type: 'number', value: s.to, min: 1, max: pages.length, 'aria-label': 'Bis Seite' });
        const kind = select(['Arbeitszeugnis', 'Zwischenzeugnis'], s.kind || 'Arbeitszeugnis');
        const sync = () => { s.employer = emp.value.trim(); s.year = parseInt(yr.value, 10) || null; s.from = Math.max(1, parseInt(fr.value, 10) || 1); s.to = Math.min(pages.length, Math.max(s.from, parseInt(to.value, 10) || s.from)); s.kind = kind.value; };
        [emp, yr, fr, to, kind].forEach(x => x.addEventListener('change', sync));
        return h('div', { class: 'card flat', style: 'margin-bottom:.5rem' },
          h('div', { class: 'grid2' }, field('Arbeitgeber', emp), field('Jahr', yr)),
          h('div', { class: 'grid2' }, field('Seite von', fr), field('bis', to)), field('Art', kind),
          h('div', { class: 'row' }, h('span', { class: 'muted small grow' }, 'Datei: ' + segmentName(s) + (s.basis ? ` (Jahr nach: ${s.basis})` : '')), h('button', { class: 'btn small', type: 'button', onclick: () => { segs.splice(i, 1); paint(); } }, 'Entfernen')));
      }));
    };
    paint();
    return h('div', null,
      h('p', null, noText ? 'In diesem PDF ließ sich kein Text lesen (Scan). Ohne KI-Zugang kann die App den Scan nicht lesen – bitte die Abschnitte selbst eintragen oder unter Info → Einstellungen → KI den Zugang hinterlegen.' : `${segs.length} Zeugnis(se) erkannt${ocr ? ' (Text vom Scan durch die KI abgeschrieben)' : ''}, sortiert nach Jahr (neuestes zuerst). Bitte prüfen und bei Bedarf korrigieren – bei Scans besonders Arbeitgeber, Jahr und Seitengrenzen.`),
      box,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn small', type: 'button', onclick: () => { segs.push({ from: 1, to: pages.length, employer: '', year: null, kind: 'Arbeitszeugnis' }); paint(); } }, '+ Abschnitt')),
      h('label', { class: 'check' }, keep, 'Gesamtes PDF zusätzlich behalten'),
      h('label', { class: 'check' }, ai, 'Zeugnisse bewerten (Note, Auffälligkeiten) – der Zeugnistext wird dazu an Claude gesendet' + (aiKey() ? '' : ' (kein KI-Zugang hinterlegt: nur Note aus der Zufriedenheitsformel)')), msg,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', type: 'button', onclick: async ev => {
          ev.target.disabled = true; let ok = 0;
          try {
            segs = sortSegments(segs);
            const parts = await splitPdf(buf, segs);
            for (const p of parts) {
              msg.textContent = `Lade hoch: ${p.name} …`;
              const doc = await uploadDocument(new File([p.bytes], p.name, { type: 'application/pdf' }), 'arbeitszeugnisse', { employer: p.seg.employer, year: p.seg.year, note: `Seite ${p.seg.from}–${p.seg.to} des Sammel-PDFs` }); ok++;
              if (ai.checked) { msg.textContent = `Bewerte: ${p.seg.employer || p.name} …`; try { await analyzeDoc(doc, pages.slice(p.seg.from - 1, p.seg.to).join('\n'), { keepText: ocr }); } catch (e) { toast(`Bewertung ${p.seg.employer || p.name}: ${e.message}`, 'bad'); } }
            }
            if (keep.checked) await uploadDocument(file, 'arbeitszeugnisse', { note: 'Gesamtes PDF' });
            toast(`${ok} Zeugnis(se) abgelegt`, 'ok'); close(); redraw();
          } catch (e) { toast(e.message, 'bad'); ev.target.disabled = false; msg.textContent = ''; }
        } }, 'Aufteilen und speichern'),
        h('button', { class: 'btn', type: 'button', onclick: async () => { try { await uploadDocument(file, 'arbeitszeugnisse', { note: 'Gesamtes PDF' }); toast('Als eine Datei abgelegt', 'ok'); close(); redraw(); } catch (e) { toast(e.message, 'bad'); } } }, 'Nicht teilen, ganze Datei')));
  }, { wide: true });
}

function uploadSheet(redraw, preset) {
  sheet('Dokument hochladen', close => {
    const cat = select(CATEGORIES, preset || 'lebenslauf');
    const note = input({ placeholder: 'z. B. Firma, Zeitraum (2016–2020) oder „Zwischenzeugnis“' });
    const noteField = field('Bezeichnung (optional)', note, 'Hilft, mehrere Arbeitszeugnisse auseinanderzuhalten.');
    const syncNote = () => { noteField.style.display = cat.value === 'arbeitszeugnisse' ? '' : 'none'; }; cat.addEventListener('change', syncNote); syncNote();
    const file = h('input', { type: 'file', multiple: true, 'aria-label': 'Dateien wählen' });
    const msg = h('p', { class: 'muted small', role: 'status' });
    return h('div', null, !dbx.isConnected() ? h('div', { class: 'banner bad' }, 'Dropbox ist nicht verbunden. Verbinde sie unter Info → Einstellungen.') : null,
      field('Kategorie', cat), noteField, field('Dateien', file, cat.value === 'arbeitszeugnisse' ? 'Ein Sammel-PDF mit allen Zeugnissen wird automatisch nach Arbeitgeber und Jahr aufgeteilt (neuestes zuerst). Einzelne Zeugnisse als PDF, Foto oder Word gehen auch.' : ''), msg,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onclick: async ev => {
        const files = [...file.files]; if (!files.length) { toast('Bitte eine Datei wählen.', 'bad'); return; }
        if (cat.value === 'arbeitszeugnisse' && files.length === 1 && /\.pdf$/i.test(files[0].name)) { // Sammel-PDF: erkennen und aufteilen
          ev.target.disabled = true; msg.textContent = 'Lese das PDF …';
          try { const buf = await files[0].arrayBuffer(); let pages = await pageTexts(buf), ocr = false; if (pages.length > 1 && scanned(pages) && aiKey()) { pages = await ocrFile(buf, (i, n) => { msg.textContent = `Lese Scan mit KI … Seite ${i} von ${n}`; }); ocr = true; } if (pages.length > 1) { ev.target.disabled = false; msg.textContent = ''; close(); splitSheet(files[0], buf, pages, redraw, { ocr }); return; } } catch (e) { toast('PDF konnte nicht analysiert werden (' + e.message + ') – wird als eine Datei hochgeladen.', 'bad'); }
          ev.target.disabled = false;
        }
        ev.target.disabled = true; let ok = 0;
        for (const f of files) { msg.textContent = `Lade hoch: ${f.name} …`; try { const doc = await uploadDocument(f, cat.value, { note: cat.value === 'arbeitszeugnisse' ? note.value.trim() : '' }); ok++; if (cat.value === 'arbeitszeugnisse') { msg.textContent = `Bewerte: ${f.name} …`; try { let text = await textOfFile(f, { docxToText }), ocr = false; if (text.replace(/\s+/g, '').length < 60 && /\.pdf$/i.test(f.name)) { text = (await ocrFile(await f.arrayBuffer(), (i, n) => { msg.textContent = `Lese Scan mit KI … Seite ${i} von ${n}`; })).join('\n'); ocr = true; } await analyzeDoc(doc, text, { keepText: ocr }); } catch (e) { toast(`Bewertung ${f.name}: ${e.message}`, 'bad'); } } } catch (e) { toast(`${f.name}: ${e.message}`, 'bad'); } }
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
  const groups = CATEGORIES.map(([k, l]) => [k, l, docs.filter(d => d.category === k).sort((a, b) => k === 'arbeitszeugnisse' ? ((b.year || 0) - (a.year || 0) || (a.name || '').localeCompare(b.name || '', 'de')) : 0)]).filter(g => g[2].length);
  mount(el,
    h('div', { class: 'row' }, h('h1', { class: 'grow', style: 'margin:0' }, 'Dokumente'), h('button', { class: 'btn primary', type: 'button', onclick: () => uploadSheet(draw) }, '+ Hochladen')),
    h('p', { class: 'muted' }, 'Dateien liegen in deiner Dropbox unter „Jobsuche/Dokumente“, nicht im öffentlichen Programmcode.'),
    h('h2', null, 'Stammtexte'),
    h('p', { class: 'muted small' }, 'Aus diesen Texten entstehen die angepassten Unterlagen für eine konkrete Stelle.'),
    masters,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: () => openTailor({ title: '', company: '', text: '' }) }, 'Unterlagen für eine Stelle anpassen …')),
    h('h2', { style: 'margin-top:1.5rem' }, 'Dateien'),
    h('div', { class: 'btn-row', style: 'margin:0 0 .75rem' }, h('button', { class: 'btn', type: 'button', onclick: () => uploadSheet(draw, 'arbeitszeugnisse') }, 'Arbeitszeugnis hochladen')),
    docs.length ? groups.map(([k, l, items]) => h('div', { style: 'margin-bottom:1rem' }, h('h3', null, l), items.map(d => h('div', { class: 'emp', style: 'cursor:default' },
      h('div', { class: 'grow', style: d.category === 'arbeitszeugnisse' ? 'cursor:pointer' : '', onclick: d.category === 'arbeitszeugnisse' ? () => analysisSheet(d, draw) : null }, h('div', { class: 'n' }, d.name), h('div', { class: 's' }, (d.analysis ? 'Note ' + fmtNote(d.analysis.note) + ' · ' : '') + (d.year ? d.year + ' · ' : '') + (d.employer ? d.employer + ' · ' : '') + (d.note ? d.note + ' · ' : '') + fmtBytes(d.size) + ' · ' + fmtRel(d.uploadedAt))),
      d.category === 'arbeitszeugnisse' ? h('button', { class: 'btn small', type: 'button', title: 'Einschätzung der KI zum Zeugnis', onclick: () => analysisSheet(d, draw) }, d.analysis ? ['Note ', h('b', null, fmtNote(d.analysis.note))] : 'Bewerten') : null,
      h('button', { class: 'btn small', type: 'button', onclick: async () => { try { await openDocument(d); } catch (e) { toast(e.message, 'bad'); } } }, 'Öffnen'),
      h('button', { class: 'btn small', type: 'button', onclick: async () => { try { downloadBlob(await downloadDocumentBlob(d), d.name); } catch (e) { toast(e.message, 'bad'); } } }, 'Laden'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': d.name + ' löschen', onclick: async () => { if (await confirmDialog(`„${d.name}“ auch aus der Dropbox löschen?`)) { try { await deleteDocument(d); draw(); } catch (e) { toast(e.message, 'bad'); } } } }, '🗑'))))) :
      emptyState('Noch keine Dateien', 'Lade Lebenslauf, Zeugnisse und Zertifikate hoch, damit sie auf Handy und Laptop bereitliegen.', [h('button', { class: 'btn primary', type: 'button', onclick: () => uploadSheet(draw) }, 'Datei hochladen')]));
}
