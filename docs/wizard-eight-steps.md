# Eight-step setup — 2.1.43

The configuration wizard now has eight pages, followed by the existing download
and build progress screen:

1. Application.
2. Patch source and release.
3. APK version, with no separate stock APK download action.
4. Root or non-root installation mode.
5. Complete patch feature list, search, filters, presets and per-patch options.
6. Advanced engine and signing settings.
7. Separate Workspace and Output folders.
8. Configuration review, dependencies, cache state and known download sizes.

The final action starts resource downloading and building. Entering review only
requests a download plan (metadata/size checks), never the patch endpoint. Editing
configuration or storage invalidates that plan; expired plans require rechecking.
Unknown sizes require consent. Saving configuration remains available when the
current browser cannot run the selected build engine.

## Folder selection

Android opens the system Files directory picker using `ACTION_OPEN_DOCUMENT_TREE`
and retains its returned URI grant. It accepts local external-storage volumes;
cloud providers cannot supply filesystem paths to the native CLI. Selection and
raw filesystem write access are checked separately. If Android blocks native
filesystem access, the storage page offers an explicit file-access settings
button after validation fails; it does not open settings automatically.

The combined default shortcut and individual shortcuts choose:

- `/storage/emulated/0/Rvext/Workspace`
- `/storage/emulated/0/Rvext/Output`

Folders are created during explicit validation if absent. The backend preserves
both paths, validates both, and leaves an existing saved selection intact if the
new selection fails. Validation does not invoke `su` or change folder permissions.

Supported desktop browsers use their native directory picker and retain handles
in IndexedDB. A browser handle does not disclose an absolute filesystem path and
cannot be passed to a different device's native helper. The Root WebUI therefore
uses the helper's directory browser or explicit path fields when it cannot open
the Android Files picker. Browser-only Android paths remain configuration choices
until a native runtime validates them; the UI does not claim they are writable.

## Validation

- 24 Node tests, including plan ownership, expiration, unknown-size consent,
  storage changes while review is pending, and preserving accepted plan IDs.
- Two Rust endpoint tests: independent Workspace/Output persistence, and failure
  to save an invalid output without overwriting a valid selection.
- Android release Kotlin compilation for the Files bridge.
- Source and Android WebView assets are synchronized by the release build script.
- Physical Infinix testing remains stopped; the Files picker has not been
  exercised on that device during this change.

API references: [Android document-tree selection](https://developer.android.com/training/data-storage/shared/documents-files)
and [Chrome File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access).
