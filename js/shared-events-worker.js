// One server event stream per URL, shared by same-origin tabs.
const streams = new Map();
onconnect = ({ ports: [port] }) => {
  let key;
  const detach = () => {
    const stream = streams.get(key);
    if (!stream) return;
    stream.ports.delete(port);
    if (!stream.ports.size) { stream.source.close(); streams.delete(key); }
    key = null;
  };
  port.onmessage = ({ data }) => {
    if (data.type === 'close') { detach(); port.close(); return; }
    if (data.type !== 'subscribe') return;
    detach(); key = data.url;
    let stream = streams.get(key);
    if (!stream) {
      const source = new EventSource(key);
      stream = { source, ports: new Set(), session: null };
      streams.set(key, stream);
      for (const type of ['open', 'message', 'error', 'output-session']) {
        source.addEventListener(type, event => {
          const message = { type, data: event.data, readyState: source.readyState };
          if (type === 'output-session') stream.session = message;
          for (const client of stream.ports) client.postMessage(message);
        });
      }
    }
    stream.ports.add(port);
    if (stream.source.readyState === 1) port.postMessage({ type: 'open', readyState: 1 });
    if (stream.session) port.postMessage(stream.session);
  };
  port.start();
};
