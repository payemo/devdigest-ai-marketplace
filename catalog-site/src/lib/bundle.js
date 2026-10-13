/** Install commands for a bundle. mode: 'claude' (inside Claude Code) or 'shell'. */
export function installCommands(plugins, mode, { name, repo }) {
  const pre = mode === 'claude' ? '/plugin' : 'claude plugin';
  return [`${pre} marketplace add ${repo}`, ...plugins.map((p) => `${pre} install ${p}@${name}`)].join('\n');
}

/** Team settings snippet (.claude/settings.json). */
export function settingsJson(plugins, { name, repo }) {
  const enabledPlugins = {};
  for (const p of plugins) enabledPlugins[`${p}@${name}`] = true;
  return JSON.stringify({ extraKnownMarketplaces: { [name]: { source: { source: 'github', repo } } }, enabledPlugins }, null, 2);
}
