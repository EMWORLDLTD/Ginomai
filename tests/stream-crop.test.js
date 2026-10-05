'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../js/stream-crop.js'),'utf8');
function fixture() {
  const nodes=new Map(),calls=[];
  const el=id=>{
    if(!nodes.has(id))nodes.set(id,{style:{},value:50,disabled:false,hidden:true,inert:false,naturalWidth:4000,naturalHeight:3000,
      focus(){},removeAttribute(){},decode:async()=>{},querySelector(){return el('close');},querySelectorAll(){return []}});
    return nodes.get(id);
  };
  const document={getElementById:el,activeElement:el('focus'),addEventListener(){},createElement:()=>({width:0,height:0,
    getContext:()=>({drawImage(...args){calls.push(args);}}),toBlob:(cb,type)=>{assert.equal(type,'image/png');cb('png blob');}})};
  const window={};vm.runInNewContext(source,{window,document});return {window,el,calls};
}
test('portrait and landscape crop rectangles retain the target ratio and stay inside the source at every corner',()=>{
  const {window}=fixture();
  for(const [width,height] of [[4000,3000],[1000,6000],[6000,1000]])for(const ratio of [2,3.6,7])for(const zoom of [1,2,4])for(const x of [0,50,100])for(const y of [0,50,100]) {
    const rect=window.getStreamCropRect(width,height,ratio,zoom,x,y);
    assert.ok(Math.abs(rect.width/rect.height-ratio)<1e-9);
    assert.ok(rect.x>=0 && rect.y>=0 && rect.x+rect.width<=width+1e-9 && rect.y+rect.height<=height+1e-9);
  }
  assert.throws(()=>window.getStreamCropRect(0,1000,4),/dimensions/);
});
test('Cancel releases the crop image and restores the parent without saving',async()=>{
  const {window,el}=fixture();let saved=0;
  await window.openStreamCrop({url:'/media/uploads/a.jpg',name:'Image',ratio:4,onSave:()=>saved++});
  assert.equal(el('presentation-settings').inert,true);assert.equal(el('stream-crop-shield').hidden,false);
  window.closeStreamCrop();await window.saveStreamCrop();assert.equal(saved,0);
  assert.equal(el('presentation-settings').inert,false);assert.equal(el('stream-crop-shield').hidden,true);
});
test('Save exports the selected frame at a bounded size, and failed saves remain editable',async()=>{
  const {window,el,calls}=fixture();let saved;
  await window.openStreamCrop({url:'/media/uploads/a.jpg',name:'Image',ratio:4,onSave:async(...args)=>saved=args});
  el('stream-crop-zoom').value=2;el('stream-crop-x').value=100;window.updateStreamCrop();
  await window.saveStreamCrop();assert.equal(saved[0],'png blob');assert.equal(saved[1],1920);assert.equal(saved[2],480);
  assert.equal(calls[0][1],2000);assert.equal(calls[0][3]/calls[0][4],4);assert.equal(el('stream-crop-shield').hidden,true);
  await window.openStreamCrop({url:'/media/uploads/a.jpg',name:'Image',ratio:4,onSave:async()=>{throw new Error('Offline');}});
  await window.saveStreamCrop();assert.equal(el('stream-crop-status').textContent,'Offline');assert.equal(el('stream-crop-save').disabled,false);
  assert.equal(el('stream-crop-shield').hidden,false);window.closeStreamCrop();
});
