// Browser storage stays on this device/profile; it is never part of an HTML,
// ZIP, answer JSON or courseware export. Each endpoint has its own credential.
const STORAGE_KEY = 'tiye.api-keys.v1';
export function credentialScope(auto) {
  try {const url=new URL(auto.base);return `${auto.preset || 'custom'}|${url.origin}${url.pathname.replace(/\/$/,'')}`;}
  catch {return '';}
}
export function createCredentialStore(storage) {
  const read=()=>{
    try {const value=JSON.parse(storage?.getItem(STORAGE_KEY) || '{}');return value.version===1 && value.profiles && typeof value.profiles==='object' ? value : {version:1,profiles:{}};}
    catch {return {version:1,profiles:{}};}
  };
  const write=data=>{
    try {if(!storage) return false;storage.setItem(STORAGE_KEY,JSON.stringify(data));return true;}catch{return false;}
  };
  return {
    restore(defaults) {
      const data=read(),saved=data.profiles[data.last];
      return saved?.key ? {...defaults,...saved,remember:true} : {...defaults,remember:false};
    },
    select(auto) {
      const saved=read().profiles[credentialScope(auto)];
      return {...auto,key:saved?.key || '',remember:Boolean(saved?.key)};
    },
    save(auto) {
      const scope=credentialScope(auto);if(!scope) return !auto.remember;
      const data=read();
      if(auto.remember && auto.key.trim()) {
        data.profiles[scope]={preset:auto.preset,base:auto.base,model:auto.model,via:auto.via,proxy:auto.proxy,key:auto.key};
        data.last=scope;
      } else {
        delete data.profiles[scope];if(data.last===scope) delete data.last;
      }
      return write(data);
    },
    clear() {try {storage?.removeItem(STORAGE_KEY);return true;}catch{return false;}},
  };
}
export function browserCredentialStore() {
  let storage;
  try {storage=globalThis.localStorage;}catch{ /* file:// or browser policy may block storage */ }
  return createCredentialStore(storage);
}
