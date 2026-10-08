'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const shared = fs.readFileSync(require.resolve('../js/stream-appearance.js'),'utf8');
const controls = fs.readFileSync(require.resolve('../js/presentation-controls.js'),'utf8');
function fixture() {
  const sent = [], saved = new Map();
  const state = {currentMode:'full',activeLiveSlideId:'bible_Genesis_3_1',activeLiveText:'Live verse',isHoldLive:false};
  const window = {state,getProjectionWorkflow:()=> 'preview',getPreparedSlide:()=>({text:'Cued verse'}),
    broadcastState:payload=>sent.push(payload),showToast(){},
    themeManager:{obsModeRule:'follow',updateSanctuaryUi(){}},syncBentoStagePreview(){}};
  const c = {window,REMOTE_MODE:false,document:{getElementById:()=>null,addEventListener(){}},
    localStorage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)}};
  vm.runInNewContext(shared+'\n'+controls,c);
  return {window,state,sent,saved};
}
test('appearance and layout setters cannot publish outside an explicit draft',()=>{
  const {window,state,sent,saved}=fixture();
  window.updateStreamAppearance({referenceStyle:'tab',height:20});
  window.setStreamLayout('lt');
  assert.equal(state.activeLiveText,'Live verse');
  assert.equal(state.currentMode,'full');
  assert.equal(window.themeManager.obsModeRule,'follow');
  assert.equal(state.streamAppearance.height,28);
  assert.equal(sent.length,0);
  assert.equal(saved.size,0);
});
test('Hold prevents publication while blackout remains immediately available',()=>{
  const {window,state,sent}=fixture();
  state.isHoldLive=true;
  window.updateStreamAppearance({height:20});
  window.setStreamLayout('lt');
  assert.equal(state.currentMode,'full');
  assert.equal(state.streamAppearance.height,28);
  assert.equal(sent.length,0);
  window.blackoutAllOutputs();
  assert.equal(sent[0].blackout,true);
});
test('shared renderer confines image backgrounds to host media and resets lower-third styles for other targets',()=>{
  const {window} = fixture();
  const properties = {}, classes = new Set();
  const box = {dataset:{},style:{setProperty:(key,value)=>properties[key]=value},classList:{
    toggle:(key,on)=>on?classes.add(key):classes.delete(key),remove:key=>classes.delete(key)}};
  const data = {streamAppearance:{surface:'image',imageUrl:'/media/uploads/test.jpg',opacity:65,height:20,position:80,referenceStyle:'tab'}};
  window.applyStreamAppearance(box,data,true);
  assert.match(properties['--broadcast-surface'],/rgba\(15,23,42,0.65\).*test.jpg/);
  assert.equal(properties['--broadcast-image-position'],'center 80%');
  assert.equal(box.dataset.bandHeight,20);
  assert.ok(classes.has('broadcast-reference-tab'));
  window.applyStreamAppearance(box,data,false);
  assert.ok(!classes.has('broadcast-card'));
  assert.equal(box.dataset.bandHeight,undefined);
  const invalid = window.normalizeStreamAppearance({imageUrl:'https://external.example/track',height:100,opacity:400,position:-3});
  assert.equal(invalid.imageUrl,'');
  assert.equal(invalid.height,28);
  assert.equal(invalid.opacity,100);
  assert.equal(invalid.position,0);
});

