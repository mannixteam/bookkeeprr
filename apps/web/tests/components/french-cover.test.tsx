// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Cover, proxiedSrc } from '@/components/Cover';

afterEach(cleanup);
it.each(['openapi.bnf.fr', 'bdi.dlpdomain.com'])(
  'routes %s through validation and shows the fallback on rejection',
  (host) => {
    const src = `https://${host}/image.jpg`;
    expect(proxiedSrc(src)).toBe(`/api/img?u=${encodeURIComponent(src)}`);
    const { container } = render(<Cover src={src} title="Album français" contentType="comic" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(proxiedSrc(src));
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.cv-fb')?.getAttribute('aria-hidden')).toBe('false');
  },
);
