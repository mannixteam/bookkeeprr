import type { Metadata } from 'next';
import Link from 'next/link';
import { Topbar } from '../components/Topbar';
import { Footer } from '../components/Footer';

export const metadata: Metadata = {
  title: 'Privacy Policy · bookkeeprr',
  description:
    'What bookkeeprr collects: nothing. Self-hosted software with no telemetry, and a static website with no tracking or analytics.',
};

const muted = { color: 'var(--muted)' } as const;
const h2 = {
  fontFamily: 'var(--font-space-grotesk)',
  color: 'var(--fg)',
  fontSize: 22,
  marginTop: 40,
  marginBottom: 12,
} as const;
const p = { color: 'var(--muted)', lineHeight: 1.7, marginBottom: 14 } as const;
const ul = { color: 'var(--muted)', lineHeight: 1.7, paddingLeft: 22, marginBottom: 14 } as const;

export default function Privacy(): React.JSX.Element {
  return (
    <>
      <Topbar />
      <main>
        <section className="section">
          <div className="wrap" style={{ maxWidth: 820 }}>
            <span className="eyebrow">legal</span>
            <h1 className="section-title">
              Privacy <em>Policy</em>
            </h1>
            <p style={{ ...muted, marginTop: 8 }}>Last updated 28 June 2026</p>

            <h2 style={h2}>The short version</h2>
            <p style={p}>
              bookkeeprr is self-hosted software with no telemetry, and this website collects no
              personal data. There are no tracking cookies and no analytics. If you are looking for
              the part where we explain how we monetise your data: there isn&apos;t one.
            </p>

            <h2 style={h2}>This website</h2>
            <ul style={ul}>
              <li>
                We set no tracking or advertising cookies, and we run no analytics, fingerprinting,
                or third-party trackers.
              </li>
              <li>
                We do not ask for or store any personal information. There are no accounts, sign-up
                forms, or contact forms here.
              </li>
              <li>
                The interactive demo loads book-cover images directly from Open Library
                (openlibrary.org) in your browser to illustrate the product. Those requests go to
                Open Library, not to us, and carry nothing about you beyond what any web request
                already includes.
              </li>
              <li>
                To display the current version, the site&apos;s server checks GitHub&apos;s public
                releases API periodically (cached, at most hourly). That check runs on our server,
                not in your browser, and sends nothing about you.
              </li>
              <li>
                Our host keeps only standard, transient access logs (the kind every web server
                produces); we do not use them to profile you.
              </li>
            </ul>

            <h2 style={h2}>The bookkeeprr application (self-hosted)</h2>
            <p style={p}>
              The bookkeeprr app is software you run on your own server. We (the project) do not
              operate it for you and never receive your data.
            </p>
            <ul style={ul}>
              <li>
                <strong style={{ color: 'var(--fg)' }}>No telemetry, no phone-home.</strong> The app
                sends no usage data, analytics, or crash reports anywhere.
              </li>
              <li>
                Your library, settings, accounts, and credentials live only in your own database on
                your own server.
              </li>
              <li>
                The only outbound network traffic is to the services you configure yourself: your
                indexers, the metadata providers you enable (such as AniList, Google Books, and Open
                Library), and your qBittorrent instance.
              </li>
              <li>
                For convenience the app can query GitHub&apos;s public releases API to check whether
                a newer version exists. That is a plain version check and sends no personal data; it
                can be ignored entirely.
              </li>
            </ul>

            <h2 style={h2}>Third-party services</h2>
            <p style={p}>
              Some links lead to services run by others, each with its own privacy policy that we do
              not control:
            </p>
            <ul style={ul}>
              <li>GitHub - source code, issues, discussions, and container images.</li>
              <li>Discord - community chat.</li>
            </ul>

            <h2 style={h2}>Changes</h2>
            <p style={p}>
              If this policy changes, we will update it here and revise the date above.
            </p>

            <h2 style={h2}>Contact</h2>
            <p style={p}>
              Questions? Open a{' '}
              <a href="https://github.com/paulcsiki/bookkeeprr/issues">GitHub issue</a> or{' '}
              <a href="https://github.com/paulcsiki/bookkeeprr/discussions">discussion</a>.
            </p>

            <p style={{ ...muted, marginTop: 40 }}>
              <Link href="/#top">&larr; Back to bookkeeprr</Link>
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
