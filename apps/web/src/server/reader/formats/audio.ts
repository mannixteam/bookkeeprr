import { open } from 'node:fs/promises';
import { extname } from 'node:path';

/** An embedded chapter marker: a title and its start time in seconds. */
export type Chapter = { title: string; startSec: number };
export type AudioInfo = { durationSec: number | null; chapters: Chapter[] };

// We never load the whole audio file (an m4b can be >1GB). For duration we read
// at most a 64 KB head + 64 KB tail window. To extract chapters we additionally
// read the full `moov` box (capped) — it holds the sample tables — plus small
// targeted reads of the chapter title samples from `mdat`.
const HEAD_BYTES = 64 * 1024;
const TAIL_BYTES = 64 * 1024;
// Cap the moov read so a pathological file can't blow memory. Real audiobook
// moov boxes are well under this (the reference file's is ~1 MB).
const MAX_MOOV_BYTES = 48 * 1024 * 1024;

/** Read up to `length` bytes at `position`, returning the populated slice. */
async function readWindow(
  fh: Awaited<ReturnType<typeof open>>,
  position: number,
  length: number,
): Promise<Buffer> {
  if (length <= 0) return Buffer.alloc(0);
  const buf = Buffer.allocUnsafe(length);
  const { bytesRead } = await fh.read(buf, 0, length, position);
  return buf.subarray(0, bytesRead);
}

/**
 * Best-effort audio duration probe for MP3 and MP4/M4A/M4B containers.
 *
 * No external deps and no transcoding: we read only the header window(s) we
 * need and parse just enough structure to estimate a duration. MUST NOT throw —
 * any parse failure yields `{ durationSec: null }`. The result is a hint only.
 */
export async function describeAudio(path: string): Promise<AudioInfo> {
  let fh: Awaited<ReturnType<typeof open>> | undefined;
  try {
    fh = await open(path, 'r');
    const { size } = await fh.stat();
    const head = await readWindow(fh, 0, Math.min(HEAD_BYTES, size));
    const ext = extname(path).toLowerCase();

    // ISO-BMFF / MP4 family: detect via the `ftyp` box at offset 4, or by ext.
    const isMp4Ext = ext === '.mp4' || ext === '.m4a' || ext === '.m4b';
    const hasFtyp = head.length >= 8 && head.toString('latin1', 4, 8) === 'ftyp';
    if (isMp4Ext || hasFtyp) {
      // Locate + read the full moov (holds mvhd duration AND the chapter sample
      // tables). This also handles large leading-moov files the fixed 64 KB
      // window couldn't (an audiobook moov can be ~1 MB).
      const moov = await readMoovBox(fh, size);
      if (moov) {
        const durationSec = mvhdDuration(moov.buf, moov.dataStart, moov.dataEnd);
        let chapters: Chapter[] = [];
        try {
          chapters = await mp4Chapters(fh, moov.buf, moov.dataStart, moov.dataEnd);
        } catch {
          chapters = []; // never let chapter parsing fail the whole probe
        }
        return { durationSec, chapters };
      }
      // Fallback (moov not found by the walk): the old head/tail duration probe.
      let d = mp4Duration(head);
      if (d === null && size > head.length) {
        const tailStart = Math.max(head.length, size - TAIL_BYTES);
        const tail = await readWindow(fh, tailStart, size - tailStart);
        d = mp4Duration(tail);
      }
      return { durationSec: d, chapters: [] };
    }

    // MP3 (or anything with an MPEG audio frame): handle by ext or by sniffing.
    if (ext === '.mp3' || isLikelyMp3(head)) {
      const d = mp3Duration(head, size);
      return { durationSec: d, chapters: [] };
    }

    return { durationSec: null, chapters: [] };
  } catch {
    return { durationSec: null, chapters: [] };
  } finally {
    await fh?.close();
  }
}

/** Quick sniff: an ID3 tag or an MPEG frame sync near the start. */
function isLikelyMp3(buf: Buffer): boolean {
  if (buf.length >= 3 && buf.toString('latin1', 0, 3) === 'ID3') return true;
  // 0xFF 0xEx frame sync (0xFFE) within the first few bytes.
  return buf.length >= 2 && buf[0] === 0xff && ((buf[1] ?? 0) & 0xe0) === 0xe0;
}

