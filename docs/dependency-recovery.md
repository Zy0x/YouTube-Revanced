# Dependency preparation and recovery — 2.1.44

## Reproduced failure

Infinix X698 reported a missing original YouTube APK for version 21.13.164.
That exact version was installed. The old import path invoked `su` for copying
even though the QA daemon ran under the app UID. The preflight and pipeline also
used different cache names. The failure dialog incorrectly suggested a dev-patch
compatibility problem, and a substring match displayed “APK ready” on an error
line containing “Stock APK”.

## Changes

- The Android bridge obtains the readable installed APK path using PackageManager.
  Only an exact package/version match and a standalone APK are offered as input.
- The native core checks the binary Android manifest, package, version, ZIP
  structure and payload CRC before accepting an APK. Preflight and preparation
  share the same discovery rules and canonical package/version cache name.
- Valid installed APKs are copied directly under the existing app identity.
  Arbitrary-version wildcard imports, guessed mirror URLs and automatic `su`
  imports are removed. Split bundles are not silently reduced to `base.apk`.
- Missing inputs are downloaded before invoking the patch command. Source errors
  and mismatched versions remain explicit; the selected version is never changed
  automatically to make a download appear successful.
- Downloads use a partial file, bounded network retries, expected-length checks,
  and a final rename. HTML/JSON error responses cannot become binary cache files.
- Java must run and report version 21 or newer. The same launcher/environment is
  used for verification and patching. Runtime archives are SHA-256 pinned, extracted
  to staging, tested, and only then activated, with rollback on activation failure.
- Morphe 1.20.0 is SHA-256 pinned, ZIP/CRC checked, and tested with `--version` before
  patch execution. Patch bundles are checked in full and repaired if invalid.
- Diagnostics distinguish files merely present from files actually verified.
  Status polling does not launch `su` or execute heavyweight probes.
- Structured preparation states precede the patch stage. The log stream is
  subscribed before job start, with an immediate stream handshake. A native
  atomic flag prevents concurrent jobs from racing over dependency caches.
- Download plans bind input and folder paths. Accepted workspace/output paths are
  snapshotted for the job, so a later settings change cannot redirect that build.
- Resource failures have specific recovery messages. Dev-release compatibility
  advice is shown only when an actual compatibility error is detected.

## Scope of recovery

Automatic recovery handles missing/corrupt resources and retryable transfer
failures. It does not disable validation, silently change APK versions, replace
signing keys, or loop forever. If all sources are unavailable, preparation stops
with the resource and upstream error identified before patching begins.

## Validation

- 28 Node tests cover configuration ownership, plan validity, dependency error
  classification, unknown-size consent, and the existing workflow.
- Nine Rust tests cover APK identity/version checks, malformed manifests/archives,
  Java version parsing, failed/truncated downloads, and separate storage paths.
- An additional integration test validates the actual 182,186,576-byte YouTube
  21.13.164 APK read from the Infinix, including archive CRCs.

References: [Morphe prerequisites](https://github.com/MorpheApp/morphe-desktop/blob/main/README.md),
[Android execution rules](https://developer.android.com/about/versions/10/behavior-changes-10),
[Termux launcher implementation](https://github.com/termux-play-store/termux-exec/blob/main/README.md).
