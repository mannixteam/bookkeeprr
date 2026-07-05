import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVICE = 'bookkeeprr';

const here = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE_DIR = resolve(here, '../../fixtures/reader');
const SEED_SCRIPT = resolve(here, '../fixtures/reader-seed.cjs');

export type SeededReadable = { seriesId: number; volumeId: number; fileId: number };
export type ReaderSeed = {
  comic: SeededReadable;
  ebook: SeededReadable;
  audio: SeededReadable;
};

function docker(args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8' });
}

/**
 * Resolve the running bookkeeprr container's id. `docker compose cp` / `exec -w`
 * aren't supported by the podman-compose provider the harness uses, so we drop
 * to the raw container engine (`docker`/`podman` both implement `cp` + `exec`)
 * and address the container by the standard compose service label, which both
 * engines stamp on the container.
 */
function containerId(): string {
  const id = docker([
    'ps',
    '--filter',
    `label=com.docker.compose.service=${SERVICE}`,
    '--format',
    '{{.ID}}',
  ])
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  if (!id) throw new Error(`reader-seed: could not resolve the ${SERVICE} container id`);
  return id;
}

/**
 * Copy a host file into the running container's filesystem.
 *
 * NOT `docker cp`: the app container's /media and /config are tmpfs mounts,
 * and docker cp writes through the graph driver into the path the tmpfs
 * SHADOWS — the file lands invisibly under the mount and the app never sees
 * it (podman cp writes via the live mount namespace, which is why this only
 * broke on the dind CI). `exec cat` runs inside the mount namespace, so the
 * bytes land on the actual tmpfs.
 */
function cpInto(cid: string, hostPath: string, containerPath: string): void {
  execFileSync('docker', ['exec', '-i', cid, 'sh', '-c', `cat > '${containerPath}'`], {
    input: readFileSync(hostPath),
  });
}

/**
 * Seed the running e2e instance with a comic / ebook / audiobook readable.
 *
 * Copies the committed reader fixtures into the container's `/media`, drops the
 * raw-SQL seed script in, runs it with the container's bundled `node` +
 * `better-sqlite3`, and returns the created ids. The instance's `/config` (DB)
 * and `/media` are tmpfs, so this must run after the container is up and the
 * first-run admin has been created (which initialises the DB + a default
 * quality profile).
 */
export function seedReaderFixtures(): ReaderSeed {
  const cid = containerId();

  // Stage the fixture media files into /media.
  for (const name of ['sample.cbz', 'sample.epub', 'sample.mp3', 'sample.pdf']) {
    cpInto(cid, resolve(FIXTURE_DIR, name), `/media/${name}`);
  }
  // Stage the seed script next to the app workdir.
  cpInto(cid, SEED_SCRIPT, '/app/apps/web/reader-seed.cjs');

  // Run it from the app workdir so require('better-sqlite3') resolves.
  const stdout = docker([
    'exec',
    '-w',
    '/app/apps/web',
    cid,
    'node',
    'reader-seed.cjs',
  ]);
  // The exec output may carry the compose provider banner; take the last JSON line.
  const jsonLine = stdout
    .trim()
    .split('\n')
    .reverse()
    .find((l) => l.trim().startsWith('{'));
  if (!jsonLine) {
    throw new Error(`seedReaderFixtures: no JSON in seed output:\n${stdout}`);
  }
  return JSON.parse(jsonLine) as ReaderSeed;
}