function draftFixture() {
  const sent=[],saved=new Map(),messages=[],fields=new Map();
  let created=0;
  const field=id=> {
    if(!fields.has(id)) fields.set(id,{hidden:id==='presentation-settings',parentElement:{style:{}},style:{},dataset:{},textContent:'',value:'',disabled:false,
      setAttribute(key,value){this[key]=value;},getAttribute(key){return this[key] || null;},focus(){},closest(){return this;},
      replaceChildren(){this.children=[];},append(node){node.parent=this;this.children.push(node);},remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);},pause(){},children:[],addEventListener(){},querySelector(selector){return selector?.startsWith('.')?this.children.find(node=>node.className===selector.slice(1)) || null:selector==='video'?null:field('button');},querySelectorAll(){return [];},getClientRects(){return [1]},
      getBoundingClientRect(){return {left:1000,top:100}},contentWindow:{postMessage:payload=>messages.push({...payload,frameId:id})}});
    return fields.get(id);
  };
  const state={currentMode:'full',textSize:1,songScaleFull:2.2,songScaleLt:1.4,activeLiveSlideId:'bible_1',activeLiveText:'Current live verse',activeLiveRef:'Genesis 1:1',isHoldLive:false};
  const manager={activeSanctuaryTheme:'celestial_motion',sanctuaryFont:'Outfit',sanctuaryDimmer:30,sanctuaryFits:{},obsModeRule:'follow',
    getSanctuaryPayload(value=this){return {id:value.activeSanctuaryTheme,font:value.sanctuaryFont,dimmer:value.sanctuaryDimmer,obsModeRule:value.obsModeRule};}};
  const window={state,themeManager:manager,previewTargetMode:'dual',location:{origin:'http://localhost'},innerWidth:1400,innerHeight:900,SANCTUARY_THEMES:{},
    broadcastState:payload=>sent.push({...payload,text:state.activeLiveText}),showToast(){},dismissAllOverlays(){},setPreviewTargetMode(){},loadSanctuaryUploads:async()=>{},addEventListener(){}};
  const c={window,REMOTE_MODE:false,document:{getElementById:field,addEventListener(){},createElement(){return field('created-'+ ++created)}},localStorage:{getItem:()=>null,setItem:(key,value)=>saved.set(key,value)}};
  vm.runInNewContext(shared+'\n'+controls,c);
  return {window,state,sent,saved,fields,field,messages,manager,context:c};
}
test('draft edits and cancel never publish; Apply merges only edited appearance fields into latest live state',async()=>{
 const {window,state,sent,saved,field,manager}=draftFixture();
 window.syncPresentationControls({clear:true,blackout:false,contentType:'bible'});
 await window.togglePresentationSettings();
 window.updateStyleDraft({sanctuaryDimmer:65});window.updateStreamAppearance({height:20});
 assert.equal(manager.sanctuaryDimmer,30);assert.equal(state.streamAppearance.height,28);assert.equal(sent.length,0);assert.equal(saved.size,0);
 window.closePresentationSettings();assert.equal(sent.length,0);assert.equal(manager.sanctuaryDimmer,30);
 await window.togglePresentationSettings();window.updateStyleDraft({sanctuaryDimmer:70});window.setStreamLayout('lt');
 state.activeLiveText='A newer live verse';state.textSize=1.7;state.transitionType='slide-up';manager.sanctuaryFont='Inter';
 window.syncPresentationControls({clear:false,blackout:true,contentType:'bible'});
 window.applyStyleDraft();assert.equal(sent.length,1);assert.equal(sent[0].text,'A newer live verse');assert.equal(sent[0].blackout,true);
 assert.equal(manager.sanctuaryDimmer,70);assert.equal(manager.sanctuaryFont,'Inter');assert.equal(state.textSize,1.7);assert.equal(state.transitionType,'slide-up');assert.equal(manager.obsModeRule,'always_lt');assert.equal(field('presentation-settings').hidden,true);
 window.applyStyleDraft();assert.equal(sent.length,1);
});
test('Hold permits local appearance previews and blocks Apply until released',async()=>{
 const {window,state,sent,manager,field}=draftFixture();state.isHoldLive=true;
 await window.togglePresentationSettings();window.updateStyleDraft({sanctuaryDimmer:80});window.updateStreamAppearance({height:20});
 assert.equal(field('style-apply').disabled,true);window.applyStyleDraft();assert.equal(sent.length,0);assert.equal(manager.sanctuaryDimmer,30);
 state.isHoldLive=false;window.syncPresentationControls();window.applyStyleDraft();assert.equal(sent.length,1);assert.equal(manager.sanctuaryDimmer,80);assert.equal(state.streamAppearance.height,20);
});
test('Style uses sample lyrics during media and late background uploads cannot alter a reopened draft',async()=>{
 const {window,state,manager,field,messages}=draftFixture();
 window.syncPresentationControls({contentType:'media',media:{kind:'video',url:'/presentation/files/media_a.webm'}});
 await window.togglePresentationSettings();window.updateStyleDraft({sanctuaryDimmer:55});
 assert.equal(messages.at(-1).payload.contentType,'song');assert.equal(messages.at(-1).payload.media,null);
 let complete;
 window.uploadSanctuaryBackgrounds=async(input,options)=>new Promise(resolve=>complete=()=>{options.onSaved({id:'upload_late'});resolve();});
 const pending=window.uploadStyleBackground({value:''});
 window.closePresentationSettings();await window.togglePresentationSettings();
 window.updateStyleDraft({sanctuaryDimmer:60});complete();await pending;
 window.applyStyleDraft();
 assert.equal(manager.activeSanctuaryTheme,'celestial_motion');assert.equal(manager.sanctuaryDimmer,60);
 assert.equal(state.activeLiveText,'Current live verse');assert.equal(field('presentation-settings').hidden,true);
});
test('switching draft destinations retains both frames and delivers only to the selected preview',async()=>{
 const {window,field,messages,sent}=draftFixture();
 const navigations=[];
 for(const id of ['style-preview-frame','style-preview-livestream-frame']) {
   let src='';Object.defineProperty(field(id),'src',{get:()=>src,set:value=>{src=value;navigations.push(value);}});
 }
 await window.togglePresentationSettings();assert.equal(navigations.length,2);
 window.setStyleTarget('livestream');assert.equal(field('style-preview-frame').hidden,true);
 assert.equal(field('style-preview-livestream-frame').hidden,false);
 assert.equal(messages.at(-1).frameId,'style-preview-livestream-frame');
 window.setStyleTarget('sanctuary');window.setStyleTarget('livestream');
 assert.equal(navigations.length,2);assert.equal(sent.length,0);
});
test('known backgrounds appear before upload loading completes; panel switching and reopening preserve card nodes',async()=>{
 const {window,field,sent}=draftFixture();
 window.SANCTUARY_THEMES={one:{name:'One',type:'minimal'},two:{name:'Two',type:'minimal'}};
 let finishLoading;
 window.loadSanctuaryUploads=()=>new Promise(resolve=>finishLoading=resolve);
 const opening=window.togglePresentationSettings();
 assert.equal(field('presentation-settings').hidden,false);
 const cards=[...field('style-background-list').children];assert.equal(cards.length,2);
 window.setStyleTarget('livestream');window.filterStyleBackgrounds('minimal');window.setStyleTarget('sanctuary');
 assert.deepEqual(field('style-background-list').children,cards);
 finishLoading();await opening;
 assert.deepEqual(field('style-background-list').children,cards);
 window.closePresentationSettings();
 window.loadSanctuaryUploads=async()=>{};await window.togglePresentationSettings();
 assert.deepEqual(field('style-background-list').children,cards);
 assert.equal(sent.length,0);
});
test('destination switches reuse sized preview frames and cached cards while hidden thumbnail work is suspended',async()=>{
 const {window,field}=draftFixture();let measurements=0,disposed=0,refreshes=0,isActive;
 window.getOutputPreviewDimensions=destination=>{measurements++;return destination==='sanctuary'?{width:1920,height:1080}:{width:1280,height:720};};
 window.createBackgroundThumbnails=(root,active)=>{isActive=active;return {attach(){},refresh(){refreshes++;},dispose(){disposed++;}};};
 await window.togglePresentationSettings();const measured=measurements;
 window.setStyleTarget('livestream');
 assert.equal(field('style-preview-livestream-frame').parentElement.style.aspectRatio,'1280/720');
 window.setStyleTarget('sanctuary');assert.equal(measurements,measured);
 window.closePresentationSettings();assert.equal(!!isActive(),false);assert.equal(disposed,0);
 await window.togglePresentationSettings();assert.equal(!!isActive(),true);assert.equal(disposed,0);assert.ok(refreshes>0);
});
test('Image opens saved uploads without a file picker; lower-third image selection stays in the draft and preserves cards',async()=>{
 const {window,field,state,sent}=draftFixture();
 window.SANCTUARY_THEMES={a:{name:'Slate.jpg',custom:true,type:'image',imageUrl:'/media/uploads/a.jpg'},b:{name:'Light.png',custom:true,type:'image',imageUrl:'/media/uploads/b.png'},video:{name:'Motion',custom:true,type:'video',videoUrl:'/media/uploads/video.webm'},builtin:{name:'Built in',type:'image',imageUrl:'Themes/built-in.webp'}};
 await window.togglePresentationSettings();window.setStyleTarget('livestream');window.setStreamLayout('lt');
 const cards=[...field('stream-image-list').children];assert.equal(cards.length,2);
 let opened=0;field('stream-image-upload').click=()=>opened++;
 window.updateStreamAppearance({surface:'image'});
 assert.equal(opened,0);assert.equal(field('stream-image-library').hidden,false);
 cards[0].children[0].onclick();assert.equal(cards[0].children[0]['aria-pressed'],'true');assert.equal(field('stream-image-name').textContent,'Slate.jpg');
 cards[1].children[0].onclick();assert.equal(cards[0].children[0]['aria-pressed'],'false');assert.equal(cards[1].children[0]['aria-pressed'],'true');
 assert.equal(state.streamAppearance.imageUrl,'');assert.equal(sent.length,0);
 window.updateStreamAppearance({surface:'none'});assert.equal(field('stream-image-library').hidden,true);
 window.updateStreamAppearance({surface:'image'});window.refreshStyleGallery();assert.deepEqual(field('stream-image-list').children,cards);
 window.applyStyleDraft();assert.equal(state.streamAppearance.imageUrl,'/media/uploads/b.png');assert.equal(sent.length,1);
});
test('overlay library refresh adds and removes uploaded images without rebuilding existing image cards',async()=>{
 const {window,field}=draftFixture();await window.togglePresentationSettings();
 window.updateStreamAppearance({surface:'image'});assert.equal(field('stream-image-empty').hidden,false);
 window.SANCTUARY_THEMES.a={name:'First.jpg',custom:true,type:'image',imageUrl:'/media/uploads/a.jpg'};
 window.refreshStyleGallery();const first=field('stream-image-list').children[0];assert.equal(field('stream-image-empty').hidden,true);
 window.SANCTUARY_THEMES.b={name:'Second.png',custom:true,type:'image',imageUrl:'/media/uploads/b.png'};
 window.refreshStyleGallery();assert.equal(field('stream-image-list').children[0],first);
 delete window.SANCTUARY_THEMES.b;window.refreshStyleGallery();assert.deepEqual(field('stream-image-list').children,[first]);
});
test('bottom fade applies only behind visible text-only overlays and clears on output changes',()=>{
 const {window}=fixture(),properties={};
 const layer={hidden:true,style:{setProperty:(key,value)=>properties[key]=value}};
 const data={text:'You alone are my heart\'s desire',contentType:'song',streamAppearance:{surface:'none',bottomFade:true,opacity:75}};
 assert.equal(window.normalizeStreamAppearance().bottomFade,false);
 assert.equal(window.normalizeStreamAppearance({bottomFade:'true'}).bottomFade,false);
 window.applyStreamBottomFade(layer,data,true);
 assert.equal(layer.hidden,false);assert.equal(properties['--broadcast-fade-opacity'],.75);
 for(const patch of [{clear:true},{blackout:true},{livestreamActive:false},{text:'',reference:''},{isLexicon:true},{slideId:'lexicon_H1'},{contentType:'media'},{contentType:'countdown'},
   {streamAppearance:{surface:'none',bottomFade:false}},{streamAppearance:{surface:'solid',bottomFade:true}},{streamAppearance:{surface:'image',bottomFade:true}}, {streamAppearance:null}]) {
   window.applyStreamBottomFade(layer,{...data,...patch},true);assert.equal(layer.hidden,true);
   window.applyStreamBottomFade(layer,data,true);assert.equal(layer.hidden,false);
 }
 window.applyStreamBottomFade(layer,data,false);assert.equal(layer.hidden,true);
});

