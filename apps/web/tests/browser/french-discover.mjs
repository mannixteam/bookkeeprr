// Isolated browser test: render the production panels; no app server or live API.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import tailwind from '@tailwindcss/postcss';

const postcss = createRequire(import.meta.resolve('@tailwindcss/postcss'))('postcss');
const source = 'src/app/globals.css';
const { css } = await postcss([tailwind()]).process(await readFile(source, 'utf8'), { from: source });
const bundle = await build({
  stdin: { contents: `import {createRoot} from 'react-dom/client';
    import {FrenchEditionDiscovery} from './src/app/(app)/discover/FrenchEditionDiscovery';
    createRoot(document.querySelector('main')).render(<FrenchEditionDiscovery/>);`,
    loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, write: false, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
});
const browser = await chromium.launch({ channel: 'chrome' });
try {
  console.log('Browser:', browser.version());
  for (const [width, height] of [[1440, 900], [768, 1024]]) {
    for (const scenario of ['original', 'supplement']) {
    const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
    try {
      const page = await ctx.newPage();
      const origin = 'http://discover.test';
      const ean = '9780306406157';
      const candidate = { title: 'Mirage', ean, language: 'fr', source: 'openlibrary',
        sourceId: '/books/OL1M', sourceUrl: 'https://openlibrary.org/books/OL1M', attribution: 'Open Library' };
      const fresh = { ...candidate, title: 'Titre fraîchement vérifié', source: 'bnf',
        sourceId: 'ark:/12148/cb99999999x', sourceUrl: 'https://catalogue.bnf.fr/ark:/12148/cb99999999x',
        attribution: 'Bibliothèque nationale de France' };
      const retained = { ...fresh, title: 'Mirage — édition BnF conservée',
        sourceId: 'ark:/12148/cb12345678x', sourceUrl: 'https://catalogue.bnf.fr/ark:/12148/cb12345678x' };
      const supplemental = { ...candidate, title: retained.title, ean: '9782723488525' };
      const posts = [], unexpected = [];
      let titleReads = 0;
      let checks = 0, profileReads = 0;
      await ctx.route('**/*', async route => {
        const req = route.request(), key = req.method() + ' ' + req.url().slice(origin.length);
        if (req.url().startsWith(origin + '/')) {
          switch (key) {
            case 'GET /': return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="fr"><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><main></main><script src="/app.js"></script></html>' });
            case 'GET /app.js': return route.fulfill({ contentType: 'application/javascript', body: bundle.outputFiles[0].text });
            case 'GET /app.css': return route.fulfill({ contentType: 'text/css', body: css });
            case 'GET /api/discover/french-title?title=Mirage':
              titleReads++;
              return route.fulfill({ json: scenario === 'original'
                ? { coverage: 'bounded', supplement: 'succeeded', source: 'openlibrary', results: [candidate] }
                : titleReads === 1
                  ? { coverage: 'bounded', supplement: 'failed', source: 'bnf', results: [retained] }
                  : { coverage: 'bounded', supplement: 'succeeded', source: 'mixed', results: [retained, supplemental] } });
            case 'GET /api/discover/french-isbn?isbn=' + ean:
              return ++checks === 2 ? route.fulfill({ status: 502, json: { error: 'Indisponible' } }) : route.fulfill({ json: { result: fresh } });
            case 'GET /api/quality-profiles':
              profileReads++;
              return route.fulfill({ json: [{ id: 7, name: 'BD FR' }, { id: 8, name: 'Archives FR' }] });
            case 'POST /api/discover/french-isbn':
              posts.push(req.postDataJSON());
              return route.fulfill({ json: { id: 42, created: false } });
          }
        }
        unexpected.push(req.method() + ' ' + req.url()); return route.abort();
      });
      await page.goto(origin);
      const key = k => page.keyboard.press(k);
      async function tabTo(locator) {
        await locator.waitFor();
        for (let i = 0; i < 24; i++) {
          if (await locator.evaluate(el => el === document.activeElement)) break;
          await key('Tab');
        }
        await expect(locator).toBeFocused();
        assert(await locator.evaluate(el => {
          const r = el.getBoundingClientRect(), s = getComputedStyle(el);
          return el.matches(':focus-visible') && (s.outlineStyle !== 'none' || s.boxShadow !== 'none') &&
            r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth && r.bottom > 0 && r.top < innerHeight;
        }), 'focused control must be visibly reachable');
      }
      const button = name => page.getByRole('button', { name, exact: true });
      await tabTo(page.locator('summary').first()); await key('Enter');
      await tabTo(page.getByLabel('Titre de l’édition')); await page.keyboard.type('Mirage'); await key('Enter');
      const verify = button('Vérifier cet ISBN avant ajout'), add = button('Ajouter cette édition');
      if (scenario === 'supplement') {
        const warning = page.getByRole('alert');
        await expect(warning).toContainText('Complément Open Library indisponible');
        await expect(warning).toContainText('seules les éditions BnF vérifiées');
        await expect(warning).toContainText('Réessayez');
        await warning.scrollIntoViewIfNeeded();
        await expect(warning).toBeInViewport({ ratio: 1 });
        assert(await warning.evaluate(el => el.scrollWidth <= el.clientWidth), 'warning must wrap');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const list = page.getByRole('list', { name: 'Éditions françaises trouvées' });
        await expect(list.getByRole('listitem')).toHaveCount(1);
        await expect(list).toContainText(retained.title);
        await expect(list).toContainText(ean);
        await expect(list.getByRole('link')).toHaveAttribute('href', retained.sourceUrl);
        assert.equal(checks, 0); assert.deepEqual(posts, []);
        await tabTo(verify); await key('Enter');
        const isbnPanel = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Édition française par ISBN' }) });
        await expect(isbnPanel.getByText(fresh.title)).toBeVisible();
        await expect(isbnPanel.getByRole('link', { name: fresh.attribution })).toHaveAttribute('href', fresh.sourceUrl);
        await expect(page.getByLabel('ISBN', { exact: true })).toHaveValue(ean);
        await expect(add).toBeEnabled();
        assert.equal(checks, 1); assert.equal(profileReads, 1); assert.deepEqual(posts, []);
        await tabTo(button('Rechercher les éditions')); await key('Enter');
        await expect(list.getByRole('listitem')).toHaveCount(2);
        await expect(warning).toHaveCount(0);
        const rows = list.getByRole('listitem');
        for (const [index, edition] of [retained, supplemental].entries()) {
          await expect(rows.nth(index)).toContainText(edition.title);
          await expect(rows.nth(index)).toContainText('Français · ISBN ' + edition.ean);
          await expect(rows.nth(index).getByRole('link', { name: edition.attribution })).toHaveAttribute('href', edition.sourceUrl);
        }
        await expect(page.getByRole('status')).toContainText('2 édition(s) affichée(s) — résultats non exhaustifs');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.equal(titleReads, 2); assert.equal(checks, 1);
        assert.deepEqual(posts, []); assert.deepEqual(unexpected, []);
        console.log('PASS', width, height, 'partial warning, keyboard BnF selection, fresh ISBN, no automatic POST, mixed retry, source/ISBN order');
        continue;
      }
      await tabTo(verify); await key('Enter'); await expect(page.getByText(fresh.title)).toBeVisible();
      await expect(add).toBeEnabled();
      await tabTo(verify); await key('Enter'); await expect(page.getByText('Indisponible')).toBeVisible();
      await expect(add).toHaveCount(0); await expect(page.getByLabel('Profil de qualité')).toHaveCount(0);
      await expect(page.getByText(fresh.title)).toHaveCount(0);
      await tabTo(verify); await key('Enter'); await expect(page.getByText(fresh.title)).toBeVisible();
      await expect(page.getByRole('link', { name: fresh.attribution })).toHaveAttribute('href', fresh.sourceUrl);
      const profile = page.getByLabel('Profil de qualité');
      await tabTo(profile); await key('ArrowDown'); await expect(profile).toHaveValue('8');
      await tabTo(add); assert.deepEqual(posts, []);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await key('Enter');
      await expect(page.getByRole('link', { name: 'Voir dans la bibliothèque' })).toHaveAttribute('href', '/library/42');
      assert.deepEqual(posts, [{ isbn: ean, source: fresh.source, sourceId: fresh.sourceId, qualityProfileId: 8 }]);
      assert.equal(checks, 3); assert.equal(profileReads, 2); assert.deepEqual(unexpected, []);
      console.log('PASS', width, height, 'keyboard, layout, fresh lookup, failed recheck, retry, explicit POST');
    } finally { await ctx.close(); }
    }
  }
} finally { await browser.close(); }
