# Changelog

All notable changes to this plugin are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/);
git tags are `sdd-engineering--v<version>`.

## [Unreleased]

## [1.0.0] - 2026-10-13

### Added
- Agents: `spec-creator`, `implementation-planner`, `implementer`, `plan-verifier`.
- Skills: `sdd` (full pipeline), `implement` (execute an approved plan with review, a bounded fix loop and verification),
  `workflow-retro` (cost and context retrospective of a finished run).
- Explicit inputs everywhere a project-specific path used to be: spec directory, plans directory, retros directory,
  context files, test commands, reviewer inputs. Each has a stated default.
- Optional steps (`test-writer`, `security-reviewer`) that run only when an agent with that name is installed and are
  reported as "skipped: not installed" otherwise.
- Starter `evals/` suite on a neutral fictional project.
- Dependencies: `engineering-paved-path` `^1.0.0`, `research-tools` `^1.0.0`, `architecture-review` `^1.0.0`.
