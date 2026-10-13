import { useEffect, useId, useRef, useState } from 'react';
import { rich, t } from '../i18n/index.js';
import { installCommands, settingsJson } from '../lib/bundle.js';
import { CheckIcon, CloseIcon, CopyIcon } from './Icons.jsx';

const MODES = [['claude', 'bundle.modeClaude'], ['shell', 'bundle.modeShell']];
const code = (text) => <code>{text}</code>;

function CopyButton({ text, label, primary, onToast }) {
  const [done, setDone] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard');
      await navigator.clipboard.writeText(text);
      setDone(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 2000);
    } catch {
      onToast(t('bundle.copyBlocked'));
    }
  }
  return (
    <button type="button" className={`btn${primary ? ' btn-primary' : ''}`} onClick={copy} style={!primary && done ? { color: 'var(--success)' } : undefined}>
      {done ? <CheckIcon size={15} /> : <CopyIcon size={15} />}<span>{done ? t('bundle.copied') : label}</span>
    </button>
  );
}

/** The bundle builder. variant "panel" is the desktop sidebar, "sheet" the mobile bottom sheet. */
export default function BundlePanel({ plugins, marketplace, variant = 'panel', onRemove, onClear, onClose, onShare, onToast }) {
  const uid = useId();
  const [mode, setMode] = useState('claude');
  const names = plugins.map((p) => p.name);
  const externals = plugins.filter((p) => p.external);
  const n = plugins.length;
  const commands = installCommands(names, mode, marketplace);
  const json = settingsJson(names, marketplace);

  return (
    <section aria-labelledby={`${uid}-h`} className={`bundle bundle-${variant}`}>
      <div className="bundle-head">
        <h2 id={`${uid}-h`}>{t('bundle.title')} <span className={`count${n ? ' has' : ''}`}>{n}</span></h2>
        <div className="bundle-head-actions">
          {n > 0 && (
            <>
              <button type="button" className="link-btn accent" onClick={onShare}>{t('bundle.share')}</button>
              <button type="button" className="link-btn" onClick={onClear}>{t('bundle.clear')}</button>
            </>
          )}
          {onClose && (
            <button type="button" className="link-btn icon" onClick={onClose} aria-label={variant === 'sheet' ? t('bundle.closeSheet') : t('bundle.closePanel')}>
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      {n === 0 ? (
        <p className="bundle-empty">{rich('bundle.empty', {}, { b: (text) => <strong>{text}</strong> })}</p>
      ) : (
        <>
          <ul className="bundle-list">
            {plugins.map((p) => (
              <li key={p.name}>
                <CheckIcon size={14} className="accent-stroke" />
                <span className="mono grow">{p.name}</span>
                {p.external && <span className="badge-outline badge-sm">{t('bundle.external')}</span>}
                <button type="button" className="link-btn" onClick={() => onRemove(p.name)} aria-label={t('bundle.removeAria', { plugin: p.name })}>
                  {t('bundle.remove')} <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>

          <fieldset className="bundle-install">
            <legend>{t('bundle.installWith')}</legend>
            <div className="segmented">
              {MODES.map(([key, labelKey]) => (
                <label key={key} className={mode === key ? 'is-on' : ''}>
                  <input type="radio" name={`${uid}-mode`} value={key} checked={mode === key} onChange={() => setMode(key)} />
                  <span>{t(labelKey)}</span>
                </label>
              ))}
            </div>
            <pre aria-label={t('bundle.commandsAria')}>{commands}</pre>
            <CopyButton primary label={t('bundle.copyCommands')} text={commands} onToast={onToast} />
          </fieldset>

          <div className="bundle-share">
            <h3>{rich('bundle.shareTitle', {}, { code: (text) => <span className="mono muted">{text}</span> })}</h3>
            <pre aria-label={t('bundle.jsonAria')}>{json}</pre>
            <div className="bundle-share-row">
              <CopyButton label={t('bundle.copyJson')} text={json} onToast={onToast} />
              <span className="muted small">{rich('bundle.putIn', {}, { code })}</span>
            </div>
            {externals.length > 0 && (
              <p className="note">
                {rich('bundle.externalNote', { name: externals.length === 1 ? externals[0].name : '<name>', marketplace: marketplace.name }, { code })}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
