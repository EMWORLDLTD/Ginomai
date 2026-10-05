'use strict';
(() => {
  let prepared = null;
  let stagedCardEls = null;
  let workflow = 'smart';
  try { workflow = localStorage.getItem('sf_projection_workflow') || 'smart'; } catch {}

  const HINTS = {
    smart: 'Click a slide to cue, then take live. Subsequent slides follow automatically.',
    preview: 'Select a slide to preview, then choose Take live.',
    instant: 'Click any slide or AI suggestion to project live.'
  };

  // ─── Deck Engagement Detection ─────────────────────────────────
  function isDeckEngaged(slideId) {
    const deck = window.state?.liveEngagedDeck;
    if (!deck || !window.state?.activeLiveSlideId) return false;
    // In medley mode, the entire medley is one engaged unit
    if (window.state.isMedleyMode) return true;
    if (deck.type === 'media') return slideId.startsWith(window.state.activePresentation?.media?.assetId + '_page_');
    if (deck.type === 'countdown') return slideId === window.state.activeLiveSlideId;
    const isBibleSlide = slideId.startsWith('bible_') || slideId.startsWith('medley_bible_') || slideId.startsWith('para_') || slideId.startsWith('hist_');
    if (deck.type === 'bible') {
      if (!isBibleSlide) return false;
      return window.state.activeBibleBook === deck.book
          && String(window.state.activeBibleChapter) === String(deck.chapter);
    }
    if (deck.type === 'song') {
      if (isBibleSlide) return false;
      return window.state.activeSongId === deck.songId;
    }
    return false;
  }

  // ─── Staged Card DOM Management ────────────────────────────────
  function unstageCard() {
    const cleanCard = (c) => {
      c.classList.remove('staged');
      if (c.classList.contains('media-card')) {c.querySelectorAll('.staged-pill').forEach(el=>el.remove());return;}
      if (typeof window.cleanupLiveCardObserver === 'function') {
        window.cleanupLiveCardObserver(c);
      }
      c.querySelectorAll('.bento-live-shape-svg, .bento-corner-dock, .staged-pill, .bento-staged-badge, .card-take-live-btn').forEach(el => el.remove());
    };

    if (stagedCardEls) {
      stagedCardEls.forEach(cleanCard);
      stagedCardEls = null;
    }
    // Defensive: sweep any stale staged cards or orphaned staged decorations on non-live cards
    if (typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('.staged').forEach(cleanCard);
      document.querySelectorAll('.bento-single-card:not(.live) > .bento-live-shape-svg, .bento-single-card:not(.live) > .bento-corner-dock').forEach(el => {
        const card = el.parentElement;
        if (card && !card.classList.contains('live')) {
          cleanCard(card);
        }
      });
    }
  }

  function injectCardTakeLiveButton(card) {
    if (!card) return;
    if (card.classList.contains('media-card')) {
      const head=card.querySelector('.head-tag-row');
      if(head && !head.querySelector('.staged-pill')) head.insertAdjacentHTML('beforeend','<span class="staged-pill">CUE</span>');
      return;
    }

    if (card.classList.contains('bento-single-card')) {
      // 1. Remove any pre-existing SVG shape or dock to guarantee a clean slate
      card.querySelectorAll('.bento-live-shape-svg, .bento-corner-dock').forEach(el => el.remove());

      // 2. Bespoke scalloped SVG corner cutout matching live card geometry (with staged styling)
      card.insertAdjacentHTML('afterbegin', '<svg class="bento-live-shape-svg bento-staged-shape-svg" aria-hidden="true"><path d=""></path></svg>');

      // 3. High-contrast, sleek CUE indicator pill
      const headTag = card.querySelector('.head-tag-row');
      if (headTag && !headTag.querySelector('.staged-pill')) {
        headTag.insertAdjacentHTML('beforeend', '<div class="staged-pill" title="Staged / Cue">CUE</div>');
      }

      // 4. Bespoke Inverted Cutout Corner Dock with circular trigger
      card.insertAdjacentHTML('beforeend',
        '<div class="bento-corner-dock staged-dock" title="Take Live to Sanctuary Display (Click / Enter / Space)">' +
        '<button type="button" class="play-circle-btn staged-trigger-btn" onclick="event.stopPropagation(); window.takePreparedSlide();" aria-label="Take Live">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>' +
        '</button></div>'
      );

      if (typeof window.setupLiveCardObserver === 'function') {
        window.setupLiveCardObserver(card);
      } else if (typeof window.updateBentoLiveCardShape === 'function') {
        window.updateBentoLiveCardShape(card);
      }
    } else if (card.classList.contains('bento-slide-card')) {
      const tag = card.querySelector('.tag');
      if (tag && !tag.querySelector('.bento-staged-badge')) {
        const b = document.createElement('span');
        b.className = 'bento-staged-badge';
        tag.appendChild(b);
      }
      if (tag && !tag.querySelector('.staged-pill')) {
        tag.insertAdjacentHTML('beforeend', '<span class="staged-pill">CUE</span>');
      }
    } else {
      // Classic theme cards
      const targetHeader = card.querySelector('.slide-header') || card.querySelector('.song-stanza-label')?.parentElement;
      if (targetHeader && !targetHeader.querySelector('.staged-pill')) {
        targetHeader.insertAdjacentHTML('beforeend', '<span class="staged-pill classic">CUE · ENTER</span>');
      }
    }
  }

  function stageSlide(slideId, text, reference, extra) {
    unstageCard();
    prepared = { slideId, text, reference, extra, stagedAt: Date.now() };
    const refEl = document.getElementById('prepared-reference');
    if (refEl) refEl.textContent = reference || 'Prepared slide';
    const textEl = document.getElementById('prepared-text');
    if (textEl) textEl.textContent = text;
    const prepEl = document.getElementById('prepared-slide');
    if (prepEl) prepEl.hidden = false;
    window.syncPresentationControls?.();

    // Apply .staged class and inject the on-card Take Live action button
    if (typeof document.querySelectorAll === 'function') {
      const cards = document.querySelectorAll(
        `[data-slide-id="${slideId}"], #bento_card_${slideId}, #card_${slideId}`
      );
      cards.forEach(c => {
        c.classList.add('staged');
        injectCardTakeLiveButton(c);
      });
      stagedCardEls = cards;
    }
  }

  function syncStagedCardVisuals() {
    if (!prepared?.slideId || typeof document.querySelectorAll !== 'function') return;
    const cards = document.querySelectorAll(
      `[data-slide-id="${prepared.slideId}"], #bento_card_${prepared.slideId}, #card_${prepared.slideId}`
    );
    cards.forEach(c => {
      if (!c.classList.contains('staged')) c.classList.add('staged');
      injectCardTakeLiveButton(c);
    });
    stagedCardEls = cards;
  }

  // ─── Public API ────────────────────────────────────────────────
  window.getProjectionWorkflow = () => workflow;
  window.getPreparedSlide = () => prepared;
  window.syncStagedCardVisuals = syncStagedCardVisuals;

  window.setProjectionWorkflow = value => {
    workflow = ['smart', 'preview', 'instant'].includes(value) ? value : 'smart';
    try { localStorage.setItem('sf_projection_workflow', workflow); } catch {}
    window.cancelPreparedSlide();
    const hint = document.querySelector('#bento-prev-idle-hint .empty-desc');
    if (hint) hint.textContent = HINTS[workflow] || HINTS.smart;
  };

  window.prepareSlideIfNeeded = (slideId, text, reference, extra) => {
    // Always bypass staging for these conditions
    if (extra.takeLive || window.state?.autoProject) return false;
    if (workflow === 'instant') return false;

    // Preview mode: always stage (legacy behavior)
    if (workflow === 'preview') {
      if (prepared && prepared.slideId === slideId) {
        const now = Date.now();
        if (prepared.stagedAt && (now - prepared.stagedAt < 200)) {
          return true;
        }
        window.takePreparedSlide();
        return true;
      }
      stageSlide(slideId, text, reference, extra);
      return true;
    }

    // Smart mode: stage only if deck is NOT engaged
    if (workflow === 'smart') {
      if (isDeckEngaged(slideId)) return false; // follow-suit → project instantly
      // Clicking the currently staged card a second time immediately takes it live
      if (prepared && prepared.slideId === slideId) {
        const now = Date.now();
        if (prepared.stagedAt && (now - prepared.stagedAt < 200)) {
          return true; // Debounce rapid pointerdown+click double-trigger
        }
        window.takePreparedSlide();
        return true;
      }
      stageSlide(slideId, text, reference, extra);
      return true;
    }

    return false;
  };

  window.cancelPreparedSlide = () => {
    unstageCard();
    prepared = null;
    const prepEl = document.getElementById('prepared-slide');
    if (prepEl) prepEl.hidden = true;
    window.syncPresentationControls?.();
  };

  window.takePreparedSlide = () => {
    if (!prepared) return;
    if (window.state?.isHoldLive) { window.showToast('Live output is held. Release Hold live before taking this slide.', 'warning'); return; }
    const slide = prepared;
    window.cancelPreparedSlide();
    window.projectSlide(slide.slideId, slide.text, slide.reference, { ...slide.extra, takeLive: true });
  };

  window.disengageLiveToCue = function(slideId) {
    if (!slideId) slideId = window.state?.activeLiveSlideId;
    if (!slideId) return;

    // 1. Disengage follow-suit so subsequent clicks will stage, not project live
    if (window.state) {
      window.state.liveEngagedDeck = null;
    }

    // 2. Remove live state from the active card
    const card = document.querySelector(`[data-slide-id="${slideId}"], #bento_card_${slideId}, #card_${slideId}`);
    const text = card?.querySelector('.card-body-text, .ln, .slide-body')?.textContent || window.state?.activeLiveText || '';
    const ref = card?.querySelector('.tag-title, .tag span, .slide-header span')?.textContent || window.state?.activeLiveRef || '';

    if (card) {
      card.classList.remove('live');
      if (typeof window.cleanupLiveCardObserver === 'function') {
        window.cleanupLiveCardObserver(card);
      }
      card.querySelectorAll('.bento-live-shape-svg, .bento-corner-dock, .live-pill, .bento-live-badge').forEach(el => el.remove());
    }

    // 3. Stage this slide in CUE position (solid fill CUE pill + blue cutout trigger)
    // Note: Sanctuary screen remains live and untouched!
    stageSlide(slideId, text, ref, {});
  };

  function addEmptyActions(root) {
    if (!(root instanceof Element)) return;
    const units = root.matches('.bento-empty-unit') ? [root] : [...root.querySelectorAll('.bento-empty-unit')];
    for (const unit of units) {
      if (unit.querySelector('.sf-empty-actions')) continue;
      const title = unit.querySelector('.empty-title')?.textContent.toLowerCase() || '';
      let actions = [];
      if (title === 'agenda empty') actions = [['Add to agenda', () => window.openOmniSearchPalette('all')]];
      else if (title === 'no songs in library') actions = [
        ['Import songs', () => { window.openImportModal(); window.switchImportSubTab('files'); }],
        ['Create song', () => { window.openImportModal(); window.switchImportSubTab('manual'); }]
      ];
      else if (title === 'no bible books') actions = [['Browse Bibles', () => { window.openImportModal(); window.switchImportSubTab('bibles'); }]];
      else if (title === 'no song selected') actions = [['Search songs', () => window.openOmniSearchPalette('songs')], ['Browse Bible', () => window.switchBentoTab('bible')]];
      else if (title.startsWith('no matching')) actions = [['Clear search', () => window.clearBentoSearch()]];
      if (!actions.length) continue;
      const row = document.createElement('div'); row.className = 'sf-empty-actions';
      for (const [label, run] of actions) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'sf-action'; button.textContent = label; button.onclick = run; row.append(button);
      }
      unit.append(row);
    }
  }

  async function refreshConnections() {
    if (new URLSearchParams(location.search).get('remote') === '1') {
      try {
        const session = await (await fetch('/api/session')).json();
        if (!session.enabled) {
          window.sfOperatorPaired = false;
          window.setRemoteSessionLocked(true);
        } else if (!window.sfOperatorPaired && document.getElementById('operator-join-modal-backdrop').style.display === 'none') {
          window.openOperatorJoinModal(false);
        }
      } catch {}
    }
    try {
      const response = await fetch('/api/output-status');
      if (!response.ok) throw new Error('Offline');
      const { outputs } = await response.json();
      for (const [target, label] of [['sanctuary', 'Projector'], ['livestream', 'Livestream']]) {
        const output = outputs.find(item => item.target === target);
        const element = document.getElementById(`${target}-connection`);
        const message = `${label}: ${output?.connected ? (output.received ? 'connected · received' : 'connected · syncing') : 'not connected'}`;
        if (element.textContent !== label) element.textContent = label;
        element.setAttribute('aria-label', message);
        element.dataset.connected = String(Boolean(output?.connected));
        element.title = `${message}. Reports browser receipt only; check the physical screen before the service.`;
      }
      const dynamic = outputs.find(item => item.target === 'dynamic');
      let dynamicEl = document.getElementById('dynamic-connection');
      if (!dynamicEl) { dynamicEl = document.createElement('span'); dynamicEl.id = 'dynamic-connection'; document.querySelector('.sf-output-status').append(dynamicEl); }
      dynamicEl.hidden = !dynamic?.connected;
      const dynamicMessage = `OBS dynamic: ${dynamic?.received ? 'connected · received' : 'connected · syncing'}`;
      if (dynamicEl.textContent !== dynamicMessage) dynamicEl.textContent = dynamicMessage;
    } catch {
      for (const target of ['sanctuary', 'livestream']) {
        const element = document.getElementById(`${target}-connection`);
        element.textContent = target === 'sanctuary' ? 'Projector' : 'Livestream';
        element.title = `${element.textContent}: server disconnected`;
        element.setAttribute('aria-label', element.title);
        element.dataset.connected = 'false';
      }
    }
    if (new URLSearchParams(location.search).get('remote') !== '1' && document.getElementById('links-modal-backdrop').classList.contains('open')) {
      try {
        const response = await fetch('/api/session');
        const session = await response.json();
        let code = document.getElementById('host-pairing-code');
        if (!code) { code = document.createElement('p'); code.id = 'host-pairing-code'; code.className = 'sf-output-status'; document.getElementById('hub-remote-row').after(code); }
        code.textContent = session.pairingCode ? `Pair a device with code ${session.pairingCode}. Share it only with your operator; stopping remote control revokes access.` : 'Start remote control to generate a device pairing code.';
      } catch {}
    }
  }

  function setup() {
    document.getElementById('projection-workflow').value = workflow;
    const hint = document.querySelector('#bento-prev-idle-hint .empty-desc');
    if (hint && workflow !== 'instant') hint.textContent = HINTS[workflow] || HINTS.smart;
    window.sessionManager?.updateTopBarUi();
    addEmptyActions(document.body);
    const observer = new MutationObserver(records => {
      for (const record of records) record.addedNodes.forEach(addEmptyActions);
    });
    observer.observe(document.getElementById('bento-grid-workspace'), { childList: true, subtree: true });
    // Group secondary setup tools without rebuilding the toolbar or its controls.
    const tools = document.createElement('details'); tools.className = 'sf-tools-menu';
    const summary = document.createElement('summary');
    summary.className = 'bento-icon-btn';
    summary.title = 'More tools';
    summary.setAttribute('aria-label', 'More tools');
    summary.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>';
    const menu = document.createElement('div');
    tools.append(summary, menu);
    const right = document.querySelector('.bento-tb-right');
    right.append(tools);
    for (const button of [...right.querySelectorAll('.bento-icon-btn')]) {
      if (/Switch to|Desktop projector/i.test(button.title)) {
        let labelText = button.title.replace(/^Switch to\s+/i, '');
        button.setAttribute('aria-label', button.title);
        button.classList.add('sf-tools-menu-item');

        const existingSvg = button.querySelector('svg');
        button.innerHTML = '';

        const iconWrap = document.createElement('span');
        iconWrap.className = 'sf-menu-icon';
        if (existingSvg) iconWrap.appendChild(existingSvg);

        const labelSpan = document.createElement('span');
        labelSpan.className = 'sf-menu-label';
        labelSpan.textContent = labelText;

        button.append(iconWrap, labelSpan);
        menu.append(button);
        button.addEventListener('click', () => { tools.open = false; });
      }
    }
    if (window.themeManager && typeof window.themeManager.updateHeaderThemeButtons === 'function') {
      window.themeManager.updateHeaderThemeButtons();
    }
    tools.addEventListener('toggle', () => {
      if (tools.open) {
        if (typeof window.openDismissShield === 'function') {
          window.openDismissShield(() => { tools.open = false; }, 100099);
        }
      } else {
        if (typeof window.closeDismissShield === 'function') {
          window.closeDismissShield();
        }
      }
    });
    document.addEventListener('click', event => { if (!tools.contains(event.target)) tools.open = false; });
    tools.addEventListener('keydown', event => { if (event.key === 'Escape') { tools.open = false; summary.focus(); } });
    refreshConnections();
    setInterval(refreshConnections, 2000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
})();
