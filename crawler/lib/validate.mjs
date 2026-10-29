// Bewertet, wie sicher die Stellen einer Quelle erkannt wurden („Quellen-Test“). Reine Logik, ohne Netzwerk.

const ATS = /(successfactors|jobs2web|myworkdayjobs|workday|personio|smartrecruiters|greenhouse|lever\.co|recruitee|join\.com|softgarden|rexx-systems|rexx|talention|d-vinci|dvinci|umantis|onlyfy|teamtailor|jobvite|taleo|icims|phenom|jobs\.net|kenexa|brassring|workable|bamboohr|haufe|coveto|prescreen|hrworks|cornerstone|rmk|talentsoft|zohorecruit|jazzhr|ashby|breezy|pinpointhq|eightfold|avature|oraclecloud|jobvector|jobs\.[a-z0-9-]+\.[a-z]{2,3}$|karriere\.[a-z0-9-]+\.[a-z]{2,3}$|career\.[a-z0-9-]+\.[a-z]{2,3}$|careers\.[a-z0-9-]+\.[a-z]{2,3}$)/i;
const ROLE = /(\(?\b[mwdfgxi]\s*[\/|]\s*[mwdfgxi](\s*[\/|]\s*[mwdfgxi])?\b\)?|all genders|\bgn\b|ingenieur|manager|leiter|leitung|entwickl|techniker|monteur|konstrukt|mechaniker|mechatroniker|sachbearbeiter|referent|berater|engineer|specialist|assistent|projekt|ausbildung|praktik|werkstudent|fachkraft|einkäufer|einkaeufer|elektr|mitarbeiter|developer|technician|operator|head of|lead\b|director|buyer|controller|analyst|consultant|architect|spezialist|experte|expert|planer|disponent|meister|schlosser|fahrer|koordinator|trainee|vertrieb|sales|support|administrator|buchhalt|kaufmann|kauffrau|zerspan|bediener|helfer|bauleiter|polier|designer|tester|qualit|logistik|lager|fertigung|produktion|instandhalt|service|inbetriebnahme|verwaltung|junior|senior|intern\b|initiativ)/i;
const BLOCK = /(access denied|zugriff verweigert|just a moment|attention required|cloudflare|captcha|verify you are human|bot detection|datadome|unusual traffic|request blocked|pardon our interruption)/i;
const EMPTY = /(keine\s+(offenen\s+)?(stellen|stellenangebote|vakanzen|jobs)|zurzeit\s+keine|derzeit\s+keine|aktuell\s+keine|no\s+(open\s+)?(positions|vacancies|jobs)|currently\s+no\s+(open|vacan)|nothing\s+found|0\s+(stellen|jobs|treffer|ergebnisse))/i;

const rootDomain = h => h.split('.').slice(-2).join('.');
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

export function evaluate({ items = [], method = '', hint = null, httpStatus = 200, finalUrl = '', startUrl = '', text = '', error = '', pages = 1 }) {
  const checks = [];
  const add = (ok, t) => checks.push({ ok, text: t });
  const res = (status, confidence, message) => ({ status, confidence, message, checks, count: items.length, hint });

  if (error) { add(false, 'Seite nicht abrufbar: ' + error); return res('fehler', 'keine', error); }
  if (httpStatus >= 400) {
    if (BLOCK.test(text) || [403, 429, 503].includes(httpStatus)) { add(false, `Zugriff vom Server abgelehnt (HTTP ${httpStatus}) – vermutlich Bot-Schutz`); return res('blockiert', 'keine', `HTTP ${httpStatus}: Zugriff abgelehnt`); }
    add(false, `Seite nicht gefunden oder fehlerhaft (HTTP ${httpStatus})`);
    return res('fehler', 'keine', `HTTP ${httpStatus}`);
  }
  add(true, `Seite erreichbar (HTTP ${httpStatus})`);
  const moved = finalUrl && startUrl && (hostOf(finalUrl) !== hostOf(startUrl) || new URL(finalUrl).pathname.replace(/\/$/, '') !== new URL(startUrl).pathname.replace(/\/$/, ''));
  if (moved) add(null, `Weitergeleitet auf ${finalUrl}`);

  if (!items.length) {
    if (BLOCK.test(text) && text.length < 1500) { add(false, 'Seite zeigt eine Bot-Schutz-Abfrage'); return res('blockiert', 'keine', 'Bot-Schutz'); }
    if (EMPTY.test(text)) { add(true, 'Seite meldet ausdrücklich: aktuell keine offenen Stellen'); return res('leer', 'hoch', 'Keine offenen Stellen'); }
    add(false, 'Keine Stellenliste erkannt');
    if (hint) add(false, `Seite nennt etwa ${hint} Stellen – diese wurden nicht gefunden`);
    return res('unsicher', 'keine', hint ? `Seite nennt ~${hint} Stellen, aber keine erkannt` : 'Keine Stellen erkannt (evtl. dynamisch geladen, Login nötig oder keine Vakanzen)');
  }

  const titles = items.map(i => i.title);
  const unique = new Set(items.map(i => i.url)).size / items.length;
  const roleRatio = titles.filter(t => ROLE.test(t)).length / titles.length;
  const startHost = hostOf(startUrl || finalUrl);
  const same = items.filter(i => { const h = hostOf(i.url); return h && (rootDomain(h) === rootDomain(startHost) || ATS.test(h)); }).length / items.length;

  add(true, `${items.length} Stellen erkannt (${methodLabel(method)})${pages > 1 ? `, ${pages} Seiten durchsucht` : ''}`);
  add(unique > 0.95, unique > 0.95 ? 'Jede Stelle hat einen eigenen Link' : 'Mehrere Stellen teilen sich denselben Link');
  add(roleRatio >= 0.6, roleRatio >= 0.6 ? `${Math.round(roleRatio * 100)} % der Titel sehen wie Stellenbezeichnungen aus` : `Nur ${Math.round(roleRatio * 100)} % der Titel sehen wie Stellenbezeichnungen aus`);
  add(same >= 0.8, same >= 0.8 ? 'Links führen auf die Seite des Arbeitgebers oder sein Bewerbersystem' : 'Viele Links führen auf fremde Seiten');
  let hintOk = true;
  if (hint && hint > 0) {
    hintOk = items.length >= Math.min(hint, 1000) * 0.6;
    add(hintOk, hintOk ? `Seite nennt ~${hint} Stellen – passt zu den erkannten` : `Seite nennt ~${hint} Stellen, erkannt wurden nur ${items.length}`);
  }

  const structured = ['jsonld', 'successfactors', 'workday', 'ba'].includes(method);
  let confidence = structured ? 'hoch' : (items.length >= 2 && roleRatio >= 0.6 && unique > 0.95 && same >= 0.8) ? 'mittel' : 'niedrig';
  if (structured && (roleRatio < 0.4 || unique < 0.9)) confidence = 'mittel';
  const ok = (confidence === 'hoch' || confidence === 'mittel') && hintOk;
  return res(ok ? 'ok' : 'unsicher', confidence, ok ? '' : (!hintOk ? `Seite nennt ~${hint} Stellen, erkannt ${items.length}` : 'Erkennung unsicher – die Treffer wurden nicht übernommen. Bitte Stichprobe prüfen.'));
}

export function methodLabel(m) {
  return ({ jsonld: 'strukturierte Daten der Seite', successfactors: 'SuccessFactors-Jobliste', workday: 'Workday-Schnittstelle', ba: 'Schnittstelle der Bundesagentur für Arbeit', liste: 'wiederkehrende Listenstruktur' })[m] || m || 'unbekannt';
}
