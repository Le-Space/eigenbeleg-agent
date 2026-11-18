# Security

**Report a weakness privately to [security@le-space.de](mailto:security@le-space.de), never in public**: no issue, pull request or discussion about something that could be exploited. Use made-up data only.

Le Space never asks for a seed phrase, a passkey, a private key or a token.

The policy is public at **https://eigenbeleg.le-space.de/security**, in German and English. It covers:
- what a report holds;
- coordinated disclosure (usually 90 days);
- good faith: how we intend to treat research within the rules (not a legal waiver);
- the rules: own data only, no DoS, no social engineering;
- the scope;
- that there is no bounty.

`/.well-known/security.txt` (RFC 9116) points there as its `Policy`.

This repository is private, so the policy lives in the API, in [`apps/api/src/security-page.js`](apps/api/src/security-page.js). Change it there; this file only points to it.
