# ENBX format reference

The static `src/enbx-metadata.xml` serialization contracts are reused from `SaveInfoMetadataFile.xml` in the real EasiNote sample at:

[Pinned original sample](https://github.com/EZ118/OpenEnow.JS/blob/dd05643000712b1755d44aef44b8b977ae8b4325/sample/courseware.enbx)

The package and image element layout were checked against the same sample. No sample lesson content, media, author account identifiers or courseware IDs are included in this application. The license for the reused metadata is in `LICENSE`.

`openenow.js` is the unchanged reader from `src/openenow.js` at the same pinned commit. It is used only in `npm run test:enbx` for independent interoperability checks, and is not part of the browser application's runtime bundle.

Generated output uses fresh slide/element identifiers and actual MD5 content hashes for resource references. This is an independent writer for the observed EasiNote 5.1 container, not an official Seewo SDK. Successful structural validation does not constitute opening the file in the Seewo client.
