// The standalone build supplies this map before the application starts. The web
// build keeps using its normal static resources.
const assets = globalThis.__TIYE_ASSETS__;
const urls = new Map();
export const isOffline = Boolean(assets);

function bytes(name) {
  if (!assets?.[name]) throw new Error(`离线资源缺失：${name}，请重新下载完整 HTML。`);
  return Uint8Array.from(atob(assets[name]), c => c.charCodeAt(0));
}

export function resourceURL(name, type = 'application/octet-stream') {
  if (!assets) return name;
  if (!urls.has(name)) urls.set(name, URL.createObjectURL(new Blob([bytes(name)], {type})));
  return urls.get(name);
}

export function configureOfflinePDF(pdfjs) {
  if (!assets) return {};
  // Supply a real Blob worker port: PDF.js's URL origin check otherwise wraps
  // file:// workers in a dynamic import that browsers may disallow.
  pdfjs.GlobalWorkerOptions.workerPort = new Worker(resourceURL('/pdf/worker.js', 'text/javascript'));
  return {
    useWorkerFetch: false,
    CMapReaderFactory: class {
      async fetch({name}) {return {cMapData: bytes(`/pdf/cmaps/${name}.bcmap`), isCompressed: true};}
    },
    StandardFontDataFactory: class {
      async fetch({filename}) {return bytes(`/pdf/fonts/${filename}`);}
    },
  };
}

export function offlineOCR() {
  if (!assets) return {languages: ['chi_sim', 'eng'], options: {workerPath: '/ocr/worker.min.js', corePath: '/ocr/core', langPath: '/ocr/lang'}};
  const key = 'ocr-bootstrap';
  if (!urls.has(key)) {
    // Emscripten accepts wasmBinary directly, and Tesseract accepts language
    // byte arrays. Neither engine nor language loading needs fetch/importScripts.
    const script = new Blob([
      bytes('/ocr/core/tesseract-core-lstm.js'),
      '\n;const embeddedCore = TesseractCore; TesseractCore = options => embeddedCore({...options, wasmBinary: Uint8Array.from(atob(',
      JSON.stringify(assets['/ocr/core/tesseract-core-lstm.wasm']),
      '), c => c.charCodeAt(0))});\n',
      // Tesseract 6.0.1 loads language objects by .code, but initialize uses
      // .data as the name. Normalize that message before its own listener runs.
      `self.addEventListener('message', event => {
        if (event.data.action === 'initialize' && Array.isArray(event.data.payload.langs)) {
          event.data.payload.langs = event.data.payload.langs.map(lang => typeof lang === 'string' ? lang : lang.code);
        }
      });\n`,
      bytes('/ocr/worker.min.js'),
    ], {type: 'text/javascript'});
    urls.set(key, URL.createObjectURL(script));
  }
  return {
    languages: ['chi_sim', 'eng'].map(code => ({code, data: bytes(`/ocr/lang/${code}.traineddata.gz`)})),
    options: {workerPath: urls.get(key), workerBlobURL: false, cacheMethod: 'none'},
  };
}
