import { useId, useRef, useState, useEffect } from 'react';
import { installCommands, settingsJson } from '../lib/bundle.js';
import { CheckIcon, CloseIcon, CopyIcon } from './Icons.jsx';

const MODES = [['claude', 'In Claude Code'], ['shell', 'From the shell']];

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
      onToast('Copy blocked — select the text and press Ctrl+C / ⌘C.');
    }
  }
  return (
    <button type="button" className={`btn${primary ? ' btn-primary' : ''}`} onClick={copy} style={!primary && done ? { color: 'var(--success)' } : undefined}>
      {done ? <CheckIcon size={15} /> : <CopyIcon size={15} />}<span>{done ? 'Copied' : label}</span>
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

  return (
    <section aria-labelledby={`${uid}-h`} className={`bundle bundle-${variant}`}>
      <div className="bundle-head">
        <h2 id={`${uid}-h`}>Your bundle <span className={`count${n ? ' has' : ''}`}>{n}</span></h2>
        <div className="bundle-head-actions">
          {n > 0 && (
            <>
              <button type="button" className="link-btn accent" onClick={onShare}>Share link</button>
              <button type="button" className="link-btn" onClick={onClear}>Clear</button>
            </>
          )}
          {onClose && (
            <button type="button" className="link-btn icon" onClick={onClose} aria-label={variant === 'sheet' ? 'Close bundle' : 'Collapse bundle panel'}>
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      {n === 0 ? (
        <p className="bundle-empty">
          Select plugins with the <strong>+</strong> button on any card. Commands and a team settings snippet appear here.
        </p>
      ) : (
        <>
          <ul className="bundle-list">
            {plugins.map((p) => (
              <li key={p.name}>
                <CheckIcon size={14} className="accent-stroke" />
                <span className="mono grow">{p.name}</span>
                {p.external && <span className="badge-outline badge-sm">External</span>}
                <button type="button" className="link-btn" onClick={() => onRemove(p.name)} aria-label={`Remove ${p.name} from bundle`}>
                  remove <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>

          <fieldset className="bundle-install">
            <legend>Install with</legend>
            <div className="segmented">
              {MODES.map(([key, label]) => (
                <label key={key} className={mode === key ? 'is-on' : ''}>
                  <input type="radio" name={`${uid}-mode`} value={key} checked={mode === key} onChange={() => setMode(key)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <pre aria-label="Install commands">{installCommands(names, mode, marketplace)}</pre>
            <CopyButton primary label="Copy commands" text={installCommands(names, mode, marketplace)} onToast={onToast} />
          </fieldset>

          <div className="bundle-share">
            <h3>Share with your team <span className="mono muted">settings.json</span></h3>
            <pre aria-label="settings.json snippet">{settingsJson(names, marketplace)}</pre>
            <div className="bundle-share-row">
              <CopyButton label="Copy JSON" text={settingsJson(names, marketplace)} onToast={onToast} />
              <span className="muted small">Put this in <code>.claude/settings.json</code></span>
            </div>
            {externals.length > 0 && (
              <p className="note">
                Teammates still run <code>claude plugin install {externals.length === 1 ? externals[0].name : '<name>'}@{marketplace.name} --scope project</code> once for plugins whose files live outside this repository.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
