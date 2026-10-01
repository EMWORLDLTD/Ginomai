/* Output-space fitting: preview frames run this exact renderer too. */
(() => {
  let pending = false;
  window.scheduleOutputFit = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const stageText = document.getElementById('stage-current-slide-text');
      if (document.body.classList.contains('is-stage') && stageText) {
        stageText.style.fontSize = '';
        let size = parseFloat(getComputedStyle(stageText).fontSize);
        const area = stageText.parentElement;
        const css = getComputedStyle(area);
        const height = area.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
        for (let i = 0; i < 80 && size > 1 && (stageText.scrollHeight > height || stageText.scrollWidth > area.clientWidth); i++) {
          size *= .94;
          stageText.style.fontSize = size + 'px';
        }
      }
      document.querySelectorAll('.slide-slot').forEach(slot => {
        const box = slot.querySelector('.card-box');
        const text = slot.querySelector('.content-line');
        if (!box || !text || !text.dataset.preferredSize || !slot.clientHeight) return;
        const css = getComputedStyle(slot);
        const available = slot.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
        const maxHeight = Math.max(1, available);
        box.style.minHeight = '0';
        box.style.boxSizing = 'border-box';
        box.style.maxHeight = maxHeight + 'px';
        text.style.flexShrink = '0';
        const preferred = Number(text.dataset.preferredSize);
        const baseline = Number(text.dataset.fitBaseSize) || preferred;
        // Fit the normal size first, then apply manual reductions proportionally.
        // Otherwise several minus clicks can be swallowed by the same fit ceiling.
        let low = 1, high = Math.max(baseline, preferred);
        const fits = size => {
          text.style.fontSize = size + 'px';
          return box.scrollHeight <= maxHeight + 1 && text.scrollWidth <= box.clientWidth && box.scrollWidth <= slot.clientWidth;
        };
        if (!fits(high)) {
          for (let i = 0; i < 12; i++) {
            const mid = (low + high) / 2;
            if (fits(mid)) low = mid; else high = mid;
          }
          high = low;
        }
        fits(high * Math.min(1, preferred / baseline));
      });
    });
  };
  addEventListener('resize', window.scheduleOutputFit);
  document.fonts?.ready.then(window.scheduleOutputFit);
})();
