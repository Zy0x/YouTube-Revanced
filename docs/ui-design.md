# RVX interface

The `web` directory is the source of truth. Android assets and the standalone
HTML are generated from it.

## Visual conventions

- Warm neutral surfaces, one coral accent, no decorative gradients or glows.
- App icons retain their own branding. Interface icons use the existing SVG set.
- Primary text uses the system sans-serif font. Monospace is reserved for
  versions, package identifiers and logs.
- Important body text is 14–16 px; supporting descriptions are 12–13 px.
- Color tokens live in `web/css/editorial-base.css`. Shared layout and workflow
  components live in `web/css/editorial-workbench.css`.
- Status colors communicate verified results. An unknown result stays neutral.
- Main actions stay in the wizard footer. Configuration can be saved even when
  the current runtime cannot build an APK.

## Behavior

- Selecting an app or version does not advance the wizard. The user chooses
  **Lanjut** explicitly. Earlier steps remain accessible through navigation.
- Installed versions are context, not evidence of patch compatibility.
- Recommended presets read the source's `use`, `enabledByDefault` or `default`
  flags. When defaults are absent, only recognized core features are proposed.
  Unknown applications do not receive an arbitrary fallback.
- Device diagnostics distinguish the requested install mode from measured root
  access. Failed or incomplete checks never become successful checks.
- Opening a saved app restores the selected source and release before applying
  saved patches. Opening the card never starts a build.
- Result actions require a successful build and its output file/blob. The result
  belongs to the app, release, version, mode, patches, options, engine settings
  and input APK that produced it. Editing any of those invalidates result actions.
- Installation is explicit. A completed build does not launch an installer.
- Browser builds can be cancelled. The current native helper has no cancellation
  endpoint; the UI does not pretend that closing logs stops the native process.
- Dialogs contain keyboard focus and restore it when closed. Background content
  is inert while a dialog is open.
- Storage and download dialogs use an opaque surface, a scrolling body and a
  footer that stays visible. `web/css/storage.css` owns their responsive layout.
- Select storage before reviewing download details. Show the destination and
  free space once; download details expand on demand. Long paths wrap, while
  long folder names increase their row height instead of overlapping neighbors.
- The directory picker filters the current directory only. It preserves explicit
  access errors and permitted root locations, ignores outdated responses, and
  disables selection while loading or when a directory cannot be written.
- Editing storage invalidates the download plan. Accepting an unknown file size
  cannot bypass storage, runtime or browser input APK requirements. File access
  settings open only through the user's explicit permission action.

## Validation and distribution

```sh
node tools/build-single-html.mjs
node --test tools/test-ui.mjs
node tools/sync-web-assets.mjs
```

For visual review, serve `web` on a local HTTP server and check the wizard,
source/release/version dialogs, patch options, and dashboard at phone and desktop
widths. Browser-only mode must identify its runtime limitations before build.
Native build/install verification requires the actual Android runtime.
