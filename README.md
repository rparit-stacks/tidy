<p align="center"><img src="assets/logo-tight.svg" width="112" alt="Tidy logo"></p>

# Tidy

Find what is really filling your Mac, including the hidden app data Finder never shows, and see what is safe to remove.
Free and open source. macOS 11 or later.

- **Overview, 13 sections, folder drill-down** with real sizes (`du`), nothing counted twice.
- **Risk levels** (Safe / Review / Critical). Only risky items warn you. Files go to the Trash.
- **Smart scan (optional)** uses your own logged-in [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) to explain what each large item is. No API key.
- **Remembers results**, so repeat scans take under a second.

## Run it

```bash
npm install
npm start          # run from source
npm run dmg        # build dist/Tidy-<version>-<arch>.dmg
```

Tidy needs **Full Disk Access** (it walks you through it). Claude Code is optional and only used for Smart scan:

```bash
curl -fsSL https://claude.ai/install.sh | bash   # then run `claude` once to sign in
```

The build is ad-hoc signed, not notarized: on first launch right-click the app, choose Open, then Open again.
