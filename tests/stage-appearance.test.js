const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
test('transition controls open directly and close without a dismissal shield', () => {
 const make = () => ({ hidden:true, attrs:{}, classes:new Set(), setAttribute(k,v){this.attrs[k]=v;}, contains(){return false;}, get classList(){return {add:k=>this.classes.add(k),remove:k=>this.classes.delete(k)};} });
 const ids = Object.fromEntries(['stage-appearance-panel','stage-appearance-toggle','bento-trans-wrapper','bento-trans-trigger','bento-trans-dialog'].map(k=>[k,make()]));
 const c=vm.createContext({document:{getElementById:k=>ids[k]},syncTransitionSettingsUI(){}});
 vm.runInContext(source.slice(source.indexOf('function openTransitionDialog()'),source.indexOf('function toggleTransitionDialog(')),c);
 c.openTransitionDialog();
 assert.equal(ids['bento-trans-wrapper'].classes.has('open'),true);
 c.closeTransitionDialog();

 assert.equal(ids['bento-trans-wrapper'].classes.has('open'),false);
 assert.equal(ids['bento-trans-trigger'].attrs['aria-expanded'],'false');
});
