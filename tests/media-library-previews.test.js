'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

function fixture(themes={}) {
  class Element {
    constructor(tag) {this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.classes=new Set();this.isConnected=true;this.paused=true;this.currentTime=0;this.volume=1;this.playCount=0;this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),toggle:(name,active)=>active?this.classes.add(name):this.classes.delete(name)};}
    get isConnected() {return this.parent?this.parent.isConnected:this.connected;}
    set isConnected(value) {this.connected=value;}
    append(...nodes) {for(const node of nodes)node.parent=this;this.children.push(...nodes);}
    prepend(...nodes) {for(const node of nodes)node.parent=this;this.children.unshift(...nodes);}
    replaceChildren(...nodes) {this.children=nodes;}
    setAttribute(name,value) {this.attributes[name]=value;}
    querySelector(selector) {for(const node of this.children) {if(selector.startsWith('.')?node.className?.split(' ').includes(selector.slice(1)):node.tagName===selector.toUpperCase()) return node;const nested=node.querySelector(selector);if(nested)return nested;}return null;}
    play() {this.paused=false;this.playCount++;return Promise.resolve();}
    pause() {this.paused=true;}
  }
  const elements=new Map(),listeners=new Map(),observers=[];
  const document={hidden:false,createElement:tag=>new Element(tag),getElementById:id=>{if(!elements.has(id))elements.set(id,new Element('div'));return elements.get(id);},addEventListener:(name,callback)=>listeners.set(name,callback),querySelectorAll:()=>[]};
  const state={currentTab:'media'},window={state,SANCTUARY_THEMES:themes,PresentationModel:require('../js/presentation-model'),addEventListener:(name,callback)=>listeners.set(name,callback)};
  const context={window,document,REMOTE_MODE:false,MutationObserver:class {constructor(callback){observers.push(callback);}observe(){}},fetch:async()=>({ok:true,json:async()=>({items:[]})}),setTimeout,clearTimeout,setInterval:()=>0,URLSearchParams,console};
  const source=fs.readFileSync(require.resolve('../js/presentation-library.js'),'utf8').replace(/\}\)\(\);\s*$/,'window.__previewTest={mediaLibraryCard};})();');
  vm.runInNewContext(source,context);
  const card=asset=>window.__previewTest.mediaLibraryCard({pageCount:1,pages:{},...asset});
  return {card,state,window,document,observers,listeners};
}
const asset=(id,kind='video')=>({id,name:id+'.'+(kind==='video'?'webm':kind==='pdf'?'pdf':'png'),kind,url:'/presentation/files/'+id+'.webm'});

test('video previews stay silent, only the hovered video plays, and leaving rewinds it',()=>{
  const {card}=fixture(),first=card(asset('media_a111')),second=card(asset('media_b222'));
  const a=first.querySelector('video'),b=second.querySelector('video');
  assert.equal(a.muted,true);assert.equal(a.defaultMuted,true);assert.equal(a.playsInline,true);assert.equal(a.paused,true);assert.equal(a.playCount,0);
  first.onpointerenter();assert.equal(a.paused,false);assert.equal(a.volume,0);
  a.currentTime=12;second.onpointerenter();assert.equal(a.paused,true);assert.equal(a.currentTime,0);assert.equal(b.paused,false);
  b.currentTime=9;second.onpointerleave();assert.equal(b.paused,true);assert.equal(b.currentTime,0);
});

test('dragging preserves the agenda payload and silently previews until the drag ends',()=>{
  const {card}=fixture(),row=card(asset('media_a111')),video=row.querySelector('video');let payload;
  row.ondragstart({dataTransfer:{setData:(type,id)=>{payload={type,id};}}});
  assert.deepEqual(payload,{type:'application/presentation-id',id:'media_a111'});assert.equal(video.paused,false);assert.equal(video.muted,true);
  row.onpointerleave();assert.equal(video.paused,false);
  row.ondragend();assert.equal(video.paused,true);assert.equal(video.currentTime,0);
});

