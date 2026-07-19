# Security Policy

## API keys and credentials

This repository must not contain real API keys, app secrets, passwords, cookies, private keys, cloud credential files, or signed URLs. Runtime credentials belong in environment variables or a local secret manager. `.env` files are ignored; `.env.example` contains names only.

Before every public push, run:

```powershell
npm.cmd run audit:public
```

If a credential was committed, assume it is compromised. Revoke and rotate it at the provider first, then remove it from Git history. Deleting the latest file is not sufficient.

## Reporting a vulnerability

Do not open a public issue containing secrets or exploit details. Contact the repository owner privately through the security contact configured on the GitHub account.

## Media safety

Generated episode images, voiceovers, renders, downloaded references, local models, and MP3 background music are excluded from Git by default. Contributors are responsible for verifying licenses, likeness rights, voice consent, and third-party service terms before publishing any media.
