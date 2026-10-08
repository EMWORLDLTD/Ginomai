'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {once} = require('node:events');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(),'ginomai-operator-test-'));
process.env.SF_LIVE_STATE_FILE = path.join(temporary,'live.json');
process.env.SF_MEDIA_DIR = path.join(temporary,'backgrounds');
process.env.SF_PRESENTATION_DIR = path.join(temporary,'presentations');
const {server} = require('../server');

(async () => {
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  try {
    const hostContext = await browser.newContext({viewport:{width:1366,height:768}});
    const operatorContext = await browser.newContext({viewport:{width:1259,height:768}});
    const host = await hostContext.newPage(), operator = await operatorContext.newPage();
    const errors = [], commands = [];
    for (const page of [host,operator]) page.on('pageerror',error=>errors.push(error.message));
    operator.on('request',request=>{if(new URL(request.url()).pathname==='/api/control' && request.method()==='POST')commands.push(request.postDataJSON());});
    await host.goto(base,{waitUntil:'domcontentloaded'});
    await host.waitForFunction(()=>window.sermonManager && window.themeManager && window.toggleSession);
    await host.evaluate(()=>window.toggleSession());
    const session = await (await hostContext.request.get(base+'/api/session')).json();
    assert(session.enabled);
    await operator.goto(base+'/index.html?remote=1',{waitUntil:'domcontentloaded'});
    await operator.waitForFunction(()=>window.joinAndSyncOperatorSession && window.sermonManager);
    await operator.evaluate(code=>{
      document.getElementById('operator-join-name-input').value='Test operator';
      document.getElementById('operator-pairing-code').value=code;
      return window.joinAndSyncOperatorSession('Test operator');
    },session.pairingCode);
    await operator.waitForFunction(()=>window.sfOperatorPaired && [...document.querySelectorAll('.actual-output-preview')].every(frame=>typeof frame.contentWindow.applyState==='function'));
    await operator.waitForTimeout(2000);
    await host.evaluate(()=>{
      Object.assign(window.state,{currentTab:'bible',activeDeckType:'bible',activeBibleBook:'Genesis',activeBibleChapter:1,bibleVersion:'KJV',isMedleyMode:false,isDeckEditingSong:null,isHoldLive:false});
      window.renderDeck(true);
      window.projectSlide('bible_Genesis_1_28','Round-trip verse 28','Genesis 1:28 (KJV)',{takeLive:true});
      window.state.aiProvider='native';
      // Exercise command routing without capturing real sanctuary audio in a test.
      speechAi.toggle=()=>{speechAi.isListening=true;window.handleSpeechAiStatus({status:'listening',message:'Test host audio',isRequested:true,isListening:true});};
      speechAi.stop=()=>{speechAi.isListening=false;window.handleSpeechAiStatus({status:'idle',message:'AI mic off',isRequested:false,isListening:false});};
    });
    await operator.waitForFunction(()=>window.state.activeLiveSlideId==='bible_Genesis_1_28' && document.getElementById('bento_card_bible_Genesis_1_28')?.classList.contains('live'));
    await operator.evaluate(()=>{
      window.setProjectionWorkflow('smart');
      window.navigationCards=[...document.getElementById('bento-medley-container').children];
      window.deckRebuilds=[];
      const render=window.renderDeck;
      window.renderDeck=(...args)=>{window.deckRebuilds.push(new Error().stack);return render(...args);};
    });
    const snapshots = [];
    for (const verse of [29,30,31,30,29]) {
      await operator.evaluate(v=>document.getElementById('bento_card_bible_Genesis_1_'+v).click(),verse);
      await host.waitForFunction(v=>window.state.activeLiveSlideId==='bible_Genesis_1_'+v,verse);
      await operator.waitForTimeout(400);
      const snapshot=await operator.evaluate(()=>({
        slide:window.state.activeLiveSlideId,scroll:document.getElementById('bento-medley-container').scrollTop,
        sameCards:window.navigationCards.every((card,index)=>card===document.getElementById('bento-medley-container').children[index]),
        rebuilds:window.deckRebuilds,preview:[...document.querySelectorAll('.actual-output-preview')].map(frame=>frame.contentWindow.LATEST_STATE.slideId)
      }));
      assert.equal(snapshot.slide,'bible_Genesis_1_'+verse);
      assert(snapshot.scroll>0);
      assert.equal(snapshot.sameCards,true,JSON.stringify(snapshot));
      assert.equal(snapshot.rebuilds.length,0,JSON.stringify(snapshot));
      assert(snapshot.preview.every(id=>id===snapshot.slide),JSON.stringify(snapshot));
      snapshots.push(snapshot);
    }
    assert.equal(commands.filter(command=>command.type==='STATE_PATCH').length,0,'Projection echoes must never produce workspace patches');
    await host.evaluate(()=>{
      const song={id:'roundtrip_song',title:'Round-trip song',author:'Test',stanzas:Array.from({length:40},(_,index)=>({type:'Verse '+(index+1),text:'Round-trip lyrics '+index}))};
      SONGS_DATABASE.push(song);
      return window.pushHostLibraryToRemote();
    });
    await operator.waitForFunction(()=>SONGS_DATABASE.some(song=>song.id==='roundtrip_song'));
    await host.evaluate(()=>{
      Object.assign(window.state,{currentTab:'songs',activeDeckType:'song',activeSongId:'roundtrip_song',maxLinesPerSlide:0});
      window.renderDeck(true);
      window.projectSlide('roundtrip_song_28','Round-trip lyrics 28','Round-trip song',{takeLive:true});
    });
    await operator.waitForFunction(()=>document.getElementById('bento_card_roundtrip_song_28')?.classList.contains('live'));
    await operator.evaluate(()=>{
      window.navigationCards=[...document.getElementById('bento-medley-container').children];
      window.deckRebuilds=[];
    });
    for (const slide of [29,30,31,30]) {
      await operator.evaluate(index=>document.getElementById('bento_card_roundtrip_song_'+index).click(),slide);
      await host.waitForFunction(index=>window.state.activeLiveSlideId==='roundtrip_song_'+index,slide);
      await operator.waitForTimeout(300);
      assert.equal(await operator.evaluate(()=>window.navigationCards.every((card,index)=>card===document.getElementById('bento-medley-container').children[index]) && window.deckRebuilds.length===0),true);
      await operator.waitForFunction(index=>[...document.querySelectorAll('.actual-output-preview')].every(frame=>frame.contentWindow.LATEST_STATE.slideId==='roundtrip_song_'+index),slide);
    }
    await operator.evaluate(()=>{
      document.getElementById('bento_card_roundtrip_song_29').click();
      document.getElementById('bento_card_roundtrip_song_30').click();
      document.getElementById('bento_card_roundtrip_song_31').click();
    });
    await host.waitForFunction(()=>window.state.activeLiveSlideId==='roundtrip_song_31');
    await operator.waitForFunction(()=>window.state.activeLiveSlideId==='roundtrip_song_31' && [...document.querySelectorAll('.actual-output-preview')].every(frame=>frame.contentWindow.LATEST_STATE.slideId==='roundtrip_song_31'));
    assert.equal(await operator.evaluate(()=>window.deckRebuilds.length),0);
    await operator.click('#bento-mic-btn');
    await host.waitForFunction(()=>window.state.aiListening);
    await operator.waitForFunction(()=>window.state.aiListening);
    await operator.click('#bento-rec-sermon-btn');
    await host.waitForFunction(()=>window.sermonManager.isRecordingSermon);
    await operator.waitForFunction(()=>window.sermonManager.isRecordingSermon && window.sermonManager.session.recordings.length>0);
    await host.evaluate(()=>window.sermonManager.addUtterance('A host sermon sentence for the operator transcript.',true));
    await operator.waitForFunction(()=>window.sermonManager.session.paragraphs.some(paragraph=>paragraph.text.includes('host sermon sentence')));
    await operator.click('#bento-rec-sermon-btn');
    await host.waitForFunction(()=>!window.sermonManager.isRecordingSermon);
    await operator.waitForFunction(()=>!window.sermonManager.isRecordingSermon);
    await operator.click('#bento-mic-btn');
    await host.waitForFunction(()=>!window.state.aiSpeechRequested);
    await operator.waitForFunction(()=>!window.state.aiSpeechRequested);
    assert.equal(await operator.evaluate(()=>speechAi),null,'Operator must not initialize its own audio engine');
    await operator.click('#bento-hold-btn');
    await host.waitForFunction(()=>window.state.isHoldLive);
    await operator.waitForFunction(()=>window.state.isHoldLive);
    const held=await operatorContext.request.post(base+'/api/control',{data:{type:'PROJECT',text:'Must stay held',slideId:'blocked_slide'}});
    assert.equal(held.status(),409);
    await operator.click('#bento-hold-btn');
    await host.waitForFunction(()=>!window.state.isHoldLive);
    await operator.waitForFunction(()=>!window.state.isHoldLive);
    const blocked=await operatorContext.request.post(base+'/api/control',{data:{type:'SET_AUDIO_DEVICE',deviceId:'other'}});
    assert.equal(blocked.status(),403);
    await operator.click('#bento-device-sel');
    assert.equal(await operator.locator('#audio-mic-popover').evaluate(element=>element.classList.contains('open')),false);
    assert.deepEqual(errors,[]);
    await operator.screenshot({path:path.join(__dirname,'../scratch/operator-roundtrip-verified.png')});
    console.log(JSON.stringify({passed:true,snapshots,commands:commands.map(command=>command.type),songNavigation:true,rapidNavigation:true,aiControl:true,recordingControl:true,holdControl:true,hostTranscript:true},null,2));
    await hostContext.close();
    await operatorContext.close();
  } finally {
    await browser.close();
    server.closeAllConnections();
    server.close();
  }
})().then(()=>process.exit(0)).catch(error=>{console.error(error);server.closeAllConnections();server.close();process.exit(1);});