test('selecting a card updates existing indicators and stops its preview',()=>{
  const {card,window}=fixture(),first=card(asset('media_a111')),second=card(asset('media_b222'));let selected;
  window.openPresentationItem=item=>{selected=item;};const originalPreview=first.children[0];
  first.onpointerenter();first.onclick();assert.equal(first.classes.has('active'),true);assert.equal(first.querySelector('video').paused,true);
  second.onclick();assert.equal(first.classes.has('active'),false);assert.equal(second.classes.has('active'),true);assert.equal(selected.id,'media_b222');assert.equal(first.children[0],originalPreview);
});

test('image and PDF cards show their media and the PDF first-page thumbnail',()=>{
  const {card}=fixture();const image=card({...asset('media_a111','image'),url:'/presentation/files/welcome.png'});
  assert.equal(image.querySelector('img').src,'/presentation/files/welcome.png');
  const pdf=card({...asset('media_c333','pdf'),pageCount:3,pages:{1:{thumbnailUrl:'/presentation/files/first-thumb.png',url:'/presentation/files/first.png'},2:{thumbnailUrl:'/presentation/files/second.png'}}});
  assert.equal(pdf.querySelector('img').src,'/presentation/files/first-thumb.png');assert.equal(pdf.querySelector('img').alt,'First page of media_c333.pdf');
  const fallback=pdf.querySelector('.media-library-fallback');pdf.querySelector('img').onload();assert.equal(fallback.hidden,true);
  pdf.querySelector('img').onerror();assert.equal(fallback.hidden,false);assert.equal(fallback.textContent,'Preview unavailable');
});

test('previews stop when their cards disappear or the document becomes hidden',()=>{
  const {card,window,document,observers,listeners}=fixture();window.renderMediaLibrary();
  const row=card(asset('media_a111')),video=row.querySelector('video');row.onpointerenter();row.isConnected=false;observers[0]();assert.equal(video.paused,true);
  row.isConnected=true;row.onpointerenter();document.hidden=true;listeners.get('visibilitychange')();assert.equal(video.paused,true);
});

test('bundled stills and motion are present without uploads and replace the upload box',async()=>{
  const themes={still:{id:'still',name:'Golden still',type:'image',imageUrl:'Themes/golden_sunrise.webp'},motion:{id:'motion',name:'Golden motion',type:'video',videoUrl:'Themes/golden_sunrise_loop.webm',imageUrl:'Themes/golden_sunrise.webp'},duplicate:{id:'duplicate',name:'Duplicate',type:'image',imageUrl:'Themes/golden_sunrise.webp'},gradient:{id:'gradient',type:'gradient'}};
  const f=fixture(themes);f.window.renderMediaLibrary();const host=f.document.getElementById('bento-library-list');
  assert.equal(host.children.some(node=>node.id==='media-dropzone'),false);assert.equal(host.children.length,2);
  assert.equal(host.children[0].querySelector('img').src,'Themes/golden_sunrise.webp');assert.equal(host.children[1].querySelector('video').poster,'Themes/golden_sunrise.webp');
  await new Promise(resolve=>setImmediate(resolve));assert.equal(host.children.length,2);
  f.window.renderMediaLibrary('no matching media');assert.equal(host.children.some(node=>node.id==='media-dropzone'),false);
});

test('an empty library keeps its upload prompt and a populated library accepts file drops',()=>{
  const f=fixture();f.window.renderMediaLibrary();const host=f.document.getElementById('bento-library-list');
  assert.equal(host.children.some(node=>node.id==='media-dropzone'),true);
  let uploaded,prevented=false,absorbed=false;f.window.uploadPresentationMedia=files=>{uploaded=files;};const files=[{name:'welcome.png'}];
  host.ondrop({dataTransfer:{files},preventDefault:()=>{prevented=true;},stopPropagation:()=>{absorbed=true;}});
  assert.equal(uploaded,files);assert.equal(prevented,true);assert.equal(absorbed,true);
});
