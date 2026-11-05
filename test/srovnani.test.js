// Srovnání s úředními kalkulačkami Ministerstva spravedlnosti (uložené výsledky v rules.json).
// Hlídá, aby budoucí změny výpočtu nerozbily shodu s exekuce.justice.cz a insolvence.justice.cz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pravidlaProRok, srazka, oddluzeni } from '../dluhy.js';

const rules = JSON.parse(readFileSync(new URL('../rules.json', import.meta.url), 'utf8'));
const p = pravidlaProRok(rules, 2026);
const srovnani = rules.srovnaniSUredniKalkulackou;

test('srovnání má datum a adresy úředních kalkulaček', () => {
  assert.match(srovnani.datum, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(srovnani.exekuce.adresa, /^https:\/\/exekuce\.justice\.cz\//);
  assert.match(srovnani.oddluzeni.adresa, /^https:\/\/insolvence\.justice\.cz\//);
});

for (const c of srovnani.exekuce.pripady) {
  test(`exekuce.justice.cz: ${c.cistaMzda} Kč, ${c.osoby} osob, ${c.prednostni ? 'přednostní' : 'běžné'}, ${c.pocetExekuci} exekucí`, () => {
    const r = srazka(p, c);
    assert.equal(r.srazka, c.srazka);
    assert.equal(r.vericiDostanou, c.exekutorovi);
    assert.equal(r.nahradaZamestnavateli, c.nahrada);
    assert.equal(r.zustane, c.kVyplate);
  });
}

for (const c of srovnani.oddluzeni.pripady) {
  test(`insolvence.justice.cz: ${c.cistaMzda} Kč, ${c.osoby} osob`, () => {
    const o = oddluzeni(p, { cistaMzda: c.cistaMzda, osoby: c.osoby, dluh: 10_000_000 });
    assert.equal(o.splatka, c.splatka);
    assert.equal(o.zustane, c.kVyplate);
    assert.equal(o.splatka * o.delkaMesicu, c.za3roky);
  });
}
