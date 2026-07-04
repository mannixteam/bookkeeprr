import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeAudio } from '@/server/reader/formats/audio';

// ── Minimal MP4 builders (enough to exercise the chapter extractors) ──────────

const u8 = (n: number) => Buffer.from([n & 0xff]);
const u16 = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n, 0);
  return b;
};
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
};
const u64 = (n: number) => Buffer.concat([u32(Math.floor(n / 0x100000000)), u32(n % 0x100000000)]);
const fullbox = () => u32(0); // version(1)+flags(3) = 0
function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(8 + body.length), Buffer.from(type, 'latin1'), body]);
}

/** A QuickTime chapter-track m4b: ftyp + mdat(text samples) + moov(text trak). */
function buildQtM4b(chapters: { title: string; ms: number }[], timescale = 1000): Buffer {
  const titles = chapters.map((c) => Buffer.from(c.title, 'utf8'));
  const samples = titles.map((t) => Buffer.concat([u16(t.length), t]));
  const sizes = samples.map((s) => s.length);
  const samplesBuf = Buffer.concat(samples);

  const ftyp = box('ftyp', Buffer.from('isom', 'latin1'), u32(0), Buffer.from('isom', 'latin1'));
  const sampleStart = ftyp.length + 8; // after ftyp + the mdat box header
  const mdat = box('mdat', samplesBuf);

  // per-sample deltas: start[i+1]-start[i]; last one arbitrary.
  const deltas: number[] = [];
  for (let i = 0; i < chapters.length; i++) {
    deltas.push(i + 1 < chapters.length ? chapters[i + 1]!.ms - chapters[i]!.ms : 1000);
  }
  const stts = box(
    'stts',
    fullbox(),
    u32(deltas.length),
    ...deltas.flatMap((d) => [u32(1), u32(d)]),
  );
  const stsz = box('stsz', fullbox(), u32(0), u32(sizes.length), ...sizes.map((s) => u32(s)));
  const stsc = box('stsc', fullbox(), u32(1), u32(1), u32(sizes.length), u32(1));
  const stco = box('stco', fullbox(), u32(1), u32(sampleStart));
  const stbl = box('stbl', stts, stsc, stsz, stco);
  const minf = box('minf', stbl);
  const mdhd = box('mdhd', fullbox(), u32(0), u32(0), u32(timescale), u32(0));
  const hdlr = box('hdlr', fullbox(), u32(0), Buffer.from('text', 'latin1'), Buffer.alloc(12));
  const mdia = box('mdia', mdhd, hdlr, minf);
  const trak = box('trak', mdia);
  const moov = box('moov', trak);

  return Buffer.concat([ftyp, mdat, moov]);
}

/** A Nero chpl m4b: ftyp + moov(udta(chpl)). One reserved byte before count. */
function buildChplM4b(chapters: { title: string; sec: number }[]): Buffer {
  const entries = chapters.flatMap((c) => {
    const t = Buffer.from(c.title, 'utf8');
    return [u64(Math.round(c.sec * 10_000_000)), u8(t.length), t];
  });
  const chpl = box('chpl', fullbox(), u8(0), u8(chapters.length), ...entries);
  const udta = box('udta', chpl);
  const moov = box('moov', udta);
  const ftyp = box('ftyp', Buffer.from('isom', 'latin1'), u32(0), Buffer.from('isom', 'latin1'));
  return Buffer.concat([ftyp, moov]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});
function writeTemp(buf: Buffer): string {
  dir = mkdtempSync(join(tmpdir(), 'm4b-'));
  const p = join(dir, 'book.m4b');
  writeFileSync(p, buf);
  return p;
}

describe('describeAudio — embedded chapters', () => {
  it('extracts QuickTime chapter-track marks (title + startSec)', async () => {
    const path = writeTemp(
      buildQtM4b([
        { title: 'Opening Credits', ms: 0 },
        { title: 'Chapter One', ms: 1500 },
        { title: 'Chapter Two', ms: 3200 },
      ]),
    );
    const info = await describeAudio(path);
    expect(info.chapters.map((c) => c.title)).toEqual([
      'Opening Credits',
      'Chapter One',
      'Chapter Two',
    ]);
    expect(info.chapters.map((c) => c.startSec)).toEqual([0, 1.5, 3.2]);
  });

  it('extracts Nero chpl marks (100-ns timestamps → seconds)', async () => {
    const path = writeTemp(
      buildChplM4b([
        { title: 'Intro', sec: 0 },
        { title: 'Middle', sec: 12.5 },
        { title: 'End', sec: 90 },
      ]),
    );
    const info = await describeAudio(path);
    expect(info.chapters.map((c) => c.title)).toEqual(['Intro', 'Middle', 'End']);
    expect(info.chapters.map((c) => c.startSec)).toEqual([0, 12.5, 90]);
  });

  it('returns no chapters for an m4b without a chapter track or chpl', async () => {
    // A moov with only an audio-less ftyp — nothing to extract.
    const ftyp = box('ftyp', Buffer.from('isom', 'latin1'), u32(0), Buffer.from('isom', 'latin1'));
    const moov = box('moov', box('mvhd', fullbox(), u32(0), u32(0), u32(1000), u32(60000)));
    const path = writeTemp(Buffer.concat([ftyp, moov]));
    const info = await describeAudio(path);
    expect(info.chapters).toEqual([]);
    // mvhd duration still parses (60000/1000 = 60s).
    expect(info.durationSec).toBe(60);
  });
});
