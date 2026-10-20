# Universal Local Runtime

RVX uses one WebUI with two execution engines.

## Root devices

The native Rust daemon is installed by Magisk, KernelSU, or APatch. It serves the bundled WebUI from the module itself and performs patching with Morphe CLI. The browser and daemon use the same local origin, so no pairing step is required.

## Non-root browser

`web/rvx-local.html` is a generated single-file distribution. It embeds the complete interface, styles, source registry, presets, and application catalog. It can be opened directly or stored offline.

The current Morphe patching engine is Kotlin/Java and is launched through `java -jar`. It cannot execute inside a browser. Full browser patching therefore requires a WebAssembly patch engine that implements the same patch bundle, bytecode, resource, signing, and option semantics. Until that engine exists, the single-file distribution provides the local interface and metadata but must not claim that it can produce a patched APK.

## Browser engine contract

The future WebAssembly engine must:

1. Accept an APK or split bundle selected by the user.
2. Accept the exact `.mpp` release selected in the WebUI.
3. Verify package, version, patch metadata, and input hashes.
4. Apply bytecode, resource, and raw resource patches in a worker.
5. Sign the result locally.
6. Stream progress and memory use to the existing progress UI.
7. Write temporary data to OPFS and return the result through the browser save flow.

Root-only operations such as reading installed APK paths, bind mounting, and generating an active module remain native daemon capabilities.

## Build the single HTML file

```sh
node tools/build-single-html.mjs
```

The generated artifact is `web/rvx-local.html`.
