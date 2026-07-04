import Link from 'next/link';
import { Logo } from '@bookkeeprr/ui';
import { getAppVersion } from '../../lib/version';

export async function Footer(): Promise<React.JSX.Element> {
  const version = await getAppVersion();
  return (
    <footer>
      <div className="wrap">
        <div className="col">
          <Link href="/" className="brand" style={{ marginBottom: 16, display: 'inline-flex' }}>
            <Logo size={24} />
          </Link>
          <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.55, maxWidth: 320 }}>
            Self-hosted monitoring &amp; library management for the things Sonarr forgot.
          </p>
        </div>
        <div className="col">
          <h4>Product</h4>
          <Link href="/#features">Features</Link>
          <Link href="/#demo">Live demo</Link>
          <Link href="/#start">Get started</Link>
          <Link href="/#faq">FAQ</Link>
        </div>
        <div className="col">
          <h4>Resources</h4>
          <a href="https://github.com/paulcsiki/bookkeeprr">GitHub</a>
          <a href="https://github.com/paulcsiki/bookkeeprr/blob/main/docs/README.md">
            Documentation
          </a>
          <a href="/docs/api/" target="_blank" rel="noopener">
            API reference
          </a>
          <a href="https://github.com/paulcsiki/bookkeeprr/releases">Releases</a>
          <Link href="/privacy">Privacy</Link>
        </div>
        <div className="col">
          <h4>Community</h4>
          <a href="https://github.com/paulcsiki/bookkeeprr/issues">Issues</a>
          <a href="https://github.com/paulcsiki/bookkeeprr/discussions">Discussions</a>
          <a href="/discord">Discord</a>
          <a href="https://github.com/paulcsiki/bookkeeprr/blob/main/CONTRIBUTING.md">Contribute</a>
        </div>
        <div className="legal" style={{ gridColumn: '1 / -1' }}>
          <span>MIT licensed</span>
          <span>v{version}</span>
        </div>
      </div>
    </footer>
  );
}
