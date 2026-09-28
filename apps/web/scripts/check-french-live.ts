/** Read-only evidence capture. Explicit invocation only; never part of CI.
 * Uses existing provider functions and budgets. No retries beyond their policy.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lookupFrenchTitle } from '../src/server/discover/french-title';
import { lookupFrenchIsbn } from '../src/server/discover/french-isbn';
import { bookEan } from '../src/server/integrations/bnf/identifiers';

const output = process.argv[2];
if (!output) throw new Error('Supply a new output directory; this command makes live read-only requests.');
const directory = resolve(output);
// Refuse to overwrite/re-run into an existing capture directory.
await mkdir(directory);
const titles = ['Les Cinq Terres', 'Ekhö', 'Les Légendaires'];
const startedAt = new Date().toISOString();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const requests: Array<Record<string, unknown>> = [];
const lookups: Array<Record<string, unknown>> = [];
let context = '';
function errorInfo(error: unknown, depth = 0): unknown {
  if (!(error instanceof Error)) return String(error);
  const extra = error as Error & { code?: string; status?: number };
  return { name: error.name, message: error.message, code: extra.code, status: extra.status,
    ...(error.cause && depth < 3 ? { cause: errorInfo(error.cause, depth + 1) } : {}) };
}
async function save() {
  await writeFile(join(directory, 'report.json'), JSON.stringify({ startedAt, recordedAt: new Date().toISOString(), commit, node: process.version, titles, requests, lookups }, null, 2) + '\n');
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  const target = new URL(url);
  if (target.protocol !== 'https:' || !['catalogue.bnf.fr', 'openlibrary.org'].includes(target.hostname) || (init?.method ?? 'GET') !== 'GET') {
    throw new Error('Capture permits only bibliographic provider GET requests');
  }
  const start = performance.now();
  const trace: Record<string, unknown> = { context, url, startedAt: new Date().toISOString() };
  requests.push(trace);
  const index = requests.length;
  try {
    const response = await originalFetch(input, init);
    Object.assign(trace, { status: response.status, contentType: response.headers.get('content-type'), finalUrl: response.url, headersMs: Math.round(performance.now() - start) });
    const read = response.text.bind(response);
    response.text = async () => {
      try {
        const body = await read();
        const file = `response-${index}.txt`;
        await writeFile(join(directory, file), body);
        Object.assign(trace, { bodyFile: file, bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex'), bodyMs: Math.round(performance.now() - start) });
        return body;
      } catch (error) {
        trace.bodyError = errorInfo(error);
        throw error;
      }
    };
    return response;
  } catch (error) {
    Object.assign(trace, { error: errorInfo(error), elapsedMs: Math.round(performance.now() - start) });
    throw error;
  }
};
try {
  for (const title of titles) {
    context = `${title}: title`;
    const start = performance.now();
    const record: Record<string, unknown> = { title, startedAt: new Date().toISOString() };
    lookups.push(record);
    try {
      const found = await lookupFrenchTitle(title);
      record.titleResult = found;
      record.titleMs = Math.round(performance.now() - start);
      const selected = found.results.find(edition => edition.ean && bookEan(edition.ean) === edition.ean);
      if (selected?.ean) {
        record.selected = selected;
        context = `${title}: ISBN ${selected.ean}`;
        const isbnStart = performance.now();
        try {
          const verified = await lookupFrenchIsbn(selected.ean);
          record.isbnResult = verified;
          record.comparison = verified ? {
            sameEan: verified.ean === selected.ean,
            sameSource: verified.source === selected.source,
            sameSourceId: verified.sourceId === selected.sourceId,
            sameTitle: verified.title === selected.title,
          } : { unavailable: true };
        } catch (error) { record.isbnError = errorInfo(error); }
        record.isbnMs = Math.round(performance.now() - isbnStart);
      } else record.isbnSkipped = 'No returned validated edition';
    } catch (error) {
      record.titleError = errorInfo(error);
      record.titleMs = Math.round(performance.now() - start);
      record.isbnSkipped = 'Title lookup failed; no returned edition to verify';
    }
    await save();
    console.log(JSON.stringify(record));
  }
} finally {
  globalThis.fetch = originalFetch;
  await save();
}
