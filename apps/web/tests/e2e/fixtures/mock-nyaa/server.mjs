// Mock Nyaa RSS server for the acquisition-pipeline e2e (slice 2).
//
// Surface:
//   GET /?page=rss&q=...&c=...      → Nyaa-style RSS with one matching item
//                                     (we ignore the query — the test only
//                                     asks for the canonical series anyway).
//   GET /download/release.torrent   → a real .torrent file with a WebSeed
//                                     URL pointing at /dl/payload.bin.
//   GET /dl/payload.bin             → the WebSeed payload: a VALID .cbz (a
//                                     stored ZIP with one PNG page). The
//                                     importer's content health-check opens
//                                     the file with the comics prober and
//                                     rejects provably-bad archives, so a
//                                     garbage payload would blacklist the
//                                     release and slice 3 could never import.
//   GET /tracker?...                → minimal HTTP tracker: empty peers.
//                                     qBit falls back to the WebSeed.
//   GET /healthz                    → 200 OK for compose healthcheck.
//
// The torrent is built once at startup so the info-hash advertised in the
// RSS matches the .torrent exactly.

import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8080);
const RELEASE_TITLE = 'Mock Test Series v01 (2024) (Digital) (mock).cbz';
const PIECE_LENGTH = 16 * 1024;

// --- minimal valid CBZ (stored ZIP, one PNG entry) -------------------------

// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Build a stored (method 0) single-entry ZIP — enough for 7z/zip probers. */
function buildCbz(entryName, data) {
  const name = Buffer.from(entryName, 'utf-8');
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // local file header signature
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18); // compressed size (stored)
  local.writeUInt32LE(data.length, 22); // uncompressed size
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); // central directory signature
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42); // local header offset
  const cdOffset = local.length + name.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end-of-central-directory signature
  eocd.writeUInt16LE(1, 8); // entries on this disk
  eocd.writeUInt16LE(1, 10); // total entries
  eocd.writeUInt32LE(central.length + name.length, 12); // CD size
  eocd.writeUInt32LE(cdOffset, 16); // CD offset
  return Buffer.concat([local, name, data, central, name, eocd]);
}

const PAYLOAD = buildCbz('page-001.png', PNG);
const PAYLOAD_LEN = PAYLOAD.length;
const PIECES = crypto.createHash('sha1').update(PAYLOAD).digest(); // single 20-byte SHA-1

// --- minimal bencoder ----------------------------------------------------
function benc(v) {
  if (Buffer.isBuffer(v)) return Buffer.concat([Buffer.from(`${v.length}:`), v]);
  if (typeof v === 'string') return benc(Buffer.from(v, 'utf-8'));
  if (typeof v === 'number') return Buffer.from(`i${Math.trunc(v)}e`);
  if (Array.isArray(v)) return Buffer.concat([Buffer.from('l'), ...v.map(benc), Buffer.from('e')]);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    return Buffer.concat([
      Buffer.from('d'),
      ...keys.flatMap((k) => [benc(k), benc(v[k])]),
      Buffer.from('e'),
    ]);
  }
  throw new Error(`bencode: unsupported value ${typeof v}`);
}

const PAYLOAD_NAME = RELEASE_TITLE;
const info = {
  length: PAYLOAD_LEN,
  name: PAYLOAD_NAME,
  'piece length': PIECE_LENGTH,
  pieces: PIECES,
};
const infoBytes = benc(info);
const infoHashHex = crypto.createHash('sha1').update(infoBytes).digest('hex');

// `url-list` is a flat string for a single WebSeed, per BEP-19.
// `announce` points at our own minimal tracker so qBit doesn't refuse the torrent.
function torrent(host) {
  return benc({
    announce: `http://${host}/tracker`,
    info,
    'url-list': `http://${host}/dl/payload.bin`,
    'created by': 'bookkeeprr e2e mock-nyaa',
    'creation date': 0,
  });
}

function rss(host) {
  // Nyaa's RSS feed shape (see apps/web/src/server/integrations/nyaa/schemas.ts).
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:nyaa="https://nyaa.si/xmlns/nyaa">
  <channel>
    <title>Mock Nyaa (e2e)</title>
    <link>http://${host}/</link>
    <description>e2e fixture</description>
    <item>
      <title>${RELEASE_TITLE}</title>
      <link>http://${host}/download/release.torrent</link>
      <guid isPermaLink="true">http://${host}/view/1</guid>
      <pubDate>Mon, 29 May 2026 12:00:00 +0000</pubDate>
      <nyaa:seeders>42</nyaa:seeders>
      <nyaa:leechers>3</nyaa:leechers>
      <nyaa:downloads>100</nyaa:downloads>
      <nyaa:infoHash>${infoHashHex}</nyaa:infoHash>
      <nyaa:categoryId>3_1</nyaa:categoryId>
      <nyaa:size>${Math.max(1, Math.round(PAYLOAD_LEN / 1024))} KiB</nyaa:size>
      <nyaa:trusted>No</nyaa:trusted>
      <nyaa:remake>No</nyaa:remake>
    </item>
  </channel>
</rss>`;
}

const server = http.createServer((req, res) => {
  const host = req.headers.host ?? `mock-nyaa:${PORT}`;
  const url = new URL(req.url ?? '/', `http://${host}`);

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (url.pathname === '/' && url.searchParams.get('page') === 'rss') {
    const body = rss(host);
    res.writeHead(200, {
      'content-type': 'application/xml; charset=utf-8',
      'content-length': Buffer.byteLength(body),
    });
    res.end(body);
    return;
  }

  if (url.pathname === '/download/release.torrent') {
    const body = torrent(host);
    res.writeHead(200, {
      'content-type': 'application/x-bittorrent',
      'content-length': body.length,
    });
    res.end(body);
    return;
  }

  if (url.pathname === '/dl/payload.bin') {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': PAYLOAD.length,
    });
    res.end(PAYLOAD);
    return;
  }

  if (url.pathname === '/tracker') {
    // bencoded { interval: 1800, peers: '' } — empty peer list. qBit will then
    // serve the file from the WebSeed URL.
    const body = Buffer.from('d8:intervali1800e5:peers0:e');
    res.writeHead(200, { 'content-type': 'text/plain', 'content-length': body.length });
    res.end(body);
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`mock-nyaa listening on ${PORT} (info-hash ${infoHashHex})\n`);
});
