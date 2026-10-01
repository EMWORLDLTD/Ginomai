const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('tabs share a stream; closing one tab does not disconnect others; last tab releases it', () => {
  const sources=[];
  class EventSource {
    constructor(url){ this.url=url;this.readyState=0;this.handlers={};sources.push(this); }
    addEventListener(type,fn){this.handlers[type]=fn;}
    close(){this.closed=true;}
  }
  const c={EventSource};vm.createContext(c);
  vm.runInContext(fs.readFileSync(require.resolve('../js/shared-events-worker.js'),'utf8'),c);
  const connect=url=>{
    const port={messages:[],postMessage(message){this.messages.push(message)},start(){},close(){}};
    c.onconnect({ports:[port]});port.onmessage({data:{type:'subscribe',url}});return port;
  };
  const a=connect('http://localhost:8500/api/control-events');
  const b=connect('http://localhost:8500/api/control-events');
  assert.equal(sources.length,1);
  sources[0].handlers.message({data:'payload'});
  assert.equal(a.messages[0].data,'payload');assert.equal(b.messages[0].data,'payload');
  a.onmessage({data:{type:'close'}});assert.equal(sources[0].closed,undefined);
  b.onmessage({data:{type:'close'}});assert.equal(sources[0].closed,true);
  connect('http://localhost:8500/api/control-events');assert.equal(sources.length,2);
});

test('output targets stay separate and late subscribers receive the output session',()=>{
  const sources=[];
  class EventSource {constructor(url){this.url=url;this.readyState=1;this.handlers={};sources.push(this)} addEventListener(t,f){this.handlers[t]=f}close(){}}
  const c={EventSource};vm.createContext(c);vm.runInContext(fs.readFileSync(require.resolve('../js/shared-events-worker.js'),'utf8'),c);
  function connect(url){const p={messages:[],postMessage(m){this.messages.push(m)},start(){},close(){}};c.onconnect({ports:[p]});p.onmessage({data:{type:'subscribe',url}});return p;}
  connect('/api/events?target=sanctuary');connect('/api/events?target=stage');
  sources[0].handlers['output-session']({data:'{"id":"session"}'});
  const late=connect('/api/events?target=sanctuary');assert.equal(sources.length,2);
  assert.equal(late.messages.at(-1).data,'{"id":"session"}');
});
