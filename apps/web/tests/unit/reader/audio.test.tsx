// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type PropsWithChildren } from 'react';
import type { ReaderManifest } from '@bookkeeprr/types';
import { AudioReader } from '@/components/reader/AudioReader';

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(async () => new Response('{}', { status: 200 })),
}));

function audioManifest(progress?: Partial<ReaderManifest['progress']>): ReaderManifest {
  return {
    readableKey: 'audio:vol:5',
    contentType: 'audio',
    reader: 'audio',
    format: 'audio',
    title: 'Test Audiobook',
    author: 'A. Narrator',
    seriesId: 7,
    volumeId: 5,
    tracks: [{ idx: 0, fileId: 9, durationSec: 600, title: 'Ch1' }],
    chapters: [
      { title: 'Chapter One', startSec: 0 },
      { title: 'Chapter Two', startSec: 300 },
    ],
    totalSec: 600,
    progress: {
      readableKey: 'audio:vol:5',
      position: 0,
      locator: null,
      finished: false,
      restartedFromFinish: false,
      ...progress,
    },
  };
}

function Wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('AudioReader', () => {
  beforeAll(() => {
    // jsdom does not implement media playback.
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  it('renders an <audio> element pointed at the audio API', () => {
    const { container } = render(
      <Wrapper>
        <AudioReader manifest={audioManifest()} />
      </Wrapper>,
    );
    const audio = container.querySelector('audio');
    expect(audio).toBeTruthy();
    expect(audio?.getAttribute('src') ?? '').toContain('/api/reader/audio/9');
  });

  it('the play button toggles to pause on click', () => {
    render(
      <Wrapper>
        <AudioReader manifest={audioManifest()} />
      </Wrapper>,
    );
    const playBtn = screen.getByLabelText('Play');
    fireEvent.click(playBtn);
    expect(screen.getByLabelText('Pause')).toBeTruthy();
  });

  it('seeks the audio element to the persisted resume offset once metadata loads', () => {
    // Two 600s tracks; saved position 700s ⇒ track 2 at offset 100s.
    const manifest = audioManifest({ position: 700 / 1200, locator: { sec: 700 } });
    manifest.tracks = [
      { idx: 0, fileId: 9, durationSec: 600, title: 'Ch1' },
      { idx: 1, fileId: 10, durationSec: 600, title: 'Ch2' },
    ];
    manifest.totalSec = 1200;
    const { container } = render(
      <Wrapper>
        <AudioReader manifest={manifest} />
      </Wrapper>,
    );
    const audio = container.querySelector('audio')!;
    // The seeded trackIdx already loads the right file…
    expect(audio.getAttribute('src') ?? '').toContain('/api/reader/audio/10');
    // …and once its metadata arrives, playback must resume at the saved offset.
    fireEvent(audio, new Event('loadedmetadata'));
    expect(audio.currentTime).toBe(100);
  });

  it('does not seek on a restart-after-finish open (progress reset to 0)', () => {
    const manifest = audioManifest({ finished: true, restartedFromFinish: true });
    const { container } = render(
      <Wrapper>
        <AudioReader manifest={manifest} />
      </Wrapper>,
    );
    const audio = container.querySelector('audio')!;
    fireEvent(audio, new Event('loadedmetadata'));
    expect(audio.currentTime).toBe(0);
  });

  it('renders the chapter list with chapter titles', () => {
    render(
      <Wrapper>
        <AudioReader manifest={audioManifest()} />
      </Wrapper>,
    );
    // "Chapter One" also appears in the top-bar subtitle (current chapter),
    // so it can match more than once; "Chapter Two" is list-only.
    expect(screen.getAllByText('Chapter One').length).toBeGreaterThan(0);
    expect(screen.getByText('Chapter Two')).toBeTruthy();
  });
});
