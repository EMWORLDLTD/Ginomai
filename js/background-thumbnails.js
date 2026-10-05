/* The library uses stills at rest, one temporary decoder, and one hover preview. */
(() => {
  const cacheName = 'sf-background-thumbnails-v1';
  const cacheKey = source => new URL('/__background-thumbnail?source=' + encodeURIComponent(source), window.location.origin).href;
  async function cached(source) {
    try { return await (await (await caches.open(cacheName)).match(cacheKey(source)))?.blob(); } catch { return null; }
  }
  async function save(source, blob) {
    try { await (await caches.open(cacheName)).put(cacheKey(source), new Response(blob, {headers:{'Content-Type':'image/jpeg'}})); } catch {}
  }
  function release(media) {
    media.pause?.(); media.removeAttribute('src'); media.load?.(); media.remove();
  }
  function capture(source, isVideo) {
    const media = document.createElement(isVideo ? 'video' : 'img');
    let finish, timer, settled = false, seeking = false, drawing = false;
    const promise = new Promise(resolve => {
      finish = blob => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        media.onloadedmetadata = media.onloadeddata = media.onseeked = media.onload = media.onerror = null;
        release(media); resolve(blob);
      };
      const draw = () => {
        if (settled || drawing || (isVideo && media.readyState < 2)) return;
        drawing = true;
        try {
          const width = isVideo ? media.videoWidth : media.naturalWidth;
          const height = isVideo ? media.videoHeight : media.naturalHeight;
          if (!width || !height) return finish(null);
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 320 / width, 200 / height);
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          canvas.getContext('2d', {alpha:false, willReadFrequently:true}).drawImage(media, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(finish, 'image/jpeg', .7);
        } catch { finish(null); }
      };
      media.onerror = () => finish(null);
      timer = setTimeout(() => finish(null), 8000);
      if (isVideo) {
        media.muted = true; media.preload = 'auto'; media.playsInline = true;
        media.onloadedmetadata = () => {
          const time = Number.isFinite(media.duration) ? Math.min(.5, media.duration / 2) : 0;
          if (time > 0) { seeking = true; media.currentTime = time; }
        };
        media.onloadeddata = () => { if (!seeking) draw(); };
        media.onseeked = draw;
      } else media.onload = draw;
      media.src = source;
    });
    return {promise, cancel:() => finish(null)};
  }
  window.createBackgroundThumbnails = (root, isActive) => {
    const records = new Map(), urls = new Set();
    let disposed = false, busy = false, timer, decoder, decodingRecord, hovered, preview;
    const active = () => !disposed && !document.hidden && isActive();
    const stopPreview = () => { if (preview) release(preview); preview = null; hovered = null; };
    const schedule = () => {
      clearTimeout(timer);
      if (active() && !busy && !hovered) timer = setTimeout(pump, 80);
    };
    async function pump() {
      if (!active() || busy || hovered) return;
      const record = [...records.values()].find(r => r.visible && !r.button.hidden && !r.ready && !r.failed);
      if (!record) return;
      busy = true;
      try {
        let blob = await cached(record.source);
        if (!active() || hovered || !record.visible || record.button.hidden) return;
        if (!blob) {
          decodingRecord = record; decoder = capture(record.source, record.isVideo);
          const current = decoder;
          blob = await current.promise;
          decoder = null; decodingRecord = null;
          if (record.cancelled) { record.cancelled = false; return; }
          if (blob) void save(record.source, blob);
        }
        if (disposed) return;
        if (blob) {
          const url = URL.createObjectURL(blob); urls.add(url);
          const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.src = url;
          record.button.prepend(image); record.ready = true;
        } else {
          record.failed = true;
          const status = document.createElement('span'); status.className = 'style-background-preview-status';
          status.textContent = 'Preview unavailable'; record.button.append(status);
        }
      } finally { busy = false; schedule(); }
    }
    function cancelCapture() {
      if (decoder) { decodingRecord.cancelled = true; decoder.cancel(); }
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      for (const entry of entries) {
        const record = records.get(entry.target); if (!record) continue;
        record.visible = entry.isIntersecting;
        if (!record.visible) {
          if (hovered === record) stopPreview();
          if (decodingRecord === record) cancelCapture();
        }
      }
      schedule();
    }, {root, threshold:0});
    function refresh() {
      if (!active() || hovered?.button.hidden) stopPreview();
      if (!active() || decodingRecord?.button.hidden) cancelCapture();
      schedule();
    }
    document.addEventListener('visibilitychange', refresh);
    return {
      attach(button, theme) {
        const isVideo = !!theme.videoUrl, source = theme.videoUrl || theme.imageUrl;
        const poster = theme.thumbnailUrl || theme.posterUrl || (isVideo ? theme.imageUrl : '');
        const record = {button, source, isVideo, ready:!!poster, visible:!observer};
        records.set(button, record);
        if (poster) {
          const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.src = poster;
          image.onerror = () => { image.remove(); record.ready = false; schedule(); };
          button.prepend(image);
        }
        button.onpointerenter = event => {
          if (event.pointerType === 'touch' || !active() || button.hidden) return;
          stopPreview(); cancelCapture(); hovered = record;
          const media = document.createElement(isVideo ? 'video' : 'img'); preview = media;
          if (isVideo) { media.muted = true; media.loop = true; media.playsInline = true; media.preload = 'none'; }
          else { media.alt = ''; media.className = 'style-background-motion-image'; }
          media.setAttribute('aria-hidden', 'true'); media.src = source; button.prepend(media);
          media.onerror = () => { if (preview === media) { stopPreview(); schedule(); } };
          if (isVideo) media.play().catch(() => { if (preview === media) { stopPreview(); schedule(); } });
        };
        button.onpointerleave = () => { if (hovered === record) stopPreview(); schedule(); };
        observer?.observe(button); schedule();
      },
      refresh,
      detach(button) {
        const record=records.get(button);if(!record)return;
        if(hovered===record)stopPreview();if(decodingRecord===record)cancelCapture();
        observer?.unobserve(button);records.delete(button);button.onpointerenter=button.onpointerleave=null;
        schedule();
      },
      dispose() {
        disposed = true; clearTimeout(timer); observer?.disconnect(); cancelCapture(); stopPreview();
        document.removeEventListener('visibilitychange', refresh);
        for (const url of urls) URL.revokeObjectURL(url);
        for (const {button} of records.values()) button.onpointerenter = button.onpointerleave = null;
      }
    };
  };
})();
