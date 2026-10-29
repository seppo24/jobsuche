import { h, lsGet, lsSet, isoDay, downloadBlob, safeName, fmtDate } from '../util.js';
import { settings, get, put, list } from '../store.js';
import { sheet, toast, field, textarea, mount } from '../ui.js';
import { analyzeRequirements, fillTemplate, DEFAULT_LETTER, buildTailorPrompt, callClaude, parseSections, textToDocx } from '../docs.js';
import { getMaster, uploadDocument } from '../files.js';
import * as dbx from '../dropbox.js';

export const aiKey = () => lsGet('jobsuche.aikey', '');
export const setAiKey = k => lsSet('jobsuche.aikey', (k || '').trim());

/** Anpassungshelfer für eine konkrete Stelle. */
export function openTailor(job) {
  const s = settings(), p = s.profile;
  sheet('Unterlagen anpassen', (close, body) => {
    const cv = getMaster('cv');
    const jobText = textarea({ rows: 7, value: job.text || '', placeholder: 'Text der Stellenanzeige hier einfügen (Aufgaben & Profil). Je vollständiger, desto besser die Analyse.' });
    const note = textarea({ rows: 2, placeholder: 'Optional: Hinweis für die Anpassung, z. B. „Schwerpunkt auf Kundenprojekten betonen“' });
    const want = { cv: true, letter: true, motivation: false };
    const chk = (k, l) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: want[k], onchange: e => { want[k] = e.target.checked; } }), l);
    const analysis = h('div'), out = h('div'), status = h('p', { class: 'muted small', role: 'status' });
    const res = { cv: textarea({ rows: 12 }), letter: textarea({ rows: 14 }), motivation: textarea({ rows: 10 }), notes: textarea({ rows: 6 }) };

    const vars = () => ({ Firma: job.company || '', Stelle: job.title || '', Datum: fmtDate(isoDay(new Date())), Ort: p.ort || 'Schwelm', Name: p.name || '', Adresse: p.address || '', Ansprechpartner: '', Anrede: 'Sehr geehrte Damen und Herren,' });

    function analyze() {
      const r = analyzeRequirements(jobText.value, cv);
      mount(analysis, !jobText.value.trim() ? h('p', { class: 'muted small' }, 'Füge die Stellenbeschreibung ein, dann zeigt die App, welche Anforderungen in deinem Lebenslauf vorkommen.') :
        [h('h3', null, 'Anforderungen der Anzeige'), !cv ? h('p', { class: 'muted small' }, 'Hinterlege unter „Dokumente“ deinen Lebenslauf als Stammfassung, dann siehst du hier, was belegt ist und was fehlt.') : null,
         h('div', { class: 'req' }, r.map(x => h('span', { class: 'chip ' + (x.inCv === null ? 'na' : x.inCv ? 'have' : 'miss'), title: x.inCv === null ? '' : x.inCv ? 'kommt im Lebenslauf vor' : 'nicht im Lebenslauf gefunden' }, (x.inCv ? '✓ ' : x.inCv === false ? '✗ ' : '') + x.term))),
         r.length === 0 ? h('p', { class: 'muted small' }, 'Keine Standardbegriffe erkannt.') : null]);
    }
    function showResult(o) {
      for (const k of Object.keys(res)) if (o[k] !== undefined) res[k].value = o[k];
      mount(out, h('h3', null, 'Ergebnis'), want.cv ? field('Lebenslauf (angepasst)', res.cv) : null, want.letter ? field('Anschreiben', res.letter) : null, want.motivation ? field('Motivationsschreiben', res.motivation) : null, res.notes.value ? field('Hinweise', res.notes) : null,
        h('p', { class: 'muted small' }, 'Bitte alles prüfen und in deinen Worten schärfen, bevor du es abschickst.'),
        h('div', { class: 'btn-row' }, [['cv', 'Lebenslauf'], ['letter', 'Anschreiben'], ['motivation', 'Motivationsschreiben']].filter(([k]) => want[k]).map(([k, l]) => h('button', { class: 'btn', type: 'button', onclick: () => saveDocx(k, l) }, l + ' als Word-Datei'))));
    }
    async function saveDocx(k, label) {
      const text = res[k].value; if (!text.trim()) { toast('Das Feld ist leer.', 'bad'); return; }
      const blob = await textToDocx(window.JSZip, text);
      const name = safeName(`${label} ${job.company || ''} ${job.title || ''}`.trim().slice(0, 70)) + '.docx';
      downloadBlob(blob, name);
      if (dbx.isConnected()) { try { await uploadDocument(new File([blob], name, { type: blob.type }), 'bewerbungen'); toast('Heruntergeladen und in Dropbox abgelegt', 'ok'); } catch (e) { toast('Heruntergeladen. Ablage in Dropbox fehlgeschlagen: ' + e.message, 'bad'); } } else toast('Heruntergeladen');
    }
    const draftLocal = () => {
      const tpl = getMaster('letter') || DEFAULT_LETTER;
      showResult({ letter: fillTemplate(tpl, vars()), cv: want.cv ? (cv || '') : '', motivation: want.motivation ? fillTemplate(getMaster('motivation') || 'Motivationsschreiben zu {{Stelle}} bei {{Firma}}\n\n[Warum diese Aufgabe? Warum dieses Unternehmen? Was bringen Sie mit?]', vars()) : '', notes: 'Lokaler Entwurf aus deiner Vorlage – Platzhalter in eckigen Klammern selbst ausfüllen. Für einen automatisch angepassten Text brauchst du den KI-Zugang (Info → Einstellungen).' });
    };
    const prompt = () => buildTailorPrompt({ jobTitle: job.title, company: job.company, jobText: jobText.value, cvText: cv, letterTemplate: getMaster('letter'), motivationTemplate: getMaster('motivation'), want, profile: p, note: note.value });
    const copyPrompt = async () => { const { system, user } = prompt(); try { await navigator.clipboard.writeText(system + '\n\n' + user); toast('Anweisung kopiert – in Claude einfügen und das Ergebnis hier übernehmen.', 'ok'); } catch { toast('Kopieren nicht möglich', 'bad'); } };
    const withAi = async () => {
      if (!aiKey()) { toast('Kein KI-Zugang hinterlegt (Info → Einstellungen → KI).', 'bad'); return; }
      if (!cv) { toast('Bitte zuerst deinen Lebenslauf als Stammfassung unter „Dokumente“ hinterlegen.', 'bad'); return; }
      status.textContent = 'Claude arbeitet … das kann eine halbe Minute dauern.';
      try { const { system, user } = prompt(); const t = await callClaude({ apiKey: aiKey(), model: s.ai.model, system, user }); status.textContent = ''; showResult(parseSections(t)); }
      catch (e) { status.textContent = ''; toast(e.message, 'bad'); }
    };
    const pasteBack = () => {
      const ta = textarea({ rows: 10, placeholder: 'Antwort von Claude hier einfügen (mit ### LEBENSLAUF / ### ANSCHREIBEN …)' });
      sheet('Antwort übernehmen', c2 => h('div', null, ta, h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { showResult(parseSections(ta.value)); c2(); } }, 'Übernehmen'))));
    };
    jobText.addEventListener('input', analyze);

    mount(body,
      h('p', null, h('b', null, job.title || 'Stelle'), job.company ? ' · ' + job.company : '', job.url ? [' · ', h('a', { href: job.url, target: '_blank', rel: 'noopener noreferrer' }, 'Anzeige')] : null),
      field('Stellenbeschreibung', jobText), analysis,
      h('div', { class: 'row' }, chk('cv', 'Lebenslauf'), chk('letter', 'Anschreiben'), chk('motivation', 'Motivationsschreiben')),
      field('Hinweis (optional)', note),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', type: 'button', onclick: withAi }, 'Mit Claude anpassen'),
        h('button', { class: 'btn', type: 'button', onclick: draftLocal }, 'Entwurf aus Vorlage'),
        h('button', { class: 'btn', type: 'button', onclick: copyPrompt }, 'Anweisung kopieren'),
        h('button', { class: 'btn', type: 'button', onclick: pasteBack }, 'Antwort einfügen')),
      status, out);
    analyze();
  }, { wide: true });
}
