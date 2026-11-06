# ENBX format reference

The static `src/enbx-metadata.xml` serialization contracts are reused from `SaveInfoMetadataFile.xml` in the real EasiNote sample at:

[Pinned original sample](https://github.com/EZ118/OpenEnow.JS/blob/dd05643000712b1755d44aef44b8b977ae8b4325/sample/courseware.enbx)

The package and image element layout were checked against the same sample. Only the minimal picture fixture documented below is included for tests; it is not bundled in the runtime application. Author account identifiers and courseware IDs are not included. The license for the reused metadata and fixture is in `LICENSE`.

`openenow.js` is the unchanged reader from `src/openenow.js` at the same pinned commit. It is used only in `npm run test:enbx` for independent interoperability checks, and is not part of the browser application's runtime bundle.

Generated output uses fresh slide/element identifiers and actual MD5 content hashes for resource references. This is an independent writer for the observed EasiNote 5.1 container, not an official Seewo SDK. Successful structural validation does not constitute opening the file in the Seewo client.

# Native picture regression fixture

`sample-picture.png` and `sample-picture.xml` are the first Picture element and its referenced resource from upstream `sample/courseware.enbx` at commit `dd05643000712b1755d44aef44b8b977ae8b4325`, under the existing MIT license. The PNG is **203 pixels wide, 152 high**; the real `PictureSize` is `203,152`, and `DisplayRegion/Rectangle` is `0,0,152,203`. These different axis orders must be checked with a non-square picture. The browser reader does not interpret those crop fields and cannot alone validate native client cropping.
