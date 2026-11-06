const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('system/dist/index.html','utf8');
const document = {documentElement:{},title:'',querySelector:()=>({}),querySelectorAll:()=>[],getElementById:()=>null};
const context={window:{},document};vm.createContext(context);vm.runInContext(fs.readFileSync('system/dist/i18n.js','utf8'),context);
const I=context.window.SeismicI18n;
const keys=[...html.matchAll(/data-i18n(?:-aria|-placeholder)?="([^"]+)"/g)].map(x=>x[1]);
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
assert.equal(ids.length,new Set(ids).size,'Duplicate HTML IDs');
for(const lang of ['es','en']) {
 I.apply(lang);assert.equal(document.documentElement.lang,lang);
 for(const key of keys) assert(Object.hasOwn(I.messages[lang],key),'Missing static translation: '+lang+':'+key);
 const samples={visible:{visible:'2',filtered:'3'},page:{first:'1',last:'40',total:'100'},loaded:{n:'24994',commit:'abc'},datasetText:{n:'24994',files:'46',latest:'2026-10-26'}};
 for(const [key,args] of Object.entries(samples))assert(!/[{}]/.test(I.t(key,args)),'Unresolved interpolation');
}
for(const file of ['app.js','map.js']) {
 const code=fs.readFileSync('system/dist/'+file,'utf8');
 const dynamic=[...code.matchAll(/(?:\bt|translate)\('([\w.]+)'/g)].map(x=>x[1]);
 for(const key of dynamic)for(const lang of ['es','en'])assert(Object.hasOwn(I.messages[lang],key),'Missing dynamic translation '+lang+':'+key);
}
const app=fs.readFileSync('system/dist/app.js','utf8');
for(const match of app.matchAll(/\$\('([^']+)'\)/g))assert(ids.includes(match[1]),'Missing referenced HTML ID '+match[1]);
console.log(JSON.stringify({static_translation_keys:keys.length,unique_ids:ids.length,languages:['es','en'],missing_keys:0,missing_literal_IDs:0}));