test('bottom fade previews locally, cancels cleanly, and persists only after Apply',async()=>{
 const {window,state,field,messages,sent,saved}=draftFixture();
 window.previewTargetMode='livestream';
 await window.togglePresentationSettings();
 assert.equal(field('style-layout').value,'always_lt');
 assert.equal(field('stream-bottom-fade-row').hidden,true);
 window.updateStreamAppearance({surface:'none',bottomFade:true});
 assert.equal(field('stream-bottom-fade-row').hidden,false);assert.equal(field('stream-bottom-fade').checked,true);
 assert.equal(field('stream-opacity-row').hidden,true);assert.equal(field('stream-fade-strength-row').hidden,false);
 window.updateStreamAppearance({opacity:35});
 assert.equal(field('stream-fade-strength').value,35);assert.equal(field('stream-fade-strength-value').textContent,'35%');
 assert.equal(messages.at(-1).payload.streamAppearance.opacity,35);assert.equal(state.streamAppearance.opacity,90);
 assert.equal(messages.at(-1).payload.streamAppearance.bottomFade,true);
 assert.equal(state.streamAppearance.bottomFade,false);assert.equal(sent.length,0);assert.equal(saved.size,0);
 window.closePresentationSettings();
 await window.togglePresentationSettings();assert.equal(field('stream-bottom-fade').checked,false);
 window.updateStreamAppearance({surface:'none',bottomFade:true,opacity:35});window.applyStyleDraft();
 assert.equal(state.streamAppearance.bottomFade,true);assert.equal(sent.length,1);
 assert.equal(JSON.parse(saved.get('sf_stream_appearance')).bottomFade,true);
 assert.equal(JSON.parse(saved.get('sf_stream_appearance')).opacity,35);
 await window.togglePresentationSettings();window.updateStreamAppearance({bottomFade:false});
 assert.equal(field('stream-opacity-row').hidden,true);assert.equal(field('stream-fade-strength-row').hidden,true);assert.equal(messages.at(-1).payload.streamAppearance.bottomFade,false);
 window.applyStyleDraft();assert.equal(state.streamAppearance.bottomFade,false);
});

