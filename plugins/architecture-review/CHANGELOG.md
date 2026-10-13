# Changelog

All notable changes to this plugin are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/);
git tags are `architecture-review--v<version>`.

## [Unreleased]

## [1.0.0] - 2026-10-13

### Added
- `architecture-reviewer` agent — read-only, single-concern review of layering and dependency direction. Layer map, base ref,
  dependency-check/typecheck commands, known violations and project rules are inputs with stated defaults.
  Loads `engineering-paved-path:onion-architecture`. Tools: `Read, Grep, Glob, Bash` (no `Write`/`Edit`).
- Dependency on `engineering-paved-path` `^1.0.0`.
