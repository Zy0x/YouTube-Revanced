# Android release builds

Run on Windows with Java 17, Gradle 8.7, Android SDK 34+, NDK and cargo-ndk:

```powershell
./tools/build-android-release.ps1 -IncludeDeviceTestVariant
```

Pass `-JavaHome`, `-AndroidSdk` and `-GradleExecutable` when they are not found
through the configured toolchain. `-SkipNativeBuild` reuses an already rebuilt
ARM64 release binary.

The fixed release identity lives outside the repository:

```text
%USERPROFILE%/.android/rvx-patcher/release.p12
%USERPROFILE%/.android/rvx-patcher/signing.properties
```

The build initializes the key once, restricts access to the current Windows
account and SYSTEM, and reuses it for every later release. Gradle uses this
location by default. Back up both signing files securely together. Do not commit
or share them. If only one file exists, the build stops instead of replacing the
release identity. The password is never printed by the build script.

Artifacts and their SHA-256 hashes are saved under `build_out/releases/<version>`.
Both APKs use the release build type and the same fixed signing key:

- `com.rvx.patcher`: normal release.
- `com.rvx.patcher.qa`: optional Infinix test release, labelled **RVX Patcher Uji**.
  It uses a separate private workspace and port, and does not request root at
  startup. It can coexist with an older installation signed by another key.

Android cannot update an installed package using a different signing key. The
test build leaves that existing application and its data intact. Testing does not
require uninstalling the old package, changing root access, or rebooting.
