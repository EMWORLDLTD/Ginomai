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

test('long full-screen announcement fits the output area and resets its size afterward', () => {
  let full = true;
  const alert = { classList: { contains: name => name === 'active' || (name === 'alert-fullscreen' && full) } };
  const text = { style: {},
    get scrollHeight() { return 20 * (parseFloat(this.style.fontSize) || 84); },
    scrollWidth: 1600
  };
  const box = { clientHeight: 1080, clientWidth: 1920 };
  const nodes = { 'live-alert-container': alert, 'live-alert-text-wrap': text, 'live-alert-box': box };
  const window = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/output-fit.js'), 'utf8'), {
    window, addEventListener() {}, requestAnimationFrame: callback => callback(),
    getComputedStyle: element => element === text ? { fontSize: '84px' } : { paddingTop: '65', paddingBottom: '65', paddingLeft: '115', paddingRight: '115' },
    document: { getElementById: id => nodes[id], body: { classList: { contains: () => false } }, querySelectorAll: () => [] }
  });
  window.scheduleOutputFit();
  assert.ok(text.scrollHeight <= 951);
  assert.ok(parseFloat(text.style.fontSize) > 47);
  full = false;
  window.scheduleOutputFit();
  assert.equal(text.style.fontSize, '');
});

test('fractional full-screen padding does not shrink a short announcement to one pixel', () => {
  const text = { style: {}, scrollWidth: 1690, get scrollHeight() { return Math.ceil(2.5 * (parseFloat(this.style.fontSize) || 84)); } };
  const nodes = { 'live-alert-container': { classList: { contains: () => true } },
    'live-alert-text-wrap': text, 'live-alert-box': { clientWidth: 1920, clientHeight: 1080 } };
  const window = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/output-fit.js'), 'utf8'), {
    window, addEventListener() {}, requestAnimationFrame: callback => callback(),
    getComputedStyle: element => element === text ? { fontSize: '84px' } : { paddingTop: '64.8px', paddingBottom: '64.8px', paddingLeft: '115.2px', paddingRight: '115.2px' },
    document: { getElementById: id => nodes[id], body: { classList: { contains: () => false } }, querySelectorAll: () => [] }
  });
  window.scheduleOutputFit();
  assert.equal(text.style.fontSize, '84px');
});

test('announcement manual scale enlarges short messages and reduces fitted long messages proportionally', () => {
  let lines = 2;
  const text = {style:{},dataset:{textScale:'2'},scrollWidth:1600,
    get scrollHeight(){return Math.ceil(lines * (parseFloat(this.style.fontSize) || 84));}};
  const nodes = {'live-alert-container':{classList:{contains:()=>true}},'live-alert-text-wrap':text,
    'live-alert-box':{clientWidth:1920,clientHeight:1080}};
  const window = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/output-fit.js'),'utf8'),{
    window,addEventListener(){},requestAnimationFrame:callback=>callback(),
    getComputedStyle:element=>element===text?{fontSize:'84px'}:{paddingTop:'65',paddingBottom:'65',paddingLeft:'115',paddingRight:'115'},
    document:{getElementById:id=>nodes[id],body:{classList:{contains:()=>false}},querySelectorAll:()=>[]}
  });
  window.scheduleOutputFit(); assert.equal(text.style.fontSize,'168px');
  text.dataset.textScale='1'; lines=20;
  window.scheduleOutputFit(); const fitted=parseFloat(text.style.fontSize);
  assert.ok(text.scrollHeight<=951);
  text.dataset.textScale='0.5'; window.scheduleOutputFit();
  assert.equal(parseFloat(text.style.fontSize),fitted*0.5,'minus must reduce a long message even after fitting');
  text.dataset.textScale=String(6/2.2); window.scheduleOutputFit();
  assert.ok(text.scrollHeight<=951,'maximum scale still fits the available output height');
});
