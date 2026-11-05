import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzuj, nactiTextyWebu, nevysvetleneZkratky, LIMITY } from '../scripts/ctenost.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const VYHRADA = 'Orientační výpočet. Závazně to posoudí poradna, exekutor nebo insolvenční soud.';

function sekce(id) {
  const m = html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`));
  assert.ok(m, `chybí obrazovka ${id}`);
  return m[0];
}

test('každá obrazovka má hned nahoře odkaz na bezplatnou pomoc', () => {
  for (const id of ['uvod', 'formular', 'vysledek', 'kroky']) {
    const s = sekce(id);
    const pruh = s.indexOf('class="pomoc-pruh"');
    const nadpis = s.indexOf('<h1');
    assert.ok(pruh > 0 && pruh < nadpis, `${id}: pruh s pomocí musí být nad nadpisem`);
    assert.match(s, /class="pomoc-odkaz" href="#pomoc"/);
  }
});

test('horní lišta s pomocí je přilepená a stránka obsahuje oficiální seznamy pomoci', () => {
  assert.match(html, /<header class="lista">[\s\S]*class="pomoc-odkaz" href="#pomoc"[\s\S]*<\/header>/);
  assert.match(css, /\.lista\s*\{[^}]*position:\s*sticky/);
  const pomoc = sekce('pomoc');
  assert.match(pomoc, /https:\/\/mpsv\.gov\.cz\/registr-poskytovatelu-sluzeb/);
  assert.match(pomoc, /https:\/\/sako\.justice\.cz/);
});

test('u každého výsledku je povinná věta o orientačním výpočtu', () => {
  const karty = sekce('vysledek').match(/<article[\s\S]*?<\/article>/g);
  assert.equal(karty.length, 2);
  for (const k of karty) assert.ok(k.includes(VYHRADA));
});

test('odkazy vedou jen na oficiální weby', () => {
  const povolene = [/\.justice\.cz$/, /^mpsv\.gov\.cz$/, /^e-sbirka\.gov\.cz$/, /^www\.ceecr\.cz$/, /^www\.ochrance\.cz$/];
  const hrefy = [...html.matchAll(/href="(https?:[^"]+)"/g)].map((m) => new URL(m[1]).hostname);
  assert.ok(hrefy.length > 5);
  for (const h of hrefy) assert.ok(povolene.some((re) => re.test(h)), `nepovolený odkaz: ${h}`);
});

test('nic se neukládá ani neodesílá', () => {
  assert.doesNotMatch(html, /<form[^>]*\baction=/i);
  assert.doesNotMatch(html, /<script[^>]*src="https?:/i);
  assert.doesNotMatch(html, /<link[^>]*href="https?:/i);
  for (const zdroj of [html, js]) {
    assert.doesNotMatch(zdroj, /localStorage|sessionStorage|indexedDB|document\.cookie|sendBeacon|XMLHttpRequest|WebSocket/);
  }
  const fetche = [...js.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert.deepEqual(fetche, ["'./rules.json'"]);
  assert.match(html, /form-action 'none'/);
});

test('žádné reklamy ani nabídky půjček', () => {
  const text = nactiTextyWebu().toLowerCase();
  for (const slovo of ['reklama', 'sponzor', 'affiliate', 'půjčíme', 'vyřízení úvěru', 'rychlá půjčka', 'konsolidac']) {
    assert.ok(!text.includes(slovo), `nevhodné slovo: ${slovo}`);
  }
  assert.doesNotMatch(html, /<iframe|<img[^>]*src="https?:/i);
});

test('čtivost: krátké věty a žádné nevysvětlené zkratky', () => {
  const a = analyzuj(nactiTextyWebu());
  assert.ok(a.prumer <= LIMITY.prumer, `průměrná věta má ${a.prumer.toFixed(1)} slov`);
  assert.deepEqual(a.prilisDlouhe, [], 'příliš dlouhé věty');
  assert.deepEqual(a.zkratky, [], 'nevysvětlené zkratky');
});

test('kontrola zkratek opravdu zkratky najde', () => {
  assert.deepEqual(nevysvetleneZkratky('Cena je včetně DPH.').sort(), ['DPH']);
  assert.deepEqual(nevysvetleneZkratky('Podle § 2 odst. 1 zákona.'), ['odst.']);
  assert.deepEqual(nevysvetleneZkratky('Bez zkratek tady nic není.'), []);
});

test('patička uvádí datum ověření shodné s rules.json', () => {
  const rules = JSON.parse(readFileSync(new URL('../rules.json', import.meta.url), 'utf8'));
  assert.match(html, new RegExp(`<time id="overeno" datetime="${rules.overeno}"`));
});

test('karta exekuce má místo pro poznámku k variantě úřední kalkulačky', () => {
  const karta = sekce('vysledek').match(/<article[\s\S]*?<\/article>/)[0];
  assert.match(karta, /id="v-poznamka-rok"/);
  assert.match(js, /upozorneniExekuce/);
});
