'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../js/background-thumbnails.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const elements = [], observers = [], timers = new Map(), cached = new Map(), revoked = [], captures = [], listeners = new Map();
  let nextTimer = 0, nextUrl = 0, active = true;
  function element(tag) {
    const node = {tag, children:[], hidden:false, attrs:{}, readyState:2, duration:2, videoWidth:1920, videoHeight:1080,
      naturalWidth:800, naturalHeight:600,
      prepend(child) { child.parent = this; this.children.unshift(child); },
      append(child) { child.parent = this; this.children.push(child); },
      setAttribute(name, value) { this.attrs[name] = value; },
      removeAttribute(name) { delete this[name]; },
      remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); },
      play() { this.played = true; return Promise.resolve(); }, pause() { this.paused = true; }, load() { this.released = true; },
      getContext() { return {drawImage:(media, ...size) => captures.push({media, size})}; },
      toBlob(callback) { callback(new Blob(['thumbnail'], {type:'image/jpeg'})); }
    };
    elements.push(node); return node;
  }
  const document = {hidden:false, createElement:element, addEventListener:(name, fn) => listeners.set(name, fn), removeEventListener:name => listeners.delete(name)};
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {} disconnect() { this.disconnected = true; }
    visible(button, isIntersecting = true) { this.callback([{target:button, isIntersecting}]); }
  }
  class URLMock extends URL {
    static createObjectURL() { return 'blob:thumb-' + ++nextUrl; }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  const window = {location:{origin:'http://localhost'}};
  class CachedResponse { constructor(blob) { this.data = blob; } async blob() { return this.data; } }
  vm.runInNewContext(source, {window, document, URL:URLMock, Response:CachedResponse, IntersectionObserver:Observer,
    caches:{open:async () => ({match:async key => cached.has(key) ? {blob:async () => cached.get(key)} : undefined, put:async (key, response) => cached.set(key, await response.blob())})},
    setTimeout:(fn, delay) => {const id = ++nextTimer; timers.set(id, {fn, delay}); return id;}, clearTimeout:id => timers.delete(id)});
  const create = () => window.createBackgroundThumbnails(element('root'), () => active);
  const tick = async () => {
    const entry = [...timers].find(([, timer]) => timer.delay === 80);
    if (entry) { timers.delete(entry[0]); entry[1].fn(); }
    await flush();
  };
  const finishVideo = video => { video.onloadedmetadata(); video.onseeked(); };
  return {create, element, elements, observers, tick, finishVideo, cached, revoked, captures, timers, document, listeners, setActive:value => active = value};
}
test('only visible motions decode, one at a time; small stills are cached and decoders released', async () => {
  const f = fixture(), gallery = f.create(), a = f.element('button'), b = f.element('button'), offscreen = f.element('button');
  gallery.attach(a, {videoUrl:'/a.webm'}); gallery.attach(b, {videoUrl:'/b.webm'}); gallery.attach(offscreen, {videoUrl:'/offscreen.webm'});
  await f.tick(); assert.equal(f.elements.filter(e => e.tag === 'video').length, 0);
  f.observers[0].visible(a); f.observers[0].visible(b); await f.tick();
  const first = f.elements.find(e => e.tag === 'video');
  assert.equal(first.src, '/a.webm'); assert.equal(first.played, undefined);
  assert.equal(f.elements.filter(e => e.tag === 'video').length, 1);
  f.finishVideo(first); await flush();
  assert.equal(first.released, true); assert.equal(first.src, undefined);
  assert.equal(a.children[0].tag, 'img'); assert.equal(f.captures[0].size[2], 320);
  await f.tick();
  const second = f.elements.filter(e => e.tag === 'video')[1]; assert.equal(second.src, '/b.webm');
  f.finishVideo(second); await flush(); assert.equal(f.cached.size, 2);
  gallery.dispose(); assert.equal(f.revoked.length, 2);
  const reopened = f.create(), reused = f.element('button'); reopened.attach(reused, {videoUrl:'/a.webm'});
  f.observers[1].visible(reused); await f.tick();
  assert.equal(reused.children[0].tag, 'img'); assert.equal(f.elements.filter(e => e.tag === 'video').length, 2);
  reopened.dispose();
});
test('hover cancels thumbnail decoding and limits playback to one card, releasing it on leave or scroll', async () => {
  const f = fixture(), gallery = f.create(), a = f.element('button'), b = f.element('button');
  gallery.attach(a, {videoUrl:'/a.webm'}); gallery.attach(b, {videoUrl:'/b.webm', imageUrl:'/poster.jpg'});
  f.observers[0].visible(a); f.observers[0].visible(b); await f.tick();
  const decoder = f.elements.find(e => e.tag === 'video');
  a.onpointerenter({pointerType:'mouse'}); await flush();
  assert.equal(decoder.released, true); const hoverA = a.children[0]; assert.equal(hoverA.played, true);
  b.onpointerenter({pointerType:'mouse'});
  assert.equal(hoverA.released, true); const hoverB = b.children[0]; assert.equal(hoverB.played, true);
  f.observers[0].visible(b, false); assert.equal(hoverB.released, true); assert.equal(b.children[0].src, '/poster.jpg');
  a.onpointerenter({pointerType:'mouse'}); const newHover = a.children[0];
  a.onpointerleave(); assert.equal(newHover.released, true);
  assert.equal(a.children.some(e => e.textContent === 'Preview unavailable'), false);
  gallery.dispose();
});
test('filter, tab visibility, and disposal stop previews and pending thumbnail work immediately', async () => {
  const f = fixture(), gallery = f.create(), button = f.element('button');
  gallery.attach(button, {videoUrl:'/a.webm'}); f.observers[0].visible(button); await f.tick();
  const decoder = f.elements.find(e => e.tag === 'video');
  button.hidden = true; gallery.refresh(); await flush(); assert.equal(decoder.released, true);
  button.hidden = false; button.onpointerenter({pointerType:'mouse'}); const hover = button.children[0];
  f.document.hidden = true; f.listeners.get('visibilitychange')(); assert.equal(hover.released, true);
  f.document.hidden = false; gallery.refresh(); await f.tick();
  const pending = f.elements.filter(e => e.tag === 'video').at(-1); gallery.dispose(); await flush();
  assert.equal(pending.released, true); assert.equal(f.observers[0].disconnected, true);
  assert.equal(f.timers.size, 0); assert.equal(button.onpointerenter, null); assert.equal(f.listeners.size, 0);
});
test('animated images use cached stills at rest and touch does not start motion', async () => {
  const f = fixture(), gallery = f.create(), button = f.element('button');
  gallery.attach(button, {imageUrl:'/motion.gif'}); f.observers[0].visible(button); await f.tick();
  const decoder = f.elements.find(e => e.tag === 'img'); decoder.onload(); await flush();
  assert.equal(decoder.src, undefined); assert.match(button.children[0].src, /^blob:/);
  button.onpointerenter({pointerType:'touch'}); assert.equal(button.children.length, 1);
  button.onpointerenter({pointerType:'mouse'}); assert.equal(button.children[0].src, '/motion.gif');
  button.onpointerleave(); assert.match(button.children[0].src, /^blob:/); gallery.dispose();
});
