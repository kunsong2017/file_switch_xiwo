import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCredentialStore} from '../src/credentials.js';
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
const auto={preset:'deepseek',base:'https://api.deepseek.com/chat/completions',model:'deepseek-flash',key:'local-test-key',remember:true};
test('本浏览器可恢复，分享给另一个浏览器没有 Key',()=>{
  const device=storage();createCredentialStore(device).save(auto);
  assert.equal(createCredentialStore(device).restore({key:''}).key,auto.key);
  assert.equal(createCredentialStore(storage()).restore({key:''}).key,'');
});
test('Key 按接口隔离，取消记住或清除后不再恢复',()=>{
  const store=createCredentialStore(storage());store.save(auto);
  assert.equal(store.select({...auto,preset:'qwen',base:'https://dashscope.aliyuncs.com/v1/chat/completions'}).key,'');
  assert.equal(store.select({...auto,base:'https://different.example/chat/completions'}).key,'');
  store.save({...auto,remember:false});assert.equal(store.restore({key:''}).key,'');
  store.save(auto);store.clear();assert.equal(store.restore({key:''}).key,'');
});
test('禁用浏览器存储时保留临时模式，不崩溃也不假装保存成功',()=>{
  const blocked={getItem(){throw Error();},setItem(){throw Error();}};
  const store=createCredentialStore(blocked);
  assert.equal(store.save(auto),false);assert.equal(store.restore({key:''}).remember,false);
});
