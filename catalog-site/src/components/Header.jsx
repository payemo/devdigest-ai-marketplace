import { GH } from '../config.js';
import { CHANGELOG_PAGE, SEARCH_PAGE, pagePath } from '../lib/urlState.js';
import { MenuIcon, MoonIcon, SunIcon } from './Icons.jsx';

export default function Header({ page, onNavigate, theme, onToggleTheme, menuOpen, onToggleMenu, suggestHref }) {
  const link = (target, label) => (
    <a
      href={pagePath(target)}
      aria-current={page === target ? 'page' : undefined}
      onClick={(e) => { e.preventDefault(); onNavigate(target); }}
    >{label}</a>
  );
  const themeLabel = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <header className="site-header">
      <div className="wrap bar">
        <a className="brand" href={pagePath(SEARCH_PAGE)} onClick={(e) => { e.preventDefault(); onNavigate(SEARCH_PAGE); }}>
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">DevDigest <span>Marketplace</span></span>
        </a>
        <nav className="nav" aria-label="Main">
          {link(SEARCH_PAGE, 'Search')}
          {link(CHANGELOG_PAGE, "What's new")}
          <a href={GH} target="_blank" rel="noopener">GitHub <span aria-hidden="true" className="muted">↗</span></a>
        </nav>
        <div className="tools">
          <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel}>
            {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
          </button>
          <button type="button" className="icon-btn menu-btn" onClick={onToggleMenu} aria-expanded={menuOpen} aria-controls="mobile-menu" aria-label="Menu">
            <MenuIcon size={18} />
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav id="mobile-menu" className="wrap mobile-nav" aria-label="Main">
          {link(SEARCH_PAGE, 'Search')}
          {link(CHANGELOG_PAGE, "What's new")}
          <a href={GH} target="_blank" rel="noopener">GitHub ↗</a>
          <a href={suggestHref} target="_blank" rel="noopener">Suggest a plugin ↗</a>
        </nav>
      )}
    </header>
  );
}
