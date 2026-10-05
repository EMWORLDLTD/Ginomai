const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('lower-third fitting reserves bottom padding inside the configured band height', () => {
  const text = { style:{},dataset:{preferredSize:'64',fitBaseSize:'64'},scrollWidth:900,
    getBoundingClientRect(){return {bottom:20+4*parseFloat(this.style.fontSize)};} };
  const box = {style:{},dataset:{bandHeight:20},clientWidth:1000,scrollWidth:1000,
    // Browsers can omit trailing padding from scrollHeight when content overflows.
    get scrollHeight(){return Math.ceil(text.getBoundingClientRect().bottom);},
    getBoundingClientRect(){return {top:0};} };
  const slot = {clientHeight:1080,clientWidth:1080,querySelector:selector=>selector==='.card-box'?box:text};
  const window = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/output-fit.js'),'utf8'),{
    window,innerHeight:1080,addEventListener(){},requestAnimationFrame:callback=>callback(),
    getComputedStyle:el=>el===slot?{paddingTop:'40',paddingBottom:'40'}:{paddingBottom:'20',borderBottomWidth:'0'},
    document:{getElementById:()=>null,body:{classList:{contains:()=>false}},querySelectorAll:()=>[slot]}
  });
  window.scheduleOutputFit();
  assert.equal(box.style.maxHeight,'216px');
  assert.ok(text.getBoundingClientRect().bottom+20<=217,'text and bottom padding must both fit');
  assert.ok(parseFloat(text.style.fontSize)<45);
});