// ---------------------------------------------------------------------------
// MP4 / ISO-BMFF: walk top-level boxes to moov -> mvhd, read timescale+duration.
// ---------------------------------------------------------------------------
function mp4Duration(buf: Buffer): number | null {
  const moov = findBox(buf, 0, buf.length, 'moov');
  if (!moov) return null;
  const mvhd = findBox(buf, moov.dataStart, moov.dataEnd, 'mvhd');
  if (!mvhd) return null;

  let p = mvhd.dataStart;
  if (p + 4 > mvhd.dataEnd) return null;
  const version = buf[p] ?? 0;
  // version(1) + flags(3)
  p += 4;

  let timescale: number;
  let duration: number;
  if (version === 1) {
    // creation(8) modification(8) timescale(4) duration(8)
    if (p + 28 > mvhd.dataEnd) return null;
    p += 16;
    timescale = buf.readUInt32BE(p);
    p += 4;
    const hi = buf.readUInt32BE(p);
    const lo = buf.readUInt32BE(p + 4);
    duration = hi * 0x100000000 + lo;
  } else {
    // creation(4) modification(4) timescale(4) duration(4)
    if (p + 16 > mvhd.dataEnd) return null;
    p += 8;
    timescale = buf.readUInt32BE(p);
    p += 4;
    duration = buf.readUInt32BE(p);
  }

  if (!timescale || timescale <= 0) return null;
  const sec = duration / timescale;
  return sec > 0 ? sec : null;
}

type Box = { type: string; dataStart: number; dataEnd: number };

/** Find the first child box of `type` within [start, end). */
function findBox(buf: Buffer, start: number, end: number, type: string): Box | null {
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p);
    const boxType = buf.toString('latin1', p + 4, p + 8);
    let headerLen = 8;
    if (size === 1) {
      // 64-bit largesize follows the type.
      if (p + 16 > end) break;
      const hi = buf.readUInt32BE(p + 8);
      const lo = buf.readUInt32BE(p + 12);
      size = hi * 0x100000000 + lo;
      headerLen = 16;
    } else if (size === 0) {
      // Box extends to end of file.
      size = end - p;
    }
    if (size < headerLen || p + size > end) break;
    if (boxType === type) {
      return { type, dataStart: p + headerLen, dataEnd: p + size };
    }
    p += size;
  }
  return null;
}

// ---------------------------------------------------------------------------
// MP4 chapter extraction (QuickTime chapter track, then Nero chpl fallback)
// ---------------------------------------------------------------------------

/**
 * Walk the top-level boxes and return the full `moov` box plus the offset range
 * of its children. Reads only box headers while skipping (never the mdat), then
 * the moov box in one bounded read.
 */
async function readMoovBox(
  fh: Awaited<ReturnType<typeof open>>,
  size: number,
): Promise<{ buf: Buffer; dataStart: number; dataEnd: number } | null> {
  let pos = 0;
  while (pos + 8 <= size) {
    const hdr = await readWindow(fh, pos, 16);
    if (hdr.length < 8) break;
    let boxSize = hdr.readUInt32BE(0);
    const type = hdr.toString('latin1', 4, 8);
    let headerLen = 8;
    if (boxSize === 1) {
      if (hdr.length < 16) break;
      boxSize = hdr.readUInt32BE(8) * 0x100000000 + hdr.readUInt32BE(12);
      headerLen = 16;
    } else if (boxSize === 0) {
      boxSize = size - pos;
    }
    if (boxSize < headerLen) break;
    if (type === 'moov') {
      const buf = await readWindow(fh, pos, Math.min(boxSize, MAX_MOOV_BYTES));
      return { buf, dataStart: headerLen, dataEnd: Math.min(boxSize, buf.length) };
    }
    pos += boxSize;
  }
  return null;
}

/** All immediate child boxes of `type` within [start, end). */
function findAllBoxes(buf: Buffer, start: number, end: number, type: string): Box[] {
  const out: Box[] = [];
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p);
    const boxType = buf.toString('latin1', p + 4, p + 8);
    let headerLen = 8;
    if (size === 1) {
      if (p + 16 > end) break;
      size = buf.readUInt32BE(p + 8) * 0x100000000 + buf.readUInt32BE(p + 12);
      headerLen = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < headerLen || p + size > end) break;
    if (boxType === type) out.push({ type, dataStart: p + headerLen, dataEnd: p + size });
    p += size;
  }
  return out;
}

