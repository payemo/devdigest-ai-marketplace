import { GH } from '../config.js';
import { t } from '../i18n/index.js';
import { CHANGELOG_PAGE, SEARCH_PAGE, pagePath } from '../lib/urlState.js';
import { ExtMark, MenuIcon, MoonIcon, SunIcon } from './Icons.jsx';

export default function Header({ page, onNavigate, theme, onToggleTheme, menuOpen, onToggleMenu, suggestHref }) {
  const link = (target, label) => (
    <a
      href={pagePath(target)}
      aria-current={page === target ? 'page' : undefined}
      onClick={(e) => { e.preventDefault(); onNavigate(target); }}
    >{label}</a>
  );
  const themeLabel = theme === 'dark' ? t('nav.themeToLight') : t('nav.themeToDark');

  return (
    <header className="site-header">
      <div className="wrap bar">
        <a className="brand" href={pagePath(SEARCH_PAGE)} onClick={(e) => { e.preventDefault(); onNavigate(SEARCH_PAGE); }}>
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">{t('brand.name')} <span>{t('brand.suffix')}</span></span>
        </a>
        <nav className="nav" aria-label={t('nav.main')}>
          {link(SEARCH_PAGE, t('nav.search'))}
          {link(CHANGELOG_PAGE, t('nav.changelog'))}
          <a href={GH} target="_blank" rel="noopener">{t('nav.github')}<ExtMark /></a>
        </nav>
        <div className="tools">
          <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel}>
            {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
          </button>
          <button type="button" className="icon-btn menu-btn" onClick={onToggleMenu} aria-expanded={menuOpen} aria-controls="mobile-menu" aria-label={t('nav.menu')}>
            <MenuIcon size={18} />
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav id="mobile-menu" className="wrap mobile-nav" aria-label={t('nav.main')}>
          {link(SEARCH_PAGE, t('nav.search'))}
          {link(CHANGELOG_PAGE, t('nav.changelog'))}
          <a href={GH} target="_blank" rel="noopener">{t('nav.github')}<ExtMark /></a>
          <a href={suggestHref} target="_blank" rel="noopener">{t('nav.suggest')}<ExtMark /></a>
        </nav>
      )}
    </header>
  );
}
