# Exekuce, nebo oddlužení?

Statický web v češtině pro lidi s dluhy. Spočítá:

- kolik při exekuci zůstane z čisté mzdy a kolik se strhne,
- odhad doby splácení v exekuci (volitelně s úrokem z prodlení),
- jak by vypadalo oddlužení: splátka, délka a co se odpustí.

Na každé obrazovce je odkaz na bezplatnou pomoc. Web nemá reklamy, nic neukládá ani neodesílá.
Jediný síťový požadavek je načtení `rules.json` z téhož webu.

## Soubory

| Soubor | Co dělá |
|---|---|
| `dluhy.js` | čisté funkce výpočtu (bez DOM) |
| `rules.json` | parametry po letech; u každé hodnoty zdroj, odkaz do e‑Sbírky a datum účinnosti |
| `index.html`, `styles.css`, `app.js` | rozhraní |
| `test/` | testy pro `node --test` (výpočty, pravidla, obsah, čtivost) |
| `scripts/ctenost.mjs` | kontrola délky vět a nevysvětlených zkratek |
| `scripts/mobil.mjs` | kontrola v prohlížeči na šířce 360 px (Playwright) |

## Spuštění

```bash
node --test
```

```bash
python3 -m http.server 8000
```

Pak otevřete http://localhost:8000. Přímé otevření souboru (`file://`) nefunguje, protože prohlížeč nedovolí načíst `rules.json`.

```bash
node scripts/mobil.mjs
```

## Aktualizace pravidel na nový rok

1. Do `rules.json` doplňte normativní nájemné z nového sdělení ministerstva práce. Zkontrolujte i životní minimum a energetický paušál.
2. Ověřte, že se nezměnilo nařízení vlády č. 595/2006 Sb. (procento, násobek hranice).
3. Ověřte odměnu správce ve vyhlášce č. 313/2007 Sb. a úrok z prodlení (repo sazba ČNB k 1. 1. a 1. 7.).
4. Změňte `status` roku na `platné`, upravte `overeno` v `rules.json` a datum v patičce `index.html`.
5. Spusťte `node --test`.

Stav k 5. 11. 2026: rok 2027 je `neúplné`, protože normativní nájemné pro rok 2027 ještě nebylo vyhlášeno.

## Nasazení

Workflow `.github/workflows/pages.yml` při pushi do `main` spustí testy a nasadí web na GitHub Pages.
V nastavení repozitáře zvolte **Settings → Pages → Source: GitHub Actions**.