/** mvhd duration (seconds) from the moov children region. */
function mvhdDuration(buf: Buffer, moovStart: number, moovEnd: number): number | null {
  const mvhd = findBox(buf, moovStart, moovEnd, 'mvhd');
  if (!mvhd) return null;
  let p = mvhd.dataStart;
  if (p + 4 > mvhd.dataEnd) return null;
  const version = buf[p] ?? 0;
  p += 4;
  let timescale: number;
  let duration: number;
  if (version === 1) {
    if (p + 28 > mvhd.dataEnd) return null;
    p += 16;
    timescale = buf.readUInt32BE(p);
    p += 4;
    duration = buf.readUInt32BE(p) * 0x100000000 + buf.readUInt32BE(p + 4);
  } else {
    if (p + 16 > mvhd.dataEnd) return null;
    p += 8;
    timescale = buf.readUInt32BE(p);
    p += 4;
    duration = buf.readUInt32BE(p);
  }
  if (!timescale || timescale <= 0) return null;
  const sec = duration / timescale;
  return sec > 0 ? sec : null;
}

/** track_ID from a tkhd box. */
function trackIdFromTkhd(buf: Buffer, tkhd: Box): number | null {
  const version = buf[tkhd.dataStart] ?? 0;
  const p = tkhd.dataStart + 4 + (version === 1 ? 16 : 8);
  if (p + 4 > tkhd.dataEnd) return null;
  return buf.readUInt32BE(p);
}

/** handler type (e.g. 'soun', 'text') from a trak's mdia/hdlr. */
function handlerOf(buf: Buffer, mdia: Box): string {
  const hdlr = findBox(buf, mdia.dataStart, mdia.dataEnd, 'hdlr');
  if (!hdlr || hdlr.dataStart + 12 > hdlr.dataEnd) return '';
  return buf.toString('latin1', hdlr.dataStart + 8, hdlr.dataStart + 12);
}

/** mdhd media timescale for a trak's mdia. */
function mdhdTimescale(buf: Buffer, mdia: Box): number | null {
  const mdhd = findBox(buf, mdia.dataStart, mdia.dataEnd, 'mdhd');
  if (!mdhd) return null;
  const version = buf[mdhd.dataStart] ?? 0;
  const p = mdhd.dataStart + 4 + (version === 1 ? 16 : 8);
  if (p + 4 > mdhd.dataEnd) return null;
  const ts = buf.readUInt32BE(p);
  return ts > 0 ? ts : null;
}

/**
 * Extract embedded chapters from a moov: prefer a QuickTime chapter TRACK
 * (Apple/Audible), then fall back to a Nero `chpl` atom. Returns [] when neither
 * is present or parseable.
 */
async function mp4Chapters(
  fh: Awaited<ReturnType<typeof open>>,
  buf: Buffer,
  moovStart: number,
  moovEnd: number,
): Promise<Chapter[]> {
  const qt = await qtChapters(fh, buf, moovStart, moovEnd);
  if (qt.length > 0) return qt;
  return neroChplChapters(buf, moovStart, moovEnd);
}

