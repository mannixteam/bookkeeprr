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

it('preserves the selected-edition local image URL', () => {
  const src = '/api/img?bnfArk=ark%3A%2F12148%2Fcb12345678x&ean=9782723488525';
  expect(proxiedSrc(src)).toBe(src);
  const { container } = render(<Cover src={src} title="Album français" contentType="comic" />);
  expect(container.querySelector('img')?.getAttribute('src')).toBe(src);
});
