# macOS Desktop Signing & Notarization

FlowTrack Tracker macOS builds are signed and notarized in GitHub Actions when the secrets below are configured. Unsigned builds still run when secrets are missing (local testing / first setup).

## Workflow

- File: `.github/workflows/desktop-mac.yml`
- Triggers:
  - Manual: **Actions → Build Mac Desktop App → Run workflow**
  - Tag push: `desktop-v1.0.1` (matches `desktop/package.json` version)

## Required GitHub secrets

Add these in **GitHub → Repository → Settings → Secrets and variables → Actions**.

### Code signing (Developer ID Application)

| Secret | Description |
|--------|-------------|
| `MACOS_CERTIFICATE_BASE64` | Base64-encoded `.p12` export of your **Developer ID Application** certificate + private key |
| `MACOS_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` |
| `APPLE_TEAM_ID` | 10-character Team ID from [Apple Developer → Membership](https://developer.apple.com/account) |

Export certificate on macOS:

```bash
# Keychain Access → My Certificates → Developer ID Application → Export → .p12
base64 -i Certificates.p12 | pbcopy   # paste into MACOS_CERTIFICATE_BASE64
```

### Notarization (choose one method)

**Option A — App Store Connect API key (recommended)**

| Secret | Description |
|--------|-------------|
| `APPLE_API_KEY_BASE64` | Base64 of the `.p8` key file |
| `APPLE_API_KEY_ID` | Key ID (e.g. `AB12CD34EF`) |
| `APPLE_API_ISSUER` | Issuer UUID from App Store Connect |

```bash
base64 -i AuthKey_AB12CD34EF.p8 | pbcopy
```

**Option B — Apple ID app-specific password**

| Secret | Description |
|--------|-------------|
| `APPLE_ID` | Apple ID email used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from [appleid.apple.com](https://appleid.apple.com) |

## Local signed build (optional)

```bash
export CSC_LINK=/path/to/cert.p12
export CSC_KEY_PASSWORD=your-p12-password
export APPLE_TEAM_ID=XXXXXXXXXX
export APPLE_API_KEY=/path/to/AuthKey.p8
export APPLE_API_KEY_ID=AB12CD34EF
export APPLE_API_ISSUER=uuid-from-app-store-connect

cd desktop
npm run pack:mac
```

Skip notarization locally:

```bash
export SKIP_NOTARIZE=true
npm run pack:mac
```

## After CI build

1. Download artifact **flowtrack-mac-desktop** from the workflow run.
2. Upload contents of `public/downloads/` to your server:
   - `FlowTrack.dmg` — manual install
   - `FlowTrack.zip` + `latest-mac.yml` — auto-update
3. Bump `desktop/package.json` version before each release so `electron-updater` detects the update.

## Notes

- **Universal** binary (Intel + Apple Silicon) is built by default.
- Auto-update on macOS requires a signed + notarized `FlowTrack.zip`.
- Without secrets, CI produces unsigned artifacts suitable for internal testing only.
