# Security Policy

## Supported version

Only the latest revision on the default branch is supported.

## Credentials and session material

`.env` and `session.json` contain authentication material. They are excluded from Git and must remain local. Do not attach them to tickets, commits, pull requests, screenshots, or chat messages.

If credentials or session cookies are exposed, immediately invalidate the relevant TradingView session, change the account password where appropriate, remove the exposed material from the external location, and review account activity. Git history rewrites do not substitute for credential rotation.

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue. Contact the repository owner privately with a concise reproduction, affected revision, impact assessment, and any suggested mitigation. Allow reasonable time for acknowledgement and remediation before public disclosure.

## Deployment boundary

This software is built for `localhost` use by one trusted operator. Public deployment, shared hosts, port forwarding, and reverse-proxy exposure are outside the supported security model and require an independent security review.
