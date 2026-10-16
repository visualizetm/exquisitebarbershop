import { Link } from 'react-router';

export function SiteFooter() {
  const sha = __BUILD_SHA__;
  return (
    <footer className="exq-site-footer">
      <div className="exq-site-footer__inner">
        <p className="exq-site-footer__address">3309 Edgmont Ave, Brookhaven, PA</p>
        <p className="exq-site-footer__social">
          <a
            href="https://instagram.com/exquisitebarberbeauty"
            rel="noopener noreferrer"
            target="_blank"
          >
            @exquisitebarberbeauty
          </a>
        </p>
        <p className="exq-site-footer__links">
          <Link to="/admin">Staff login</Link>
        </p>
        <p className="exq-site-footer__build" data-state={sha === 'unknown' ? 'unknown' : 'known'}>
          <small>Build {sha.slice(0, 7)}</small>
        </p>
      </div>
    </footer>
  );
}