test('modern solid lower-third respects darkness, while text-only mode removes the entire surface',()=>{
 const {window}=fixture(),properties={},classes=new Set();
 const box={dataset:{},style:{setProperty:(key,value)=>properties[key]=value},classList:{toggle:(key,on)=>on?classes.add(key):classes.delete(key),remove:key=>classes.delete(key)}};
 window.applyStreamAppearance(box,{streamAppearance:{surface:'solid',opacity:80}},true);
 assert.match(properties['--broadcast-surface'],/^linear-gradient\(120deg,rgba\(38,36,52,0.8\)/);
 window.applyStreamAppearance(box,{streamAppearance:{surface:'none'}},true);
 assert.equal(properties['--broadcast-surface'],'transparent');assert.ok(classes.has('broadcast-text-only'));
 window.applyStreamAppearance(box,{streamAppearance:{surface:'solid'}},false);assert.ok(!classes.has('broadcast-text-only'));
});
test('Colors filters permanent solid and gradient backgrounds in place without loading media or publishing',async()=>{
 const {window,field,sent,manager}=draftFixture();
 window.SANCTUARY_THEMES={solid:{name:'Solid blue',type:'gradient',category:'colors',badge:'SOLID',bgCss:'#163a70'},gradient:{name:'Blue gradient',type:'gradient',category:'colors',badge:'GRADIENT',bgCss:'radial-gradient(#2563eb,#0a1128)'},motion:{name:'Video',type:'video',category:'motion'}};
 await window.togglePresentationSettings();const cards=[...field('style-background-list').children];
 window.filterStyleBackgrounds('colors');assert.equal(cards[0].hidden,false);assert.equal(cards[1].hidden,false);assert.equal(cards[2].hidden,true);
 assert.equal(cards[0].children[0].textContent,'Solid');assert.equal(cards[1].children[0].textContent,'Gradient');
 assert.equal(cards[0].children.length,2);assert.equal(cards[1].children.length,2);
 cards[0].onclick();assert.equal(cards[0]['aria-pressed'],'true');
 assert.equal(manager.activeSanctuaryTheme,'celestial_motion');assert.equal(sent.length,0);
 window.filterStyleBackgrounds('all');assert.deepEqual(field('style-background-list').children,cards);
});
test('custom upload delete icons cancel safely and delete from both galleries without selecting or rebuilding other cards',async()=>{
 const {window,field,context,sent}=draftFixture();
 window.SANCTUARY_THEMES={a:{id:'a',name:'First.jpg',custom:true,type:'image',imageUrl:'/media/uploads/a.jpg'},b:{id:'b',name:'Second.jpg',custom:true,type:'image',imageUrl:'/media/uploads/b.jpg'}};
 window.themeManager.updateSanctuaryUi=()=>{};
 context.document.querySelector=()=>null;context.setTimeout=()=>{};
 let requests=0,confirmed=false,prompt;
 context.fetch=async()=>{requests++;return {ok:true};};
 window.showCustomConfirm=async options=>{prompt=options;return confirmed;};
 vm.runInNewContext(fs.readFileSync(require.resolve('../js/sanctuary-media.js'),'utf8'),context);
 window.loadSanctuaryUploads=async()=>{};
 await window.togglePresentationSettings();
 const images=[...field('stream-image-list').children],backgrounds=[...field('style-background-list').children];
 assert.equal(backgrounds[0].children[1]['aria-label'],'Delete First.jpg');
 assert.equal(images[0].children[1]['aria-label'],'Delete First.jpg');
 const event={preventDefault(){},stopPropagation(){}};
 await images[0].children[1].onclick(event);
 assert.match(prompt.message,/First.jpg/);assert.equal(prompt.cancelText,'Cancel');assert.equal(requests,0);
 assert.equal(field('presentation-settings').hidden,false);assert.equal(field('sanctuary-theme-modal-backdrop').style.display,undefined);
 assert.deepEqual(field('stream-image-list').children,images);assert.equal(sent.length,0);
 confirmed=true;await images[0].children[1].onclick(event);
 assert.equal(requests,1);assert.equal(window.SANCTUARY_THEMES.a,undefined);
 assert.deepEqual(field('stream-image-list').children,[images[1]]);assert.deepEqual(field('style-background-list').children,[backgrounds[1]]);
 assert.equal(sent.length,0);assert.equal(field('presentation-settings').hidden,false);
});
test('deleting a selected image clears both live and draft references before Apply',async()=>{
 const {window,field,state,sent,saved}=draftFixture();
 window.SANCTUARY_THEMES.a={name:'First.jpg',custom:true,type:'image',imageUrl:'/media/uploads/a.jpg'};
 state.streamAppearance=window.normalizeStreamAppearance({surface:'image',imageUrl:'/media/uploads/a.jpg'});
 await window.togglePresentationSettings();window.updateStyleDraft({activeSanctuaryTheme:'a'});
 delete window.SANCTUARY_THEMES.a;window.onStyleBackgroundDeleted('a',{imageUrl:'/media/uploads/a.jpg'},'celestial_motion');
 assert.equal(state.streamAppearance.imageUrl,'');assert.equal(state.streamAppearance.surface,'solid');assert.equal(sent.length,1);
 assert.equal(JSON.parse(saved.get('sf_stream_appearance')).imageUrl,'');assert.equal(field('stream-image-empty').hidden,false);
 window.applyStyleDraft();assert.equal(state.streamAppearance.imageUrl,'');assert.equal(window.themeManager.activeSanctuaryTheme,'celestial_motion');
});
test('Crop saves a separate fitted copy in the draft and never projects before Apply',async()=>{
 const {window,context,state,sent,field}=draftFixture();
 const original={id:'a',name:'Original.png',custom:true,type:'image',imageUrl:'/media/uploads/a.png'};
 window.SANCTUARY_THEMES.a=original;await window.togglePresentationSettings();
 window.updateStreamAppearance({surface:'image',imageUrl:original.imageUrl});
 let crop;window.openStreamCrop=options=>crop=options;context.URLSearchParams=URLSearchParams;
 let request;
 context.fetch=async(url,options)=>{request={url,options};return {ok:true,json:async()=>({item:{id:'cropped',name:'Original (cropped).png',custom:true,type:'image',imageUrl:'/media/uploads/cropped.png'}})};};
 window.cropStreamBackground();assert.equal(crop.url,original.imageUrl);assert.ok(crop.ratio>1);
 await crop.onSave('image bytes',1600,300);
 assert.equal(request.options.method,'POST');assert.match(request.url,/width=1600&height=300/);
 assert.equal(window.SANCTUARY_THEMES.a,original);assert.equal(field('stream-image-list').children.length,2);
 assert.equal(sent.length,0);assert.equal(state.streamAppearance.imageUrl,'');
 window.applyStyleDraft();assert.equal(state.streamAppearance.imageUrl,'/media/uploads/cropped.png');assert.equal(sent.length,1);
});
test('cancelled or stale crop saves cannot replace the current lower-third selection',async()=>{
 const {window,context,state}=draftFixture();await window.togglePresentationSettings();
 window.updateStreamAppearance({surface:'image',imageUrl:'/media/uploads/a.png'});
 let crop;window.openStreamCrop=options=>crop=options;context.URLSearchParams=URLSearchParams;
 context.fetch=async()=>({ok:true,json:async()=>({item:{id:'cropped',name:'Crop.jpg',custom:true,type:'image',imageUrl:'/media/uploads/cropped.jpg'}})});
 window.cropStreamBackground();await crop.onSave('bytes',400,100,()=>false);
 window.applyStyleDraft();assert.equal(state.streamAppearance.imageUrl,'/media/uploads/a.png');
 await window.togglePresentationSettings();window.cropStreamBackground();window.closePresentationSettings();await window.togglePresentationSettings();
 await assert.rejects(crop.onSave('bytes',400,100),/selection changed/);
});
test('lower-third upload opens Crop after saving the original without publishing',async()=>{
 const {window,context,sent,state,field}=draftFixture();await window.togglePresentationSettings();
 let crop,revoked=false;window.openStreamCrop=options=>crop=options;
 context.Image=class {constructor(){this.naturalWidth=4000;this.naturalHeight=3000;}decode(){return Promise.resolve();}};
 context.URL={createObjectURL:()=> 'blob:test',revokeObjectURL:()=>revoked=true};context.URLSearchParams=URLSearchParams;
 const item={id:'new',name:'Original.png',custom:true,type:'image',imageUrl:'/media/uploads/new.png'};
 context.fetch=async()=>({ok:true,json:async()=>({item})});
 const input={files:[{name:'Original.png',size:4096}],value:'Original.png'};
 await window.uploadStreamBackground(input);
 assert.equal(input.value,'');assert.equal(revoked,true);assert.equal(crop.url,item.imageUrl);
 assert.equal(field('stream-image-crop').disabled,false);assert.equal(window.SANCTUARY_THEMES.new,item);
 assert.equal(state.streamAppearance.imageUrl,'');assert.equal(sent.length,0);
});
