import { GH } from '../config.js';

export default function Footer({ suggestHref, catalog }) {
  return (
    <footer className="site-footer">
      <div className="wrap footer-inner">
        <nav aria-label="Footer">
          <a href={suggestHref} target="_blank" rel="noopener">Suggest a plugin</a>
          <a href="feed.xml">Atom feed</a>
          <a href="catalog.json" className="mono small">catalog.json</a>
          <a href="llms.txt" className="mono small">llms.txt</a>
          <a href={GH} target="_blank" rel="noopener">Source on GitHub</a>
        </nav>
        {catalog && (
          <p className="build-info">
            Catalog built {catalog.generatedAt.slice(0, 10)} · commit{' '}
            <a href={`${GH}/commit/${catalog.commit}`} target="_blank" rel="noopener" className="mono">{catalog.commit}</a>
          </p>
        )}
      </div>
    </footer>
  );
}
