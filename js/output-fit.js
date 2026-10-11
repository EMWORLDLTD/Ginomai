/* Output-space fitting: preview frames run this exact renderer too. */
(() => {
  let pending = false;
  window.scheduleOutputFit = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const alert = document.getElementById('live-alert-container');
      const alertText = document.getElementById('live-alert-text-wrap');
      if (alertText) {
        alertText.style.fontSize = '';
        if (alert?.classList.contains('active') && alert.classList.contains('alert-fullscreen')) {
          const area = document.getElementById('live-alert-box');
          const css = getComputedStyle(area);
          const height = area.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
          const width = area.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
          const scale = Number(alertText.dataset?.textScale) || 1;
          const baseline = parseFloat(getComputedStyle(alertText).fontSize);
          let low = 1, high = baseline * Math.max(1, scale);
          const fits = size => {
            alertText.style.fontSize = size + 'px';
            // CSS padding may be fractional; scroll dimensions round to whole pixels.
            return alertText.scrollHeight <= height + 1 && alertText.scrollWidth <= width + 1;
          };
          if (!fits(high)) {
            for (let i = 0; i < 12; i++) {
              const mid = (low + high) / 2;
              if (fits(mid)) low = mid; else high = mid;
            }
            high = low;
          }
          fits(high * Math.min(1, scale));
        }
      }
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
        const bandHeight = Number(box.dataset.bandHeight);
        const maxHeight = Math.max(1, bandHeight ? Math.min(available, innerHeight * bandHeight / 100) : available);
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
          const boxCss = getComputedStyle(box);
          const textBottom = text.getBoundingClientRect().bottom - box.getBoundingClientRect().top;
          const bottomPadding = parseFloat(boxCss.paddingBottom) || 0;
          const bottomBorder = parseFloat(boxCss.borderBottomWidth) || 0;
          return textBottom + bottomPadding + bottomBorder <= maxHeight + 1 &&
            box.scrollHeight <= maxHeight + 1 && text.scrollWidth <= box.clientWidth && box.scrollWidth <= slot.clientWidth;
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
