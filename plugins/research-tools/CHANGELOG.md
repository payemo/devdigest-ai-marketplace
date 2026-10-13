# Changelog

All notable changes to this plugin are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/);
git tags are `research-tools--v<version>`.

## [Unreleased]

### Added
- `researcher` agent — the repo-research report now has an `**As of:**` line with the HEAD commit SHA and date,
  so a report can be re-checked against the exact state of the repository it describes.

## [1.0.0] - 2026-10-13

### Added
- `researcher` agent — read-only research with two modes (repository research, external research), a mandatory
  citation per finding, and an explicit "not found / unverified" section. Tools: `Read, Grep, Glob, Bash, WebFetch, WebSearch`
  (no `Write`/`Edit`).