/** QuickTime chapter track: title text samples in mdat, timed by the track stts. */
async function qtChapters(
  fh: Awaited<ReturnType<typeof open>>,
  buf: Buffer,
  moovStart: number,
  moovEnd: number,
): Promise<Chapter[]> {
  const traks = findAllBoxes(buf, moovStart, moovEnd, 'trak');

  // Chapter-track ids referenced by an audio track's `tref -> chap`.
  const chapIds = new Set<number>();
  for (const tr of traks) {
    const mdia = findBox(buf, tr.dataStart, tr.dataEnd, 'mdia');
    if (!mdia || handlerOf(buf, mdia) !== 'soun') continue;
    const tref = findBox(buf, tr.dataStart, tr.dataEnd, 'tref');
    const chap = tref && findBox(buf, tref.dataStart, tref.dataEnd, 'chap');
    if (chap) {
      for (let p = chap.dataStart; p + 4 <= chap.dataEnd; p += 4) chapIds.add(buf.readUInt32BE(p));
    }
  }

  // Pick the chapter track: the tref-referenced one, else a lone 'text' track.
  let chapterMdia: Box | null = null;
  for (const tr of traks) {
    const mdia = findBox(buf, tr.dataStart, tr.dataEnd, 'mdia');
    if (!mdia || handlerOf(buf, mdia) !== 'text') continue;
    const tkhd = findBox(buf, tr.dataStart, tr.dataEnd, 'tkhd');
    const id = tkhd ? trackIdFromTkhd(buf, tkhd) : null;
    if ((id !== null && chapIds.has(id)) || chapIds.size === 0) {
      chapterMdia = mdia;
      break;
    }
  }
  if (!chapterMdia) return [];

  const timescale = mdhdTimescale(buf, chapterMdia);
  if (!timescale) return [];
  const minf = findBox(buf, chapterMdia.dataStart, chapterMdia.dataEnd, 'minf');
  const stbl = minf && findBox(buf, minf.dataStart, minf.dataEnd, 'stbl');
  if (!stbl) return [];

  const deltas = parseStts(buf, findBox(buf, stbl.dataStart, stbl.dataEnd, 'stts'));
  const sizes = parseStsz(buf, findBox(buf, stbl.dataStart, stbl.dataEnd, 'stsz'));
  const chunkOffsets = parseChunkOffsets(buf, stbl);
  const stsc = parseStsc(buf, findBox(buf, stbl.dataStart, stbl.dataEnd, 'stsc'));
  if (!sizes.length || !chunkOffsets.length || !stsc.length) return [];

  const count = sizes.length;
  const offsets = sampleFileOffsets(count, sizes, chunkOffsets, stsc);
  if (offsets.length !== count) return [];

  // Cumulative start time (ticks) of each sample from the per-sample deltas.
  const starts: number[] = [];
  let acc = 0;
  for (let i = 0; i < count; i++) {
    starts.push(acc);
    acc += deltas[i] ?? 0;
  }

  const chapters: Chapter[] = [];
  for (let i = 0; i < count; i++) {
    const sz = sizes[i]!;
    if (sz < 2 || sz > 4096) continue; // sane text-sample bound
    const raw = await readWindow(fh, offsets[i]!, sz);
    if (raw.length < 2) continue;
    const textLen = raw.readUInt16BE(0);
    if (textLen === 0 || 2 + textLen > raw.length) continue;
    const title = raw.toString('utf8', 2, 2 + textLen).trim();
    if (title) chapters.push({ title, startSec: starts[i]! / timescale });
  }
  return chapters;
}

/** stts -> flat array of per-sample deltas (ticks). */
function parseStts(buf: Buffer, stts: Box | null): number[] {
  if (!stts) return [];
  let p = stts.dataStart + 4;
  if (p + 4 > stts.dataEnd) return [];
  const n = buf.readUInt32BE(p);
  p += 4;
  const out: number[] = [];
  for (let i = 0; i < n && p + 8 <= stts.dataEnd; i++) {
    const cnt = buf.readUInt32BE(p);
    const delta = buf.readUInt32BE(p + 4);
    p += 8;
    for (let j = 0; j < cnt && out.length < 100000; j++) out.push(delta);
  }
  return out;
}

/** stsz -> per-sample byte sizes. */
function parseStsz(buf: Buffer, stsz: Box | null): number[] {
  if (!stsz) return [];
  let p = stsz.dataStart + 4;
  if (p + 8 > stsz.dataEnd) return [];
  const sampleSize = buf.readUInt32BE(p);
  const count = buf.readUInt32BE(p + 4);
  p += 8;
  const out: number[] = [];
  if (sampleSize !== 0) {
    for (let i = 0; i < count && i < 100000; i++) out.push(sampleSize);
    return out;
  }
  for (let i = 0; i < count && p + 4 <= stsz.dataEnd; i++) {
    out.push(buf.readUInt32BE(p));
    p += 4;
  }
  return out;
}

