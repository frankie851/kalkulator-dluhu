// Jednoduchá kontrola čtivosti českého textu: délka vět a nevysvětlené zkratky.
// Použití: node scripts/ctenost.mjs  (kontroluje index.html a texty v app.js)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const LIMITY = { prumer: 15, maximum: 25 };

// Vlastní jména a značky, které nejsou zkratky k vysvětlení.
const POVOLENA_VELKA = new Set(['POINT', 'POINTem']);
// Zkratky s tečkou, které by čtenář nemusel znát.
const ZKRATKY_S_TECKOU = ['Sb.', 'odst.', 'písm.', 'tzv.', 'apod.', 'atd.', 'např.', 'resp.', 'tj.', 'popř.', 'mj.'];

/** Viditelný text z HTML: bez skriptů, stylů a hlavičky; bloky oddělené novým řádkem. */
export function textZHtml(html) {
  return html
    .replace(/<head[\s\S]*?<\/head>/i, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<abbr\b[^>]*>[\s\S]*?<\/abbr>/gi, 'zkratka')
    .replace(/<\/(p|li|h[1-6]|dt|dd|summary|legend|label|button|a|title|th|td|div|section|article|aside|header|footer)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, ' ');
}

/** Řetězce z JavaScriptu, které vypadají jako věty pro čtenáře. */
export function textZJs(js) {
  const out = [];
  const re = /(['`])((?:\\.|(?!\1)[^\\])*?)\1/g;
  let m;
  while ((m = re.exec(js))) {
    const s = m[2].replace(/\$\{[^}]*\}/g, '123');
    if (/[a-záčďéěíňóřšťúůýž]{3,}\s+[a-záčďéěíňóřšťúůýž]{2,}/i.test(s) && /[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(s[0] ?? '')) {
      out.push(s);
    }
  }
  return out.join('\n');
}

export function vety(text) {
  return text
    .split(/\n+/)
    .flatMap((radek) => radek.split(/(?<=[.!?…:])\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ0-9„])/))
    .map((v) => v.replace(/\s+/g, ' ').trim())
    .filter((v) => /[a-záčďéěíňóřšťúůýž]/i.test(v));
}

export function slova(veta) {
  return veta.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
}

export function nevysvetleneZkratky(text) {
  const nalezy = new Set();
  for (const w of text.match(/\b[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{2,}[a-zé]*\b/g) ?? []) {
    if (!POVOLENA_VELKA.has(w)) nalezy.add(w);
  }
  for (const z of ZKRATKY_S_TECKOU) {
    const re = new RegExp(`(^|\\s|\\()${z.replace('.', '\\.')}(\\s|$|,)`);
    if (re.test(text)) nalezy.add(z);
  }
  return [...nalezy];
}

export function analyzuj(text) {
  const v = vety(text);
  const delky = v.map((x) => slova(x).length);
  const soucet = delky.reduce((a, b) => a + b, 0);
  return {
    pocetVet: v.length,
    prumer: v.length ? soucet / v.length : 0,
    nejdelsi: v.map((x, i) => ({ veta: x, slov: delky[i] })).sort((a, b) => b.slov - a.slov).slice(0, 5),
    prilisDlouhe: v.filter((x, i) => delky[i] > LIMITY.maximum),
    zkratky: nevysvetleneZkratky(text),
  };
}

export function nactiTextyWebu(koren = new URL('..', import.meta.url)) {
  const html = readFileSync(new URL('index.html', koren), 'utf8');
  const js = readFileSync(new URL('app.js', koren), 'utf8');
  return `${textZHtml(html)}\n${textZJs(js)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = analyzuj(nactiTextyWebu());
  console.log(`Vět: ${a.pocetVet}, průměr ${a.prumer.toFixed(1)} slova na větu (limit ${LIMITY.prumer}).`);
  console.log('Nejdelší věty:');
  for (const n of a.nejdelsi) console.log(`  ${n.slov} slov: ${n.veta}`);
  if (a.prilisDlouhe.length) console.log('Příliš dlouhé věty:', a.prilisDlouhe);
  if (a.zkratky.length) console.log('Nevysvětlené zkratky:', a.zkratky.join(', '));
  const ok = a.prumer <= LIMITY.prumer && !a.prilisDlouhe.length && !a.zkratky.length;
  console.log(ok ? 'Čtivost: v pořádku.' : 'Čtivost: nevyhovuje.');
  process.exit(ok ? 0 : 1);
}
