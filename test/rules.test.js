import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rules = JSON.parse(readFileSync(new URL('../rules.json', import.meta.url), 'utf8'));

test('rules.json má datum ověření', () => {
  assert.match(rules.overeno, /^\d{4}-\d{2}-\d{2}$/);
});

test('každá hodnota má popis, zdroj, odkaz do e-Sbírky a datum účinnosti', () => {
  for (const [rok, r] of Object.entries(rules.roky)) {
    assert.ok(['platné', 'neúplné'].includes(r.status), `${rok}: status`);
    for (const [klic, v] of Object.entries(r)) {
      if (!v || typeof v !== 'object') continue;
      const kde = `${rok}.${klic}`;
      assert.ok(v.popis, `${kde}: popis`);
      assert.match(v.zdroj, /(Sb\.|zákon|vyhláška)/i, `${kde}: zdroj`);
      assert.match(v.odkaz, /^https:\/\/e-sbirka\.gov\.cz\/sb\/\d{4}\/\d+$/, `${kde}: odkaz`);
      if (r.status === 'platné') {
        assert.ok(['number', 'string'].includes(typeof v.hodnota), `${kde}: hodnota`);
        assert.match(v.ucinnostOd, /^\d{4}-\d{2}-\d{2}$/, `${kde}: účinnost`);
      }
    }
  }
});

test('součty pro rok 2026 odpovídají ověřeným částkám', () => {
  const r = rules.roky['2026'];
  const soucet = r.zivotniMinimum.hodnota + r.normativniNajemne.hodnota + r.energetickyPausal.hodnota;
  assert.equal(soucet, 16590);
  assert.equal((soucet * r.nasobekHraniceDesetiny.hodnota) / 10, 31521);
  assert.equal((soucet * r.procentoDluznik.hodnota) / 100, 14101.5);
  const spravce = ((r.odmenaSpravceMesicne.hodnota + r.vydajeSpravceMesicne.hodnota) * (100 + r.dphProcenta.hodnota)) / 100;
  assert.equal(spravce, 1089);
});

test('rok 2027 je označen jako neúplný, dokud chybí normativní nájemné', () => {
  const r = rules.roky['2027'];
  assert.equal(r.status, 'neúplné');
  assert.equal(r.normativniNajemne.hodnota, null);
  assert.equal(r.zivotniMinimum.hodnota, 5500);
});
