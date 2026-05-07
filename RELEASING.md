# Release process

Releases are automated via GitHub Actions. To release a new version:

## 1. Bump the version

Update the version in:
- `package.json` (`"version": "x.y.z"`)
- `src-tauri/Cargo.toml` (`version = "x.y.z"`)
- `src-tauri/tauri.conf.json` (`"version": "x.y.z"`)
- `README.md` (the version badge)

Commit the bumps:
```
git add -A
git commit -m "chore: bump version to vX.Y.Z"
```

## 2. Tag and push

```
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

## 3. Wait for the build

GitHub Actions will build for macOS, Windows, and Linux in parallel.
Takes ~10–15 min the first time, ~3–5 min on subsequent builds (cached).

Watch progress at: https://github.com/<user>/<repo>/actions

## 4. Edit and publish the draft release

1. Go to https://github.com/<user>/<repo>/releases
2. Find the draft release `Courvux Notepad vX.Y.Z`
3. Edit the description with the changelog
4. Click "Publish release"

## Caveats

- Builds are **unsigned**. macOS users must right-click → Open on first launch.
- Windows users will see SmartScreen warning ("Don't run / Run anyway").
- Linux AppImage works on most distros without install.
- This is acceptable for a free open-source app. Code signing requires
  Apple Developer Account ($99/year) + Windows EV Cert; deferred until
  the project graduates from "demo" to "product".
