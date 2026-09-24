import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBookIdentifier, bookEan, extractBookIdentifiers } from '../src/server/integrations/bnf/identifiers.ts';
import { dedupeResults } from '../src/server/discover/merge.ts';

test('normalizes hyphenated ISBN-13', () => {
  assert.equal(normalizeBookIdentifier('ISBN-13: 978-2-7234-8852-5'), '9782723488525');
});
test('rejects a wrong ISBN-13 check digit', () => {
  assert.equal(normalizeBookIdentifier('9782723488524'), null);
});
test('converts ISBN-10 to the same edition EAN', () => {
  assert.equal(bookEan('0-306-40615-2'), '9780306406157');
});
test('supports uppercase and lowercase X in ISBN-10', () => {
  assert.equal(normalizeBookIdentifier('080442957x'), '080442957X');
  assert.equal(bookEan('080442957X'), '9780804429573');
});
test('rejects non-book EANs and malformed identifiers', () => {
  for (const raw of ['4006381333931', '0804429570', '97827234885250', '978X723488525', '']) {
    assert.equal(normalizeBookIdentifier(raw), null, raw);
  }
});
test('extracts an ISBN from catalog prose with price', () => {
  assert.deepEqual(extractBookIdentifiers(['ISBN 978-2-7234-8852-5 (br.) : 7,20 EUR']), {
    isbn: '9782723488525', ean: '9782723488525',
  });
});
test('skips invalid identifiers before the valid edition', () => {
  assert.equal(extractBookIdentifiers(['9782723488524', '9782723488525']).ean, '9782723488525');
});
test('does not combine unrelated ISBN and EAN fields', () => {
  assert.deepEqual(extractBookIdentifiers(['0-306-40615-2', '9782723488525']), {
    isbn: '0306406152', ean: '9780306406157',
  });
});
test('extracts adjacent identifiers without concatenating them', () => {
  assert.equal(extractBookIdentifiers(['9782723488525 9780306406157']).ean, '9782723488525');
});
const row = (source, author, sourceId) => ({
  contentType: 'comic', source, author, sourceId, title: 'Sacrifice', inLib: false, detail: null,
});
test('keeps French editions apart from original ComicVine runs', () => {
  const rows = dedupeResults([row('bnf', 'Urban Comics', 'ark:1'), row('comicvine', 'Image', '42')]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].source, 'bnf');
});
test('preserves same-titled French series from different publishers', () => {
  assert.equal(dedupeResults([row('bnf', 'Urban Comics', 'ark:1'), row('bnf', 'Delcourt', 'ark:2')]).length, 2);
});
test('deduplicates repeated BnF results for one publisher', () => {
  assert.equal(dedupeResults([row('bnf', 'Urban Comics', 'ark:1'), row('bnf', 'Urban Comics', 'ark:1')]).length, 1);
});
