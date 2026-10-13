const base = { viewBox: '0 0 24 24', 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' };
const icon = (children, extra = {}) => ({ size = 16, ...p }) => (
  <svg {...base} width={size} height={size} strokeWidth={2} {...extra} {...p}>{children}</svg>
);

export const SearchIcon = icon(<><circle cx="11" cy="11" r="6.5" /><line x1="16" y1="16" x2="20.5" y2="20.5" /></>);
export const CloseIcon = icon(<><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></>);
export const CheckIcon = icon(<polyline points="5 12.5 10 17 19 7" />, { strokeWidth: 2.2 });
export const PlusIcon = icon(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>);
export const CopyIcon = icon(<><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>, { strokeWidth: 1.8 });
export const ChevronIcon = icon(<polyline points="6 9 12 15 18 9" />);
export const InfoIcon = icon(<><circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16" /><line x1="12" y1="8" x2="12" y2="8" /></>);
export const MenuIcon = icon(<><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></>, { strokeWidth: 1.8 });
export const SunIcon = icon(
  <><circle cx="12" cy="12" r="4" /><line x1="12" y1="2.5" x2="12" y2="4.5" /><line x1="12" y1="19.5" x2="12" y2="21.5" /><line x1="2.5" y1="12" x2="4.5" y2="12" /><line x1="19.5" y1="12" x2="21.5" y2="12" /><line x1="5.3" y1="5.3" x2="6.7" y2="6.7" /><line x1="17.3" y1="17.3" x2="18.7" y2="18.7" /><line x1="5.3" y1="18.7" x2="6.7" y2="17.3" /><line x1="17.3" y1="6.7" x2="18.7" y2="5.3" /></>,
  { strokeWidth: 1.8 },
);
export const MoonIcon = icon(<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />, { strokeWidth: 1.8 });
export const DotsIcon = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width={size} height={size} fill="currentColor">
    <circle cx="5.5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18.5" cy="12" r="1.6" />
  </svg>
);
export const ExternalIcon = icon(<><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>);