/** stco (32-bit) or co64 (64-bit) -> chunk file offsets. */
function parseChunkOffsets(buf: Buffer, stbl: Box): number[] {
  let box = findBox(buf, stbl.dataStart, stbl.dataEnd, 'stco');
  let wide = false;
  if (!box) {
    box = findBox(buf, stbl.dataStart, stbl.dataEnd, 'co64');
    wide = true;
  }
  if (!box) return [];
  let p = box.dataStart + 4;
  if (p + 4 > box.dataEnd) return [];
  const n = buf.readUInt32BE(p);
  p += 4;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (wide) {
      if (p + 8 > box.dataEnd) break;
      out.push(buf.readUInt32BE(p) * 0x100000000 + buf.readUInt32BE(p + 4));
      p += 8;
    } else {
      if (p + 4 > box.dataEnd) break;
      out.push(buf.readUInt32BE(p));
      p += 4;
    }
  }
  return out;
}

/** stsc -> [firstChunk, samplesPerChunk, descIdx] entries (chunk index 1-based). */
function parseStsc(buf: Buffer, stsc: Box | null): [number, number, number][] {
  if (!stsc) return [];
  let p = stsc.dataStart + 4;
  if (p + 4 > stsc.dataEnd) return [];
  const n = buf.readUInt32BE(p);
  p += 4;
  const out: [number, number, number][] = [];
  for (let i = 0; i < n && p + 12 <= stsc.dataEnd; i++) {
    out.push([buf.readUInt32BE(p), buf.readUInt32BE(p + 4), buf.readUInt32BE(p + 8)]);
    p += 12;
  }
  return out;
}

/** Map each sample to its absolute file offset via the stsc chunk table. */
function sampleFileOffsets(
  count: number,
  sizes: number[],
  chunkOffsets: number[],
  stsc: [number, number, number][],
): number[] {
  // samples-per-chunk for each 1-based chunk index.
  const spc: number[] = new Array(chunkOffsets.length + 1).fill(0);
  for (let e = 0; e < stsc.length; e++) {
    const first = stsc[e]![0];
    const per = stsc[e]![1];
    const nextFirst = e + 1 < stsc.length ? stsc[e + 1]![0] : chunkOffsets.length + 1;
    for (let c = first; c < nextFirst; c++) if (c >= 1 && c <= chunkOffsets.length) spc[c] = per;
  }
  const offsets: number[] = [];
  let sample = 0;
  for (let c = 1; c <= chunkOffsets.length && sample < count; c++) {
    let within = chunkOffsets[c - 1]!;
    const per = spc[c] || 0;
    for (let s = 0; s < per && sample < count; s++) {
      offsets.push(within);
      within += sizes[sample] ?? 0;
      sample++;
    }
  }
  return offsets;
}

/**
 * Nero `chpl` chapter list (moov/udta/chpl). Timestamps are in 100-ns units.
 * The bytes between the fullbox header and the entries differ between writers
 * (some emit 1 reserved byte, some 4), so try a few offsets for the 1-byte
 * chapter count and keep the first that parses to a consistent, monotonic list.
 */
function neroChplChapters(buf: Buffer, moovStart: number, moovEnd: number): Chapter[] {
  const udta = findBox(buf, moovStart, moovEnd, 'udta');
  if (!udta) return [];
  const chpl = findBox(buf, udta.dataStart, udta.dataEnd, 'chpl');
  if (!chpl) return [];
  for (const pre of [4, 5, 8]) {
    const countPos = chpl.dataStart + pre;
    if (countPos + 1 > chpl.dataEnd) continue;
    const count = buf[countPos] ?? 0;
    if (count === 0 || count > 2000) continue;
    const parsed = tryParseChpl(buf, countPos + 1, chpl.dataEnd, count);
    if (parsed) return parsed;
  }
  return [];
}

function tryParseChpl(buf: Buffer, start: number, end: number, count: number): Chapter[] | null {
  const out: Chapter[] = [];
  let p = start;
  let prev = -1;
  for (let i = 0; i < count; i++) {
    if (p + 9 > end) return null;
    const ts = buf.readUInt32BE(p) * 0x100000000 + buf.readUInt32BE(p + 4);
    const len = buf[p + 8] ?? 0;
    p += 9;
    if (p + len > end) return null;
    if (ts < prev) return null; // must be monotonic
    prev = ts;
    const title = buf.toString('utf8', p, p + len).trim();
    p += len;
    out.push({ title, startSec: ts / 10_000_000 });
  }
  return out.length ? out : null;
}

