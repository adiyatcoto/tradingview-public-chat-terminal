# Contributing

## Scope

Contributions should preserve the local-first, single-operator security model. Do not add telemetry, credential collection, remote control, CAPTCHA bypassing, or features that expose the server beyond localhost without prior maintainer approval.

## Workflow

1. Create a focused branch.
2. Never commit `.env`, `session.json`, browser exports, or real credentials.
3. Run `npm test`.
4. Manually verify the changed flow on localhost using a non-production account where possible.
5. Submit a pull request with purpose, validation performed, and any upstream TradingView dependency or compatibility caveat.

## Style

Use clear institutional English for source comments, UI text, commit messages, and documentation. Keep comments focused on non-obvious security, compatibility, or operational decisions.
