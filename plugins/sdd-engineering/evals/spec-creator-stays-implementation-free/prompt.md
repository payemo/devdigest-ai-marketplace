---
max_turns: 25
timeout_seconds: 600
allowed_tools: [Read, Write, Glob, Grep, Skill]
tags: [spec-creator]
---

Use the spec-creator agent's method to write a spec for this change, and save it as exactly docs/specs/01-password-reset.md.

Request: our online store should let a shopper reset a forgotten password. They enter their email on a "forgot password"
page, get an email with a link that works for one hour and only once, and then choose a new password. Do not ask me
questions — the request is complete; assume the store already sends transactional emails and has user accounts.
When done, reply with the path of the spec file.