// ---------------------------------------------------------------------------
// MP3: skip ID3v2, find first valid MPEG frame, CBR-estimate from bitrate.
// ---------------------------------------------------------------------------

// Bitrate tables (kbps), keyed `${mpegGroup}-${layer}` where layer is the Roman
// numeral (1 = Layer I, 2 = Layer II, 3 = Layer III) as computed below
// (layer = 4 - layerBits). The key's second digit MUST match that numbering —
// an earlier version inverted it (keyed Layer III as `1-3` but stored Layer I
// bitrates), so every Layer III MP3 (the overwhelmingly common case) read 288
// kbps instead of 128 and reported durations ~2.25x too short.
const BITRATES: Record<string, (number | null)[]> = {
  // MPEG-1
  '1-1': [null, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, null], // Layer I
  '1-2': [null, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, null], // Layer II
  '1-3': [null, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, null], // Layer III
  // MPEG-2 / 2.5
  '2-1': [null, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, null], // Layer I
  '2-2': [null, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, null], // Layer II
  '2-3': [null, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, null], // Layer III (= II for MPEG-2)
};

const SAMPLE_RATES: Record<string, number[]> = {
  '1': [44100, 48000, 32000], // MPEG-1
  '2': [22050, 24000, 16000], // MPEG-2
  '2.5': [11025, 12000, 8000], // MPEG-2.5
};

function mp3Duration(buf: Buffer, fileSize: number): number | null {
  let start = 0;

  // Skip an ID3v2 header if present: "ID3" + ver(2) + flags(1) + synchsafe size(4).
  if (buf.length >= 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    const size =
      (((buf[6] ?? 0) & 0x7f) << 21) |
      (((buf[7] ?? 0) & 0x7f) << 14) |
      (((buf[8] ?? 0) & 0x7f) << 7) |
      ((buf[9] ?? 0) & 0x7f);
    start = 10 + size;
  }

  // Find first frame sync: 11 set bits (0xFF followed by top 3 bits set).
  let i = start;
  const limit = Math.min(buf.length - 4, start + 0x10000); // bounded scan
  for (; i <= limit; i++) {
    const b1 = buf[i + 1] ?? 0;
    const b2 = buf[i + 2] ?? 0;
    if (buf[i] !== 0xff || (b1 & 0xe0) !== 0xe0) continue;

    // MPEG version: bits 4-3 of b1. 00=2.5, 01=reserved, 10=2, 11=1.
    const verBits = (b1 >> 3) & 0x03;
    if (verBits === 0x01) continue; // reserved
    const versionKey = verBits === 0x03 ? '1' : verBits === 0x02 ? '2' : '2.5';

    // Layer: bits 2-1 of b1. 00=reserved, 01=III, 10=II, 11=I.
    const layerBits = (b1 >> 1) & 0x03;
    if (layerBits === 0x00) continue; // reserved
    const layer = 4 - layerBits; // 01->III(3), 10->II(2), 11->I(1)

    // Bitrate index: bits 7-4 of b2.
    const brIndex = (b2 >> 4) & 0x0f;
    if (brIndex === 0x00 || brIndex === 0x0f) continue; // free/bad

    // Sample-rate index: bits 3-2 of b2.
    const srIndex = (b2 >> 2) & 0x03;
    if (srIndex === 0x03) continue; // reserved

    const mpegGroup = versionKey === '1' ? '1' : '2';
    const brKey = `${mpegGroup}-${layer}`;
    const brTable = BITRATES[brKey];
    if (!brTable) continue;
    const kbps = brTable[brIndex];
    const sampleRate = SAMPLE_RATES[versionKey]?.[srIndex];
    if (!kbps || !sampleRate) continue;

    // CBR estimate: audio bytes after tags, * 8 bits, / bitrate (bits/sec).
    // Use the total file size (we only hold the head window in memory) minus
    // the leading-tag offset; trailing tags are negligible for a hint.
    const audioBytes = fileSize - start;
    if (audioBytes <= 0) continue;
    const bitsPerSec = kbps * 1000;
    const sec = (audioBytes * 8) / bitsPerSec;
    return sec > 0 ? sec : null;
  }

  return null;
}
