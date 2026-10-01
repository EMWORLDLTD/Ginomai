/* Scale the production output canvas, never its individual text elements. */
(() => {
  const dimensions = new Map();
  const entries = [];
  const channel = new BroadcastChannel('ginomia_output_viewports');
  function layout(entry) {
    const target = entry.single ? (window.previewTargetMode === 'sanctuary' || !window.previewTargetMode ? 'sanctuary' : 'livestream') : entry.target;
    if (entry.target !== target) {
      entry.target = target;
      entry.frame.src = `display.html?target=${target}&embedded=1`;
    }
    const size = dimensions.get(target) || {width:1920,height:1080};
    const scale = Math.min(entry.host.clientWidth / size.width, entry.host.clientHeight / size.height);
    Object.assign(entry.frame.style, {width:size.width+'px',height:size.height+'px',transform:`scale(${scale})`,left:(entry.host.clientWidth-size.width*scale)/2+'px',top:(entry.host.clientHeight-size.height*scale)/2+'px'});
    entry.frame.title = `${target} output preview (${size.width} × ${size.height}${dimensions.has(target) ? '' : ', assumed'})`;
  }
  window.syncOutputPreviews = () => entries.forEach(layout);
  for (const [id, target, single] of [['bento-single-prev-wrap','sanctuary',true],['bento-dual-sanctuary','sanctuary',false],['bento-dual-livestream','livestream',false]]) {
    const host = document.getElementById(id);
    if (!host) continue;
    const frame = document.createElement('iframe');
    frame.className = 'actual-output-preview';
    frame.src = `display.html?target=${target}&embedded=1`;
    frame.tabIndex = -1;
    host.classList.add('uses-output-renderer');
    host.append(frame);
    const entry = {host,frame,target,single};
    entries.push(entry);
    new ResizeObserver(() => layout(entry)).observe(host);
    layout(entry);
  }
  channel.onmessage = ({data}) => {
    if (!['sanctuary','livestream','stage'].includes(data?.target) || !(data.width>0 && data.height>0)) return;
    dimensions.set(data.target,data);
    window.syncOutputPreviews();
  };
  channel.postMessage({request:true});
  let polling = false;
  async function pollDimensions() {
    if (polling || document.hidden) return;
    polling = true;
    try {
      const response = await fetch('/api/output-status');
      const status = await response.json();
      for (const output of status.outputs || []) {
        if (output.connected && output.viewport) dimensions.set(output.target, output.viewport);
      }
      window.syncOutputPreviews();
    } catch (_) {} finally { polling = false; }
  }
  pollDimensions();
  setInterval(pollDimensions, 3000);
})();
