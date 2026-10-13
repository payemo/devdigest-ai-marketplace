// Thin synchronous git helpers shared by release.mjs and rollback.mjs.
import { spawnSync } from 'node:child_process';

export function git(root, args, { allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0 && !allowFail) throw new Error(`git ${args.join(' ')}: ${(r.stderr || r.stdout).trim()}`);
  return { ok: r.status === 0, out: (r.stdout || '').trim() };
}

export const branch = (root) => git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).out;
export const tags = (root) => git(root, ['tag', '--list']).out.split('\n').filter(Boolean);
export const tagExists = (root, tag) => git(root, ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], { allowFail: true }).ok;
export const isAncestor = (root, a, b) => git(root, ['merge-base', '--is-ancestor', a, b], { allowFail: true }).ok;
export const hasRemote = (root, name = 'origin') => git(root, ['remote'], { allowFail: true }).out.split('\n').includes(name);

/** True if the given paths have no staged/unstaged changes (and, when `untracked`, no untracked files). */
export function isClean(root, paths = [], { untracked = false } = {}) {
  const args = ['status', '--porcelain', untracked ? '--untracked-files=all' : '--untracked-files=no'];
  if (paths.length) args.push('--', ...paths);
  return git(root, args).out === '';
}

/** File content at a ref ("HEAD", a tag...), or null if it does not exist there. */
export function showAt(root, ref, relPath) {
  const r = git(root, ['show', `${ref}:${relPath}`], { allowFail: true });
  return r.ok ? r.out : null;
}
