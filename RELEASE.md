# Release checklist

Everything is ready to ship; only account credentials are missing. When you
have GitHub and npm auth configured, this checklist gets ctxray public.

## 0. Pre-flight (already done, verified)

- [x] `node scripts/build.mjs` — bundles `dist/ctxray.mjs` + `dist/index.mjs`
- [x] `node --test` — 9/9 passing
- [x] `npx ctxray --demo` — synthetic compaction demo renders
- [x] `npx ctxray --json` / `--html` / `--budget N` — all three outputs verified
- [x] Real-session regression (DeepSeek Harness + Codex) — clean
- [x] `npm publish --dry-run` — tarball is 5 files, ~35 KB, no stray files
- [x] `git` — 6 commits, clean working tree, identity `Torino <sujunhao54188@gmail.com>`

## 1. GitHub

```bash
# Option A — gh CLI (not installed yet: `gh` → command not found)
gh auth login
gh repo create ctxray --public --source=. --push \
  --description "Context forensics for AI coding agents"

# Option B — manual (no gh CLI)
#   1. Create an empty public repo `ctxray` on github.com/new
#   2. Then:
git remote add origin https://github.com/<you>/ctxray.git
git push -u origin main
```

## 2. npm

```bash
npm login          # currently ENEEDAUTH
npm publish        # or: bash scripts/release.sh  (build → test → publish → push)
```

## 3. Post-publish (turn it into stars)

- [ ] Paste the `npx ctxray --demo` terminal output as the README hero GIF
- [ ] Post to HN / r/LocalLLaMA with the demo output (the "your agent isn't
      getting dumber, its context got evicted" framing)
- [ ] Add a `ctxray` badge to any repo that ships a `.github/workflows` budget gate
- [ ] Open issues labeled `good first issue` for new adapters (each is ~80 lines;
      see [CONTRIBUTING.md](CONTRIBUTING.md))
