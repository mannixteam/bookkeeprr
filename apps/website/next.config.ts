import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  // Self-contained Node server image (Caddy static export is gone): the site
  // is server-rendered so it can resolve the release version at request time
  // (ISR-cached hourly) without a rebuild. See src/lib/version.ts.
  output: 'standalone',
  // Trace files from the monorepo root so the standalone bundle includes the
  // @bookkeeprr/* workspace packages.
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  trailingSlash: true,
  reactStrictMode: true,
  transpilePackages: [
    '@bookkeeprr/tokens',
    '@bookkeeprr/types',
    '@bookkeeprr/ui',
    '@bookkeeprr/logic',
  ],
  images: {
    unoptimized: true,
  },
};

export default config;
