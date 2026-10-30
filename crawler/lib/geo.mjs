// Entfernungen: eingebaute Ortsliste (NRW und Umgebung), sonst Nominatim (OpenStreetMap) mit Zwischenspeicher.
const PLACES = {
  'schwelm': [51.2867, 7.295], 'wuppertal': [51.2562, 7.1508], 'hagen': [51.3671, 7.4633], 'gevelsberg': [51.3189, 7.3412], 'ennepetal': [51.2986, 7.3544], 'breckerfeld': [51.2611, 7.4691],
  'sprockhoevel': [51.3517, 7.2514], 'sprockhövel': [51.3517, 7.2514], 'witten': [51.4435, 7.3528], 'bochum': [51.4818, 7.2162], 'herdecke': [51.3994, 7.4358], 'wetter': [51.3863, 7.3926], 'dortmund': [51.5136, 7.4653],
  'essen': [51.4556, 7.0116], 'velbert': [51.3395, 7.0436], 'heiligenhaus': [51.3262, 6.9696], 'ratingen': [51.2968, 6.8493], 'mettmann': [51.2506, 6.9779], 'hilden': [51.1711, 6.9372], 'haan': [51.1944, 7.0089],
  'solingen': [51.1652, 7.0671], 'remscheid': [51.1798, 7.1897], 'radevormwald': [51.2025, 7.3636], 'huckeswagen': [51.1522, 7.3414], 'wipperfuerth': [51.1176, 7.3977], 'wipperfürth': [51.1176, 7.3977],
  'hückeswagen': [51.1522, 7.3414], 'leverkusen': [51.0459, 6.9890], 'koeln': [50.9375, 6.9603], 'köln': [50.9375, 6.9603], 'duesseldorf': [51.2277, 6.7735], 'düsseldorf': [51.2277, 6.7735], 'neuss': [51.1980, 6.6916],
  'duisburg': [51.4344, 6.7623], 'muelheim': [51.4271, 6.8827], 'mülheim': [51.4271, 6.8827], 'oberhausen': [51.4963, 6.8638], 'gelsenkirchen': [51.5177, 7.0857], 'herne': [51.5380, 7.2257], 'recklinghausen': [51.6138, 7.1979],
  'castrop-rauxel': [51.5565, 7.3105], 'luenen': [51.6153, 7.5282], 'lünen': [51.6153, 7.5282], 'kamen': [51.5917, 7.6644], 'unna': [51.5348, 7.6890], 'holzwickede': [51.5035, 7.6288], 'schwerte': [51.4436, 7.5663],
  'iserlohn': [51.3753, 7.6970], 'luedenscheid': [51.2192, 7.6325], 'lüdenscheid': [51.2192, 7.6325], 'altena': [51.2977, 7.6679], 'werdohl': [51.2619, 7.7699], 'meinerzhagen': [51.1105, 7.6439], 'kierspe': [51.1327, 7.5937],
  'plettenberg': [51.2121, 7.8706], 'menden': [51.4393, 7.7935], 'hemer': [51.3836, 7.7686], 'arnsberg': [51.3969, 8.0587], 'soest': [51.5714, 8.1060], 'hamm': [51.6739, 7.8159], 'bergisch gladbach': [50.9923, 7.1327],
  'gummersbach': [51.0267, 7.5649], 'wiehl': [50.9467, 7.5404], 'engelskirchen': [50.9927, 7.4150], 'attendorn': [51.1260, 7.9080], 'olpe': [51.0287, 7.8498], 'siegen': [50.8748, 8.0243], 'bielefeld': [52.0302, 8.5325],
  'muenster': [51.9607, 7.6261], 'münster': [51.9607, 7.6261], 'aachen': [50.7753, 6.0839], 'moenchengladbach': [51.1805, 6.4428], 'mönchengladbach': [51.1805, 6.4428], 'krefeld': [51.3388, 6.5853], 'bonn': [50.7374, 7.0982],
  'lengerich': [52.1895, 7.8636], 'lippstadt': [51.6738, 8.3447], 'paderborn': [51.7189, 8.7575], 'kassel': [51.3127, 9.4797], 'frankfurt': [50.1109, 8.6821], 'stuttgart': [48.7758, 9.1829], 'muenchen': [48.1351, 11.5820],
  'münchen': [48.1351, 11.5820], 'hamburg': [53.5511, 9.9937], 'berlin': [52.52, 13.405], 'hannover': [52.3759, 9.732], 'friedrichshafen': [47.6540, 9.4800], 'ludwigsburg': [48.8975, 9.1920], 'bremen': [53.0793, 8.8017],
  'ennepe-ruhr': [51.3, 7.35], 'burscheid': [51.0875, 7.1175], 'wermelskirchen': [51.1411, 7.2020], 'langenfeld': [51.1100, 6.9486], 'monheim': [51.0910, 6.8890], 'dormagen': [51.0950, 6.8400], 'meerbusch': [51.2570, 6.5740],
  'kirchlengern': [52.1960, 8.6470], 'neuenrade': [51.2859, 7.7855], 'balve': [51.3361, 7.8631], 'herscheid': [51.1823, 7.7360],
};
export function haversine(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PLACE_RE = new RegExp('(?:^|[^a-zäöüß])(' + Object.keys(PLACES).sort((a, b) => b.length - a.length).map(esc).join('|') + ')(?=$|[^a-zäöüß])', 'gi');

/** Liefert { lat, lon, name } für den bekanntesten Ort im Text – oder null. */
export function lookupBuiltin(location) {
  const hits = [...String(location || '').matchAll(PLACE_RE)].map(m => m[1].toLowerCase());
  return hits.length ? hits.map(h => ({ name: h, c: PLACES[h] })) : null;
}

/** Ortstext säubern: Ländercodes, Klammern, „Hybrid/Remote“, mehrere Orte → Liste möglicher Orte. */
const FOREIGN = /\b(netherlands|niederlande|nederland|belgium|belgien|belgie|luxembourg|luxemburg|france|frankreich|italy|italien|spain|spanien|portugal|poland|polen|czech|tschechien|slovakia|slowakei|hungary|ungarn|romania|rum[aä]nien|bulgaria|bulgarien|serbia|serbien|croatia|kroatien|slovenia|slowenien|austria|[oö]sterreich|switzerland|schweiz|denmark|d[aä]nemark|sweden|schweden|norway|norwegen|finland|finnland|ireland|irland|united kingdom|great britain|england|scotland|uk|usa|united states|u\.s\.a|canada|kanada|mexico|mexiko|brazil|brasilien|argentina|argentinien|china|india|indien|japan|korea|singapore|singapur|thailand|vietnam|malaysia|indonesia|indonesien|turkey|t[uü]rkei|t[uü]rkiye|israel|egypt|[aä]gypten|south africa|s[uü]dafrika|australia|australien|uae|emirates|saudi|morocco|marokko|tunisia|tunesien|russia|russland|ukraine|greece|griechenland|estonia|estland|latvia|lettland|lithuania|litauen|philippines|philippinen|taiwan)\b/i;
export const isForeign = loc => FOREIGN.test(String(loc || '')) && !/\b(deutschland|germany)\b/i.test(String(loc || ''));

export function cleanLocation(loc) {
  return String(loc || '').replace(/\(.*?\)/g, ' ').replace(/\b(hybrid|remote|homeoffice|home office|mobil|vor ort|on-?site|deutschlandweit|bundesweit)\b/gi, ' ')
    .replace(/\bDE\s*[-–]\s*/g, '').replace(/,\s*(DE|DEU|Deutschland|Germany|Nordrhein-Westfalen|NRW|NW)\b/gi, '').replace(/\b\d{5}\b/g, ' ')
    .split(/\s*[;|•·\/]\s*|\s+und\s+|\s+oder\s+/i).map(x => x.replace(/\s+/g, ' ').trim()).filter(x => x.length > 2);
}

export async function distanceFor(location, home, cache, { fetchImpl = fetch, online = true } = {}) {
  if (!location) return null;
  const parts = cleanLocation(location);
  if (parts.length > 1 || (parts[0] && parts[0] !== String(location).trim())) {
    // jeden Teilort einzeln bewerten, der nächste zählt
    let best = null;
    for (const part of parts) { const d = await distanceFor(part, home, cache, { fetchImpl, online }); if (d != null && (best == null || d < best)) best = d; }
    if (best != null) return best;
  }
  const h = [home.lat, home.lon];
  const hits = lookupBuiltin(location);
  if (hits) return Math.min(...hits.map(x => haversine(h, x.c)));
  const key = location.trim().toLowerCase().slice(0, 80);
  if (cache[key] === null) return null;
  if (cache[key]) return haversine(h, cache[key]);
  if (!online) return null;
  try {
    await new Promise(r => setTimeout(r, 1100));
    const q = encodeURIComponent(location.replace(/\b\d{5}\b/, '').trim());
    const r = await fetchImpl(`https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=0&q=${q}`, { headers: { 'User-Agent': 'jobsuche-privat-app/1.0 (persoenliche Nutzung)', 'Accept-Language': 'de' } });
    const j = await r.json();
    const cands = (Array.isArray(j) ? j : []).filter(x => ['city', 'town', 'village', 'hamlet', 'suburb', 'municipality', 'administrative', 'locality', 'neighbourhood', 'quarter', 'borough', 'county'].includes(x.addresstype) || ['place', 'boundary'].includes(x.class));
    if (cands.length) { // bei mehrdeutigen Namen („Neustadt“) gilt der Ort, der am nächsten zum Wohnort liegt
      const best = cands.map(x => [+x.lat, +x.lon]).sort((a, b) => haversine(h, a) - haversine(h, b))[0];
      cache[key] = best; return haversine(h, best);
    }
    cache[key] = null;
  } catch { /* offline o. Ä. – später erneut */ }
  return null;
}
