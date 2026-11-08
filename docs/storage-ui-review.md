# Storage UI review — 2.1.42

## Changes

- Give download consent and directory selection their own opaque panel. Hide the
  parent panel while the directory picker is open, retaining the modal focus stack.
- Put storage selection first. Show destination and free space once; keep the
  download file list in an expandable section.
- Let long paths wrap and scroll within a bounded path area. Let folder rows grow
  to contain long names. Remove repeated free-space labels from every folder.
- Add a filter for the current directory, a folder count, and an empty result state.
- Keep footer actions outside scrolling content. Use a two-column directory view
  on short landscape screens and a scrolling body on short portrait screens.
- Remove obsolete 36-pixel widths from shared text buttons. Use readable labels,
  inputs at 16 px and touch controls of at least 44 px in these dialogs.
- Remove duplicate legacy storage choices and label private app storage clearly.
- Ignore obsolete directory responses and responses received after closure.
  Preserve access errors with retry and root-location controls.
- Validate empty custom paths locally. Open file-permission settings only through
  the user's explicit button action.
- Use the same confirmation guard for checkbox changes and starting a build.
  Editing storage, insufficient space, an unavailable runtime, missing browser
  APK input, and unknown sizes without consent keep the action blocked.

## Verification

- 19 Node tests pass, including delayed navigation, closure during a request,
  denied directory access and download confirmation requirements.
- JavaScript syntax checks and Git whitespace checks pass.
- Local browser previews use simulated storage data and the actual HTML, CSS,
  storage workflow and event bindings. Reviewed 320×568, 360×740, 390×844,
  740×360, 360×400 and 1280×800. No document horizontal overflow was observed.
- Checked long folder names, long paths, scrolling, search/no match, access
  denied/recovery, selecting and saving storage, and editing a validated location.
- Checked that accepting unknown sizes leaves confirmation disabled when storage
  is insufficient.
- Both release APKs build successfully and verify with the permanent release
  certificate. Packaged web assets match source bytes; the native executable is
  ARM64. Version 2.1.42 uses Android versionCode 20261104.

## Device status

Infinix testing was stopped at the user's request. Version 2.1.42 has not been
installed or tested on that device. Local fixture previews do not establish
actual Android filesystem permissions or end-to-end patch success.

Visual evidence: `build_out/release-validation/storage-picker-2.1.42.png`.
Release artifacts: `build_out/releases/2.1.42/`, including SHA256SUMS.txt.
