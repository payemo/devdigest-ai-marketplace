import { GH } from '../config.js';
import { rich, t } from '../i18n/index.js';

export default function Footer({ suggestHref, catalog }) {
  return (
    <footer className="site-footer">
      <div className="wrap footer-inner">
        <nav aria-label={t('footer.label')}>
          <a href={suggestHref} target="_blank" rel="noopener">{t('footer.suggest')}</a>
          <a href="feed.xml">{t('footer.feed')}</a>
          <a href="catalog.json" className="mono small">{t('footer.catalog')}</a>
          <a href="llms.txt" className="mono small">{t('footer.llms')}</a>
          <a href={GH} target="_blank" rel="noopener">{t('footer.source')}</a>
        </nav>
        {catalog && (
          <p className="build-info">
            {rich('footer.built', { date: catalog.generatedAt.slice(0, 10), sha: catalog.commit }, {
              a: (text) => <a href={`${GH}/commit/${catalog.commit}`} target="_blank" rel="noopener" className="mono">{text}</a>,
            })}
          </p>
        )}
      </div>
    </footer>
  );
}
