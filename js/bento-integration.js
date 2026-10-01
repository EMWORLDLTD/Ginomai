// Ginomia - Bento Theme Interactive Controller
// Powers all buttons, slots, tabs, library items, medley deck columns, stage preview, and AI speech feed

(function() {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. BENTO AGENDA RENDERER & DRAG/DROP REORDERING
  // ─────────────────────────────────────────────────────────────────────────────
  function renderBentoAgenda() {
    const listEl = document.getElementById('bento-agenda-list');
    const countEl = document.getElementById('bento-agenda-count');
    const cardEl = document.getElementById('bento-agenda-card');
    if (!listEl) return;

    const items = window.state && window.state.agendaItems ? window.state.agendaItems : [];
    if (countEl) countEl.textContent = items.length;

    listEl.innerHTML = '';

    // Unified drop handler for dropping items anywhere in the Agenda container
    const handleAgendaDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      listEl.classList.remove('drag-hover');
      if (cardEl) cardEl.classList.remove('drag-hover');

      let songId = e.dataTransfer ? e.dataTransfer.getData('application/song-id') : null;
      let bibleBook = e.dataTransfer ? e.dataTransfer.getData('application/bible-book') : null;
      const srcIdxStr = e.dataTransfer ? e.dataTransfer.getData('application/agenda-index') : null;

      // In-memory fallback if dataTransfer custom mime was restricted
      if (!songId && !bibleBook && window.sfDraggedItem) {
        if (window.sfDraggedItem.type === 'song') songId = window.sfDraggedItem.id;
        else if (window.sfDraggedItem.type === 'bible') bibleBook = window.sfDraggedItem.id;
      }
      if (!songId && !bibleBook && !srcIdxStr && e.dataTransfer) {
        const plain = e.dataTransfer.getData('text/plain');
        if (plain) {
          if ((window.SONGS_DATABASE || []).some(s => s.id === plain)) {
            songId = plain;
          } else if ((window.BIBLE_BOOKS || []).includes(plain)) {
            bibleBook = plain;
          }
        }
      }

      if (srcIdxStr !== '' && srcIdxStr !== null && srcIdxStr !== undefined) {
        const fromIdx = parseInt(srcIdxStr, 10);
        if (!isNaN(fromIdx) && fromIdx >= 0 && fromIdx < items.length) {
          const [moved] = window.state.agendaItems.splice(fromIdx, 1);
          window.state.agendaItems.push(moved);
          if (typeof window.renderAgenda === 'function') window.renderAgenda();
          if (typeof window.renderLibrary === 'function') window.renderLibrary();
          if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();
          return;
        }
      }

      if (songId) {
        const song = (window.SONGS_DATABASE || []).find(s => s.id === songId);
        if (song) {
          window.state.agendaItems.push({
            type: 'song',
            id: song.id,
            title: song.title,
            author: song.author || 'Unknown',
            meta: song.author || 'Song'
          });
          if (typeof window.renderAgenda === 'function') window.renderAgenda();
          if (typeof window.renderLibrary === 'function') window.renderLibrary();
          if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();
        }
      } else if (bibleBook) {
        const ver = window.state.bibleVersion || 'KJV';
        window.state.agendaItems.push({
          type: 'bible',
          id: bibleBook,
          book: bibleBook,
          chapter: window.state.activeBibleChapter || 1,
          version: ver,
          title: `${bibleBook} ${window.state.activeBibleChapter || 1}`,
          meta: `${ver} Translation`
        });
        if (typeof window.renderAgenda === 'function') window.renderAgenda();
        if (typeof window.renderLibrary === 'function') window.renderLibrary();
        if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();
      }
    };

    // Container-level dropzone for dropping items into Agenda card
    listEl.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (cardEl) cardEl.classList.add('drag-hover');
    };
    listEl.ondragleave = (e) => {
      if (cardEl && !cardEl.contains(e.relatedTarget)) {
        cardEl.classList.remove('drag-hover');
      }
    };
    listEl.ondrop = handleAgendaDrop;

    if (cardEl) {
      cardEl.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        cardEl.classList.add('drag-hover');
      };
      cardEl.ondragleave = (e) => {
        if (!cardEl.contains(e.relatedTarget)) {
          cardEl.classList.remove('drag-hover');
        }
      };
      cardEl.ondrop = handleAgendaDrop;
    }

    if (items.length === 0) {
      listEl.innerHTML = `
        <div class="bento-empty-unit compact">
          <div class="empty-icon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </div>
          <div class="empty-title">Agenda empty</div>
          <div class="empty-desc">Drag songs or scriptures here, or click + Agenda from AI feed.</div>
        </div>
      `;
      return;
    }

    items.forEach((item, idx) => {
      const row = document.createElement('div');

      row.className = 'bento-agenda-row';
      row.setAttribute('draggable', 'true');
      row.dataset.agendaIndex = idx;

      let icoClass = 'song';
      let icoSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
      if (item.type === 'bible') {
        icoClass = 'scr';
        icoSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
      } else if (item.type === 'sermon') {
        icoClass = 'serm';
        icoSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
      }

      row.innerHTML = `
        <div class="bento-drag-handle" style="cursor:grab; opacity:0.4; font-size:12px; padding:0 4px;">⠿</div>
        <div class="bento-type-ico ${icoClass}">${icoSvg}</div>
        <div class="info" style="flex:1; min-width:0; overflow:hidden;">
          <div class="title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600; font-size:12px; color:var(--txt);">${escapeHtml(item.title)}</div>
          <div class="meta" style="font-size:10.5px; color:var(--mute); font-family:var(--font-mono);">${escapeHtml(item.meta || (item.type === 'song' ? (item.author || 'Song') : (item.book || 'Scripture')))}</div>
        </div>
        <button class="bento-agenda-act-btn" style="background:none; border:none; color:var(--mute); padding:4px 6px; cursor:pointer; border-radius:4px; font-size:11px; display:flex; align-items:center;" onclick="event.stopPropagation(); window.removeAgendaItem(${idx})" title="Remove from agenda">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;

      // Drag & Drop Handlers for Bento Agenda Row
      row.ondragstart = (e) => {
        window.sfIsInternalDrag = true;
        window.sfDraggedItem = { type: item.type, id: item.id, item, idx };
        if (item.type === 'song') {
          e.dataTransfer.setData('text/plain', item.id);
          e.dataTransfer.setData('application/song-id', item.id);
        } else if (item.type === 'bible') {
          e.dataTransfer.setData('text/plain', item.book || item.id);
          e.dataTransfer.setData('application/bible-book', item.book || item.id);
        }
        e.dataTransfer.setData('application/agenda-index', String(idx));
        e.dataTransfer.effectAllowed = 'move';
        row.classList.add('dragging');
      };

      row.ondragend = () => {
        window.sfIsInternalDrag = false;
        window.sfDraggedItem = null;
        row.classList.remove('dragging');
      };

      row.ondragover = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        
        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          row.classList.add('drag-over-top');
          row.classList.remove('drag-over-bottom');
        } else {
          row.classList.add('drag-over-bottom');
          row.classList.remove('drag-over-top');
        }
      };

      row.ondragleave = () => {
        row.classList.remove('drag-over-top', 'drag-over-bottom');
      };

      row.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertAfter = e.clientY >= midY;
        let targetIdx = insertAfter ? idx + 1 : idx;

        row.classList.remove('drag-over-top', 'drag-over-bottom');

        const srcIdxStr = e.dataTransfer ? e.dataTransfer.getData('application/agenda-index') : null;
        let songId = e.dataTransfer ? e.dataTransfer.getData('application/song-id') : null;
        let bibleBook = e.dataTransfer ? e.dataTransfer.getData('application/bible-book') : null;

        // Fallback to internal drag tracker if dataTransfer was restricted
        if (!songId && !bibleBook && window.sfDraggedItem) {
          if (window.sfDraggedItem.type === 'song') songId = window.sfDraggedItem.id;
          else if (window.sfDraggedItem.type === 'bible') bibleBook = window.sfDraggedItem.id;
        }
        if (!songId && !bibleBook && !srcIdxStr && e.dataTransfer) {
          const plain = e.dataTransfer.getData('text/plain');
          if (plain) {
            if ((window.SONGS_DATABASE || []).some(s => s.id === plain)) {
              songId = plain;
            } else if ((window.BIBLE_BOOKS || []).includes(plain)) {
              bibleBook = plain;
            }
          }
        }

        if (srcIdxStr !== '' && srcIdxStr !== null && srcIdxStr !== undefined) {
          const fromIdx = parseInt(srcIdxStr, 10);
          if (!isNaN(fromIdx) && fromIdx >= 0 && fromIdx < window.state.agendaItems.length) {
            if (fromIdx === idx) return;
            const [moved] = window.state.agendaItems.splice(fromIdx, 1);
            if (targetIdx > fromIdx) targetIdx--;
            window.state.agendaItems.splice(targetIdx, 0, moved);
            if (typeof window.renderAgenda === 'function') window.renderAgenda();
            if (typeof window.renderLibrary === 'function') window.renderLibrary();
            if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();
          }
        } else if (songId) {
          const song = (window.SONGS_DATABASE || []).find(s => s.id === songId);
          if (song) {
            window.state.agendaItems.splice(targetIdx, 0, {
              type: 'song',
              id: song.id,
              title: song.title,
              author: song.author || 'Unknown',
              meta: song.author || 'Song'
            });
            if (typeof window.renderAgenda === 'function') window.renderAgenda();
            if (typeof window.renderLibrary === 'function') window.renderLibrary();
            if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();
          }
        } else if (bibleBook) {
          const ver = window.state.bibleVersion || 'KJV';
          window.state.agendaItems.splice(targetIdx, 0, {
            type: 'bible',
            id: bibleBook,
            book: bibleBook,
            chapter: window.state.activeBibleChapter || 1,
            version: ver,
            title: `${bibleBook} ${window.state.activeBibleChapter || 1}`,
            meta: `${ver} Translation`
          });
          if (typeof window.renderAgenda === 'function') window.renderAgenda();
          if (typeof window.renderLibrary === 'function') window.renderLibrary();
          if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();
        }
      };

      row.onclick = () => {
        if (item.type === 'song') {
          const isDifferent = (window.state.activeSongId !== item.id);
          window.state.activeSongId = item.id;
          window.state.activeDeckType = 'song';
          if (isDifferent && window.state) {
            window.state.liveEngagedDeck = null;
            if (typeof window.cancelPreparedSlide === 'function') window.cancelPreparedSlide();
          }
          if (typeof window.applySongBoundTheme === 'function') window.applySongBoundTheme(item.id);
          window.state.currentTab = 'songs';
          syncBentoTabsUI();
          if (typeof window.renderLibrary === 'function') window.renderLibrary();
          if (typeof window.renderDeck === 'function') window.renderDeck(true);
          if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();
        } else if (item.type === 'bible') {
          const book = item.book || item.id;
          const ch = item.chapter || 1;
          const isDifferent = (window.state.activeBibleBook !== book || window.state.activeBibleChapter !== ch);
          window.state.activeBibleBook = book;
          window.state.activeBibleChapter = ch;
          window.state.activeDeckType = 'bible';
          if (isDifferent && window.state) {
            window.state.liveEngagedDeck = null;
            if (typeof window.cancelPreparedSlide === 'function') window.cancelPreparedSlide();
          }
          window.state.currentTab = 'bible';
          syncBentoTabsUI();
          if (typeof window.renderLibrary === 'function') window.renderLibrary();
          if (typeof window.renderDeck === 'function') window.renderDeck(true);
          if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();
        }
      };

      listEl.appendChild(row);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. BENTO LIBRARY RENDERER (BIBLE & SONGS WITH [1][2][3] SLOT BUTTONS & DRAG)
  // ─────────────────────────────────────────────────────────────────────────────
  function renderBentoLibrary(filterQuery = null) {
    const listEl = document.getElementById('bento-library-list');
    if (!listEl) return;
    const savedScrollTop = listEl.scrollTop;
    listEl.innerHTML = '';

    const currentTab = window.state ? window.state.currentTab : 'songs';
    listEl.classList.toggle('bento-bible-grid', currentTab === 'bible');
    let q = '';
    if (typeof filterQuery === 'string') {
      q = filterQuery.trim().toLowerCase();
    } else {
      const searchInput = document.getElementById('bento-search-input');
      q = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : '';
    }

    // Update active translation badge
    const transLabel = document.getElementById('bento-active-version-label');
    if (transLabel) {
      transLabel.textContent = (window.state && window.state.bibleVersion) ? window.state.bibleVersion : 'KJV';
    }

    if (currentTab === 'bible') {
      const ver = (window.state && window.state.bibleVersion) ? window.state.bibleVersion : 'KJV';
      const books = typeof window.getBibleBooks === 'function' ? window.getBibleBooks(ver) : [];
      const filtered = q ? books.filter(b => b.toLowerCase().includes(q)) : books;

      if (filtered.length === 0) {
        listEl.innerHTML = `
          <div class="bento-empty-unit compact">
            <div class="empty-icon">
              ${q ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'}
            </div>
            <div class="empty-title">${q ? 'No matching books' : 'No Bible books'}</div>
            <div class="empty-desc">${q ? 'Check spelling or switch translation above.' : 'Import Bible translations from top toolbar.'}</div>
          </div>
        `;
        return;
      }

      const showBibleMedleyBtns = !!(window.state && (window.state.isMedleyMode || window.state.showBibleMedleyButtons));
      const slots = window.state && window.state.medleyBibleSlots ? window.state.medleyBibleSlots : [];
      const s0Book = slots[0] ? slots[0].book : null;
      const s1Book = slots[1] ? slots[1].book : null;
      const s2Book = slots[2] ? slots[2].book : null;

      filtered.forEach(book => {
        const isBookActive = window.state && window.state.activeBibleBook === book;
        const isExpanded = (window.state && window.state.expandedBibleBook === book) || (filtered.length === 1 && Boolean(q));
        const chapters = typeof window.getBibleChapters === 'function' ? window.getBibleChapters(book, ver) : [];

        const wrap = document.createElement('div');
        wrap.className = `bento-bible-wrap ${isExpanded ? 'expanded' : ''}`;

        const row = document.createElement('div');
        row.className = `bento-song-row bento-bible-book-row ${isBookActive ? 'active' : ''}`;
        row.setAttribute('draggable', 'true');

        const isS1 = s0Book === book;
        const isS2 = s1Book === book;
        const isS3 = s2Book === book;

        const slotBtnsHtml = showBibleMedleyBtns ? `
          <div class="bento-slotbtns">
            <span class="${isS1 ? 'active' : ''}" title="${isS1 ? `Remove ${escapeHtml(book)} from Slot S1` : `Assign ${escapeHtml(book)} to Slot S1`}" onclick="event.stopPropagation(); window.assignBibleBookToSlot('${book}', 0)">1</span>
            <span class="${isS2 ? 'active' : ''}" title="${isS2 ? `Remove ${escapeHtml(book)} from Slot S2` : `Assign ${escapeHtml(book)} to Slot S2`}" onclick="event.stopPropagation(); window.assignBibleBookToSlot('${book}', 1)">2</span>
            <span class="${isS3 ? 'active' : ''}" title="${isS3 ? `Remove ${escapeHtml(book)} from Slot S3` : `Assign ${escapeHtml(book)} to Slot S3`}" onclick="event.stopPropagation(); window.assignBibleBookToSlot('${book}', 2)">3</span>
          </div>
        ` : '';

        row.innerHTML = `
          <div class="info" style="flex:1; min-width:0;">
            <div class="n" style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
              <span>${escapeHtml(book)}</span>
              <svg class="bento-chevron ${isExpanded ? 'open' : ''}" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="a">${chapters.length} chapters · ${escapeHtml(ver)}</div>
          </div>
          ${slotBtnsHtml}
        `;

        // Drag start handler for Bible book row
        row.ondragstart = (e) => {
          window.sfIsInternalDrag = true;
          window.sfDraggedItem = { type: 'bible', id: book, book };
          e.dataTransfer.setData('text/plain', book);
          e.dataTransfer.setData('application/bible-book', book);
          e.dataTransfer.setData('application/item-type', 'bible');
          e.dataTransfer.effectAllowed = 'copyMove';
          row.classList.add('dragging');
        };

        row.ondragend = () => {
          window.sfIsInternalDrag = false;
          window.sfDraggedItem = null;
          row.classList.remove('dragging');
        };

        row.onclick = () => {
          if (!window.state) window.state = {};
          const isOpening = window.state.expandedBibleBook !== book;
          if (window.state.expandedBibleBook === book) {
            window.state.expandedBibleBook = null;
          } else {
            window.state.expandedBibleBook = book;
          }
          if (typeof window.renderLibrary === 'function') window.renderLibrary();

          if (isOpening) {
            setTimeout(() => {
              const currentList = document.getElementById('bento-library-list');
              if (currentList) {
                const targetWrap = currentList.querySelector('.bento-bible-wrap.expanded');
                if (targetWrap) {
                  const wrapRect = targetWrap.getBoundingClientRect();
                  const listRect = currentList.getBoundingClientRect();
                  if (wrapRect.top < listRect.top) {
                    currentList.scrollTo({ top: Math.max(0, currentList.scrollTop + (wrapRect.top - listRect.top) - 8), behavior: 'smooth' });
                  } else if (wrapRect.bottom > listRect.bottom) {
                    currentList.scrollTo({ top: currentList.scrollTop + (wrapRect.bottom - listRect.bottom) + 8, behavior: 'smooth' });
                  }
                }
              }
            }, 30);
          }
        };

        wrap.appendChild(row);

        if (isExpanded && chapters.length > 0) {
          const drawer = document.createElement('div');
          drawer.className = 'bento-bible-drawer';

          let btnsHtml = '';
          chapters.forEach(chStr => {
            const chNum = parseInt(chStr, 10);
            const isChActive = isBookActive && parseInt(window.state.activeBibleChapter, 10) === chNum;

            btnsHtml += `
              <button type="button" class="bento-drawer-btn ${isChActive ? 'active' : ''}" onclick="event.stopPropagation(); window.selectBentoBibleChapter('${escapeHtml(book)}', ${chNum}, true, event)" title="${escapeHtml(book)} Chapter ${chNum}">
                ${chNum}
              </button>
            `;
          });

          drawer.innerHTML = `
            <div class="bento-drawer-head">
              <span>Select chapter</span>
              <span class="cnt">${chapters.length} chs</span>
            </div>
            <div class="bento-drawer-grid">
              ${btnsHtml}
            </div>
          `;

          wrap.appendChild(drawer);
        }

        listEl.appendChild(wrap);
      });

    } else {
      // SONGS MODE
      const songs = window.SONGS_DATABASE || [];
      const filtered = q 
        ? songs.filter(s => (typeof window.matchSongQuery === 'function' ? window.matchSongQuery(s, q) : (typeof window.getSongSearchIndex === 'function' ? window.getSongSearchIndex(s) : (s.title + ' ' + (s.author || ''))).toLowerCase().includes(q)))
        : songs;

      if (filtered.length === 0) {
        listEl.innerHTML = `
          <div class="bento-empty-unit compact">
            <div class="empty-icon">
              ${q ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'}
            </div>
            <div class="empty-title">${q ? 'No matching songs' : 'No songs in library'}</div>
            <div class="empty-desc">${q ? 'Try searching by title, artist, or lyric phrase.' : 'Import song files via the top toolbar to start.'}</div>
          </div>
        `;
        return;
      }

      const showSongsMedleyBtns = !!(window.state && (window.state.isMedleyMode || window.state.showMedleyView));
      const medleyIds = (window.state && Array.isArray(window.state.medleySongIds)) ? window.state.medleySongIds : [];
      const m0 = medleyIds[0];
      const m1 = medleyIds[1];
      const m2 = medleyIds[2];
      const activeId = window.state ? window.state.activeSongId : null;

      filtered.forEach(song => {
        const row = document.createElement('div');
        const isSelected = activeId === song.id;
        const isS1 = m0 === song.id;
        const isS2 = m1 === song.id;
        const isS3 = m2 === song.id;

        row.className = `bento-song-row ${isSelected ? 'active' : ''}`;
        row.dataset.songId = song.id;
        row.setAttribute('draggable', 'true');

        const slotBtnsHtml = showSongsMedleyBtns ? `
          <div class="bento-slotbtns">
            <span class="${isS1 ? 'active' : ''}" title="${isS1 ? 'Remove from Slot S1' : 'Assign to Slot S1'}" onclick="event.stopPropagation(); window.swapMedleySong(0, '${song.id}')">1</span>
            <span class="${isS2 ? 'active' : ''}" title="${isS2 ? 'Remove from Slot S2' : 'Assign to Slot S2'}" onclick="event.stopPropagation(); window.swapMedleySong(1, '${song.id}')">2</span>
            <span class="${isS3 ? 'active' : ''}" title="${isS3 ? 'Remove from Slot S3' : 'Assign to Slot S3'}" onclick="event.stopPropagation(); window.swapMedleySong(2, '${song.id}')">3</span>
          </div>
        ` : '';

        row.innerHTML = `
          <div class="info">
            <div class="n">${escapeHtml(song.title)}</div>
            <div class="a">${escapeHtml(song.author || 'Unknown')}</div>
          </div>
          ${slotBtnsHtml}
        `;

        // Drag start handler for Song row
        row.ondragstart = (e) => {
          window.sfIsInternalDrag = true;
          window.sfDraggedItem = { type: 'song', id: song.id, song };
          e.dataTransfer.setData('text/plain', song.id);
          e.dataTransfer.setData('application/song-id', song.id);
          e.dataTransfer.setData('application/item-type', 'song');
          e.dataTransfer.effectAllowed = 'copyMove';
          row.classList.add('dragging');
        };

        row.ondragend = () => {
          window.sfIsInternalDrag = false;
          window.sfDraggedItem = null;
          row.classList.remove('dragging');
        };

        row.onclick = () => {
          const isDifferentSong = (window.state.activeSongId !== song.id);
          window.state.activeSongId = song.id;
          window.state.activeDeckType = 'song';
          if (isDifferentSong && window.state) {
            window.state.liveEngagedDeck = null;
            window.state.isDeckEditingSong = null;
            if (typeof window.cancelPreparedSlide === 'function') window.cancelPreparedSlide();
          }
          if (typeof window.applySongBoundTheme === 'function') window.applySongBoundTheme(song.id);
          const list = row.parentElement;
          if (list) {
            list.querySelectorAll('.bento-song-row.active').forEach(el => el.classList.remove('active'));
            row.classList.add('active');
          }
          if (typeof window.renderDeck === 'function') window.renderDeck(true);
          if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();
        };

        row.oncontextmenu = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.openSongContextMenu(e, song.id);
        };

        listEl.appendChild(row);
      });
    }

    if (savedScrollTop > 0) {
      listEl.scrollTop = savedScrollTop;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UNIVERSAL OVERLAY DISMISSAL SHIELD (Zero-Latency Click-Through Prevention)
  // ─────────────────────────────────────────────────────────────────────────────
  let _activeDismissCallback = null;

  window.openDismissShield = function(onDismiss, zIndex = 99990) {
    let shield = document.getElementById('sf-dismiss-shield');
    if (!shield) {
      shield = document.createElement('div');
      shield.id = 'sf-dismiss-shield';
      shield.className = 'sf-dismiss-shield';
      document.body.appendChild(shield);

      const handleDismiss = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const cb = _activeDismissCallback;
        _activeDismissCallback = null;
        if (typeof cb === 'function') {
          cb(e);
        } else {
          window.dismissAllOverlays();
        }
        window.closeDismissShield();
      };

      shield.addEventListener('pointerdown', handleDismiss, true);
      shield.addEventListener('mousedown', handleDismiss, true);
      shield.addEventListener('click', handleDismiss, true);
      shield.addEventListener('contextmenu', handleDismiss, true);
    }

    _activeDismissCallback = onDismiss;
    shield.style.zIndex = zIndex;
    shield.style.display = 'block';
  };

  window.closeDismissShield = function() {
    const shield = document.getElementById('sf-dismiss-shield');
    if (shield) {
      shield.style.display = 'none';
    }
    _activeDismissCallback = null;
  };

  window.dismissAllOverlays = function() {
    if (typeof window.closeSongContextMenu === 'function') window.closeSongContextMenu();
    if (typeof window.closeTranslationDropdown === 'function') window.closeTranslationDropdown();
    if (typeof window.closeBentoChapterPopover === 'function') window.closeBentoChapterPopover();
    if (typeof window.closeBentoVersePopover === 'function') window.closeBentoVersePopover();
    if (typeof window.closeSongPicker === 'function') window.closeSongPicker();
    if (typeof window.closeVersionPicker === 'function') window.closeVersionPicker();
    if (typeof window.closeBiblePassagePicker === 'function') window.closeBiblePassagePicker();
    if (typeof window.cancelActiveInlineCardEdit === 'function') window.cancelActiveInlineCardEdit();
    if (typeof window.closeAudioMicPopover === 'function') window.closeAudioMicPopover();
    if (typeof window.closeTransitionDialog === 'function') window.closeTransitionDialog();
    if (window.sessionManager && typeof window.sessionManager.closeSessionDropdown === 'function') {
      window.sessionManager.closeSessionDropdown();
    }
    const tools = document.querySelector('.sf-tools-menu');
    if (tools && tools.open) tools.open = false;
    window.closeDismissShield();
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // SONG LIST CONTEXT MENU (RIGHT-CLICK TO EDIT)
  window.openSongContextMenu = function(e, songId) {
    let menu = document.getElementById('sf-song-context-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'sf-song-context-menu';
      menu.className = 'sf-song-context-menu';
      document.body.appendChild(menu);
    }

    const song = (window.SONGS_DATABASE || []).find(s => s.id === songId);

    const boundThemeId = window.getSongBoundTheme ? window.getSongBoundTheme(songId) : null;
    const boundThemeObj = (boundThemeId && window.SANCTUARY_THEMES) ? window.SANCTUARY_THEMES[boundThemeId] : null;
    const themeLabel = boundThemeObj ? `Theme: ${boundThemeObj.name}` : 'Set default theme...';

    menu.innerHTML = `
      <button type="button" class="sf-ctx-item" id="sf-ctx-inplace-btn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
        <span>Quick edit in-place</span>
      </button>
      <button type="button" class="sf-ctx-item" id="sf-ctx-sheet-btn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        <span>Song sheet editor</span>
      </button>
      <button type="button" class="sf-ctx-item" id="sf-ctx-theme-btn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z"/></svg>
        <span>${escapeHtml(themeLabel)}</span>
      </button>
      <div class="sf-ctx-divider"></div>
      <button type="button" class="sf-ctx-item" id="sf-ctx-agenda-btn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        <span>Add to Agenda</span>
      </button>
    `;

    const inplaceBtn = menu.querySelector('#sf-ctx-inplace-btn');
    if (inplaceBtn) {
      inplaceBtn.onclick = (ev) => {
        ev.stopPropagation();
        window.closeSongContextMenu();
        if (window.state) window.state.activeSongId = songId;
        if (typeof window.renderDeck === 'function') window.renderDeck();
        setTimeout(() => {
          const firstCard = document.querySelector(`.bento-single-card[data-slide-id*="${songId}"]`) ||
                            document.querySelector('.bento-single-card');
          if (firstCard && firstCard.dataset && firstCard.dataset.slideId) {
            window.startInlineCardEdit(firstCard.dataset.slideId, songId, 0);
          } else if (typeof window.openSongSheetModal === 'function') {
            window.openSongSheetModal(songId, 0);
          }
        }, 100);
      };
    }

    const themeBtn = menu.querySelector('#sf-ctx-theme-btn');
    if (themeBtn) {
      themeBtn.onclick = (ev) => {
        ev.stopPropagation();
        window.closeSongContextMenu();
        if (typeof window.openSongThemeBindingModal === 'function') {
          window.openSongThemeBindingModal(songId);
        }
      };
    }

    const sheetBtn = menu.querySelector('#sf-ctx-sheet-btn');
    if (sheetBtn) {
      sheetBtn.onclick = (ev) => {
        ev.stopPropagation();
        window.closeSongContextMenu();
        if (window.state) window.state.activeSongId = songId;
        if (typeof window.openSongSheetModal === 'function') {
          window.openSongSheetModal(songId, 0);
        } else if (typeof window.openSongEditorModal === 'function') {
          window.openSongEditorModal(songId, 0);
        }
      };
    }

    const agendaBtn = menu.querySelector('#sf-ctx-agenda-btn');
    if (agendaBtn) {
      agendaBtn.onclick = (ev) => {
        ev.stopPropagation();
        window.closeSongContextMenu();
        if (song) {
          if (!window.state) window.state = {};
          if (!Array.isArray(window.state.agendaItems)) window.state.agendaItems = [];
          window.state.agendaItems.push({
            type: 'song',
            id: song.id,
            title: song.title,
            author: song.author || ''
          });
          if (typeof window.renderBentoAgenda === 'function') window.renderBentoAgenda();
          if (typeof window.showToast === 'function') window.showToast(`Added "${song.title}" to agenda`, 'success');
        }
      };
    }

    menu.style.display = 'flex';
    menu.style.visibility = 'hidden';
    menu.style.top = '0px';
    menu.style.left = '0px';

    const menuW = menu.offsetWidth || 140;
    const menuH = menu.offsetHeight || 72;

    let posX = e.clientX;
    let posY = e.clientY;

    if (posX + menuW > window.innerWidth - 10) {
      posX = Math.max(10, window.innerWidth - menuW - 10);
    }
    if (posY + menuH > window.innerHeight - 10) {
      posY = Math.max(10, window.innerHeight - menuH - 10);
    }

    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;
    menu.style.visibility = 'visible';

    // Activate shield to swallow outside clicks completely (prevents underlying card clicks)
    window.openDismissShield(() => {
      window.closeSongContextMenu();
    }, 100001);

    const keyHandler = (ev) => {
      if (ev.key === 'Escape') {
        window.closeSongContextMenu();
      }
    };
    window._sfCtxKey = keyHandler;
    document.addEventListener('keydown', keyHandler, { once: true });
  };

  window.closeSongContextMenu = function() {
    const menu = document.getElementById('sf-song-context-menu');
    if (menu) {
      menu.style.display = 'none';
      menu.innerHTML = '';
    }
    if (window._sfCtxKey) {
      document.removeEventListener('keydown', window._sfCtxKey);
      window._sfCtxKey = null;
    }
    window.closeDismissShield();
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. BENTO DECK RENDERER (SINGLE OR 3-COLUMN MEDLEY WITH S1/S2/S3 HEADERS)
  // ─────────────────────────────────────────────────────────────────────────────
  let liveCardResizeObserver = null;
  window.updateBentoLiveCardShape = function(cardEl) {
    if (!cardEl) return;
    const svgPath = cardEl.querySelector('.bento-live-shape-svg path');
    if (!svgPath) return;
    const w = cardEl.offsetWidth;
    const h = cardEl.offsetHeight;
    if (w <= 0 || h <= 0) return;

    const R = 16;      // outer corner radius matching .bento-single-card
    const offset = 26; // play button center offset from right and bottom edges
    const Rc = 26;     // circular scoop radius (giving an exact uniform 8px moat around 36px button)
    const r = 12;      // smooth blend fillet radius

    if (w < 120 || h < 80) {
      svgPath.setAttribute('d', `M ${R} 0 H ${w - R} A ${R} ${R} 0 0 1 ${w} ${R} V ${h - R} A ${R} ${R} 0 0 1 ${w - R} ${h} H ${R} A ${R} ${R} 0 0 1 0 ${h - R} V ${R} A ${R} ${R} 0 0 1 ${R} 0 Z`);
      return;
    }

    // Button center
    const cx = w - offset;
    const cy = h - offset;

    const dx = offset - r;
    const dy2 = Math.pow(Rc + r, 2) - Math.pow(dx, 2);
    const dy = dy2 > 0 ? Math.sqrt(dy2) : 0;

    // Right edge fillet
    const T1y = cy - dy;
    const F1x = w - r;
    const F1y = T1y;
    const ratio = r / (Rc + r);
    const T2x = F1x + ratio * (cx - F1x);
    const T2y = F1y + ratio * (cy - F1y);

    // Bottom edge fillet
    const F2x = cx - dy;
    const F2y = h - r;
    const T3x = F2x + ratio * (cx - F2x);
    const T3y = F2y + ratio * (cy - F2y);
    const T4x = F2x;

    const d = `
      M ${R} 0
      H ${w - R}
      A ${R} ${R} 0 0 1 ${w} ${R}
      V ${T1y.toFixed(2)}
      A ${r} ${r} 0 0 1 ${T2x.toFixed(2)} ${T2y.toFixed(2)}
      A ${Rc} ${Rc} 0 0 0 ${T3x.toFixed(2)} ${T3y.toFixed(2)}
      A ${r} ${r} 0 0 1 ${T4x.toFixed(2)} ${h}
      H ${R}
      A ${R} ${R} 0 0 1 0 ${h - R}
      V ${R}
      A ${R} ${R} 0 0 1 ${R} 0
      Z
    `.replace(/\s+/g, ' ').trim();

    svgPath.setAttribute('d', d);
  };

  function setupLiveCardObserver(cardEl) {
    if (!cardEl) return;
    if (!liveCardResizeObserver && typeof ResizeObserver !== 'undefined') {
      liveCardResizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target && (entry.target.classList.contains('live') || entry.target.classList.contains('staged'))) {
            updateBentoLiveCardShape(entry.target);
          }
        }
      });
    }
    if (liveCardResizeObserver) {
      liveCardResizeObserver.observe(cardEl);
    }
    updateBentoLiveCardShape(cardEl);
  }
  window.setupLiveCardObserver = setupLiveCardObserver;

  window.cleanupLiveCardObserver = function(cardEl) {
    if (cardEl && liveCardResizeObserver) {
      try { liveCardResizeObserver.unobserve(cardEl); } catch(e) {}
    }
  };

  
  window._bentoSlideRegistry = window._bentoSlideRegistry || new Map();
  window.projectBentoSlide = function(slideId, forceLive) {
    if (!slideId) return;
    const extra = forceLive ? { takeLive: true } : {};
    const data = window._bentoSlideRegistry ? window._bentoSlideRegistry.get(slideId) : null;
    if (data && typeof window.projectSlide === 'function') {
      window.projectSlide(data.slideId, data.text, data.refStr, extra);
    } else if (typeof window.projectSlide === 'function') {
      const card = document.querySelector(`[data-slide-id="${slideId}"]`);
      if (card) {
        const text = card.querySelector('.ln')?.textContent || '';
        const tag = card.querySelector('.tag span')?.textContent || '';
        window.projectSlide(slideId, text, tag, extra);
      }
    }
  };

  function renderBentoDeck() {
    if (liveCardResizeObserver) {
      try { liveCardResizeObserver.disconnect(); } catch (e) {}
    }
    const container = document.getElementById('bento-medley-container');
    if (!container) return;
    if (window._bentoSlideRegistry) window._bentoSlideRegistry.clear();

    const state = window.state || {};
    const isMedley = !!state.isMedleyMode;
    const hasActiveItem = Boolean(state.activeLiveSlideId || state.liveEngagedDeck || (state.activeDeckType === 'song' && state.activeSongId) || (state.activeDeckType === 'bible' && state.activeBibleBook));
    const deckType = hasActiveItem ? (state.activeDeckType || (state.currentTab === 'bible' ? 'bible' : 'song')) : (state.currentTab === 'bible' ? 'bible' : 'song');
    const isBibleDeck = (deckType === 'bible');
    if (isBibleDeck && state) {
      state.isDeckEditingSong = null;
    }

    // Topbar titles
    const titleEl = document.getElementById('bento-deck-title');
    const subEl = document.getElementById('bento-deck-sub');
    const editBtn = document.getElementById('bento-edit-btn');
    const addSongBtn = document.getElementById('bento-add-song-btn');
    const compareBtn = document.getElementById('bento-compare-btn');
    const strongsBtn = document.getElementById('bento-strongs-btn');

    const isEditing = Boolean(!isBibleDeck && state.isDeckEditingSong && state.isDeckEditingSong === state.activeSongId);
    const deckCard = document.getElementById('bento-deck-card');
    if (deckCard) {
      deckCard.classList.toggle('in-split-editor', isEditing);
      deckCard.scrollTop = 0;
    }

    if (editBtn) {
      editBtn.style.display = isBibleDeck ? 'none' : 'inline-flex';
      editBtn.classList.toggle('active', isEditing);
      if (isEditing) {
        editBtn.onclick = () => saveBentoDeckSplitEditor();
        editBtn.innerHTML = `
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Save &amp; close</span>
        `;
        editBtn.title = 'Save and return to standard deck view';
      } else {
        editBtn.onclick = () => window.openSongEditor(window.state.activeSongId);
        editBtn.innerHTML = `
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
          <span>Edit song</span>
        `;
        editBtn.title = 'Edit lyrics in split view';
      }
    }
    if (addSongBtn) {
      addSongBtn.style.display = (isBibleDeck || isEditing) ? 'none' : 'inline-flex';
    }
    if (compareBtn) {
      compareBtn.style.display = isBibleDeck ? 'inline-flex' : 'none';
      compareBtn.classList.toggle('active', !!state.isCompareMode);
    }
    if (strongsBtn) {
      strongsBtn.style.display = isBibleDeck ? 'inline-flex' : 'none';
      strongsBtn.classList.toggle('active', Boolean(state.strongsMode));
    }

    // Return to Live tally button
    const liveDeck = state.liveEngagedDeck || (state.activeLiveSlideId ? {
      type: (state.activeLiveSlideId.startsWith('bible_') || state.activeLiveSlideId.startsWith('medley_bible_')) ? 'bible' : 'song',
      songId: state.activeSongId,
      book: state.activeBibleBook,
      chapter: state.activeBibleChapter
    } : null);

    const isDeckViewingLive = Boolean(liveDeck && (
      (isBibleDeck && liveDeck.type === 'bible' && (!liveDeck.book || liveDeck.book === state.activeBibleBook)) ||
      (!isBibleDeck && liveDeck.type === 'song' && (!liveDeck.songId || liveDeck.songId === state.activeSongId))
    ));

    const showReturnToLive = Boolean(state.activeLiveSlideId && !isDeckViewingLive);
    const returnLiveBtn = document.getElementById('bento-deck-return-live-btn');
    if (returnLiveBtn) {
      if (showReturnToLive) {
        returnLiveBtn.style.display = 'inline-flex';
        returnLiveBtn.onclick = (e) => {
          e.stopPropagation();
          if (liveDeck) {
            state.activeDeckType = liveDeck.type;
            if (liveDeck.type === 'song' && liveDeck.songId) state.activeSongId = liveDeck.songId;
            if (liveDeck.type === 'bible') {
              if (liveDeck.book) state.activeBibleBook = liveDeck.book;
              if (liveDeck.chapter) state.activeBibleChapter = liveDeck.chapter;
            }
            if (typeof window.renderDeck === 'function') window.renderDeck(true);
            if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();
          }
        };
      } else {
        returnLiveBtn.style.display = 'none';
      }
    }

    // Single view columns segmented buttons (1 Col / 2 Col / 3 Col)
    const colsSeg = document.getElementById('bento-cols-seg');
    if (colsSeg) {
      colsSeg.style.display = (isMedley || isEditing) ? 'none' : 'inline-flex';
      const activeCols = (state.bentoSingleCols !== undefined ? state.bentoSingleCols : 1);
      colsSeg.querySelectorAll('span').forEach(sp => {
        sp.classList.toggle('active', parseInt(sp.dataset.cols, 10) === activeCols);
      });
    }

    // Lines per slide segmented buttons
    const linesSeg = document.getElementById('bento-lines-seg');
    if (linesSeg) {
      linesSeg.style.display = (isBibleDeck || isEditing) ? 'none' : 'inline-flex';
      const maxL = state.maxLinesPerSlide !== undefined ? state.maxLinesPerSlide : 0;
      linesSeg.querySelectorAll('span').forEach(sp => {
        const val = parseInt(sp.dataset.lines, 10);
        sp.classList.toggle('active', val === maxL);
      });
    }

    // Zoom label & zoom container
    const zoomContainer = document.querySelector('#bento-deck-card .bento-zoom');
    if (zoomContainer) {
      zoomContainer.style.display = isEditing ? 'none' : 'inline-flex';
    }
    const zoomLabel = document.getElementById('bento-zoom-label');
    if (zoomLabel) {
      const activeZoom = isMedley 
        ? (state.bentoMedleyScale !== undefined ? state.bentoMedleyScale : 1.0)
        : (state.bentoSingleScale !== undefined ? state.bentoSingleScale : (state.deckScale || 1.0));
      zoomLabel.textContent = Math.round(activeZoom * 100) + '%';
    }

    // Medley mode segmented buttons
    const modeSeg = document.getElementById('bento-mode-seg');
    if (modeSeg) {
      modeSeg.style.display = (isBibleDeck || isEditing) ? 'none' : 'inline-flex';
    }
    const segSingle = document.getElementById('bento-seg-single');
    const segMedley = document.getElementById('bento-seg-medley');
    if (segSingle) segSingle.classList.toggle('active', !isMedley);
    if (segMedley) segMedley.classList.toggle('active', isMedley);

    container.innerHTML = '';
    container.scrollTop = 0;
    container.className = isMedley ? 'bento-medley' : 'bento-single-deck';

    if (isMedley) {
      // MEDLEY 3-COLUMN DECK
      if (isBibleDeck) {
        if (titleEl) {
          titleEl.textContent = 'Scripture Medley';
          if (titleEl.removeAttribute) titleEl.removeAttribute('title');
          titleEl.title = '';
        }

        const slots = (state.medleyBibleSlots && state.medleyBibleSlots.length > 0) ? state.medleyBibleSlots : [
          state.activeBibleBook ? { book: state.activeBibleBook, chapter: state.activeBibleChapter || 1, version: state.bibleVersion || 'KJV' } : null,
          null,
          null
        ];

        const populatedSlotsCount = slots.filter(s => s && s.book).length;
        if (subEl) {
          subEl.textContent = populatedSlotsCount > 0 
            ? `${populatedSlotsCount} scripture passage${populatedSlotsCount > 1 ? 's' : ''} loaded · compare & multi-slot` 
            : '0 scripture passages loaded · drag or choose scriptures below';
          if (subEl.removeAttribute) subEl.removeAttribute('title');
          subEl.title = '';
        }

        for (let idx = 0; idx < 3; idx++) {
          const slot = slots[idx];
          const book = slot ? slot.book : null;
          const ch = slot ? slot.chapter : 1;
          const ver = slot ? (slot.version || state.bibleVersion || 'KJV') : (state.bibleVersion || 'KJV');
          const verses = book ? (typeof window.getBibleVerses === 'function' ? window.getBibleVerses(book, ch, ver) : []) : [];

          const isColLive = book && verses.length > 0 && verses.some(v => typeof window.isBibleSlideLive === 'function' && window.isBibleSlideLive(ver, book, ch, v.verse, idx));
          const col = document.createElement('div');
          col.className = `bento-slot-col ${isColLive ? 'active-song' : ''}`;

          // Drag & Drop for Bible Medley Slot
          col.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            col.classList.add('drag-hover');
          };
          col.ondragleave = () => {
            col.classList.remove('drag-hover');
          };
          col.ondrop = (e) => {
            e.preventDefault();
            col.classList.remove('drag-hover');
            const droppedBook = (e.dataTransfer ? e.dataTransfer.getData('application/bible-book') : null) ||
              (window.sfDraggedItem && window.sfDraggedItem.type === 'bible' ? window.sfDraggedItem.id : null) ||
              (e.dataTransfer ? e.dataTransfer.getData('text/plain') : null);
            if (droppedBook && typeof window.assignBibleBookToSlot === 'function') {
              window.assignBibleBookToSlot(droppedBook, idx, 1, false);
            }
          };

          let slidesHtml = '';
          if (book && verses.length > 0) {
            verses.forEach(v => {
              const slideId = `medley_bible_s${idx}_${book}_${ch}_${v.verse}`;
              const refStr = `${book} ${ch}:${v.verse} (${ver})`;
              const isLive = typeof window.isBibleSlideLive === 'function' && window.isBibleSlideLive(ver, book, ch, v.verse, idx);

              const cleanText = (typeof window.stripStrongsTags === 'function')
                ? window.stripStrongsTags(v.text)
                : (v.text || '').replace(/<sup\b[^>]*>.*?<\/sup>/gi, '').replace(/<[HG]\d+>/gi, '').replace(/[ \t]+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
              let verseBodyHtml = escapeHtml(cleanText);
              if (window.state && window.state.strongsMode) {
                let taggedText = v.text;
                if (typeof BIBLE_DATABASE !== 'undefined' && BIBLE_DATABASE['KJV_STRONGS'] && BIBLE_DATABASE['KJV_STRONGS'][book] && BIBLE_DATABASE['KJV_STRONGS'][book][ch]) {
                  const tv = BIBLE_DATABASE['KJV_STRONGS'][book][ch].find(item => item.verse === v.verse);
                  if (tv && tv.text) taggedText = tv.text;
                }
                if (typeof window.formatStrongsVerseHtml === 'function') {
                  verseBodyHtml = window.formatStrongsVerseHtml(taggedText);
                }
              }

              window._bentoSlideRegistry.set(slideId, { slideId, text: cleanText, refStr });
              slidesHtml += `
                <div id="bento_card_${slideId}" data-slide-id="${slideId}" class="bento-slide-card ${isLive ? 'live' : ''}" onclick="window.projectBentoSlide('${slideId}')" ondblclick="event.stopPropagation(); window.projectBentoSlide('${slideId}', true)">
                  <div class="tag">
                    <span>VERSE ${v.verse}</span>
                    ${isLive ? '<span class="bento-live-badge"></span>' : ''}
                  </div>
                  <div class="ln">${verseBodyHtml}</div>
                </div>
              `;
            });
          } else {
            slidesHtml = `
              <div class="bento-empty-unit compact" style="margin:0; padding:18px 10px;">
                <div class="empty-icon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                </div>
                <div class="empty-title">Slot S${idx + 1} empty</div>
                <div class="empty-desc">Drag a scripture here or click Change above.</div>
              </div>
            `;
          }

          const changeTarget = state.bibleMedleyChangeTarget || 'chapter';
          const isVersionAction = changeTarget === 'version';
          const changeOnClick = isVersionAction 
            ? `window.openVersionPicker(${idx}, event)` 
            : `window.openBiblePassagePicker(${idx}, event)`;
          const changeLabel = isVersionAction ? 'Version' : 'Change';
          const changeTip = isVersionAction ? 'Switch Bible translation for this slot' : 'Select scripture book & chapter for this slot';

          const titleContentHtml = book 
            ? `<span class="t" style="cursor:pointer;" onclick="event.stopPropagation(); window.openBiblePassagePicker(${idx}, event)" title="Click to change scripture passage">${escapeHtml(book)} ${ch} <span style="font-size:10px; opacity:0.75;" onclick="event.stopPropagation(); window.openVersionPicker(${idx}, event)" title="Click to switch translation">(${ver})</span></span>`
            : `<span class="t" style="cursor:pointer; color:var(--mute);" onclick="event.stopPropagation(); window.openBiblePassagePicker(${idx}, event)" title="Click to select scripture passage">Empty Slot</span>`;

          col.innerHTML = `
            <div class="bento-slot-col-head">
              <span class="bento-slot-badge">S${idx + 1}</span>
              ${titleContentHtml}
              <span class="change" onclick="event.stopPropagation(); ${changeOnClick}" title="${changeTip}">${changeLabel}</span>
            </div>
            <div class="bento-slides">${slidesHtml}</div>
          `;
          container.appendChild(col);
        }

      } else {
        // SONGS MEDLEY 3-COLUMN DECK
        if (titleEl) {
          titleEl.textContent = 'Worship medley';
          if (titleEl.removeAttribute) titleEl.removeAttribute('title');
          titleEl.title = '';
        }
        const songIds = state.medleySongIds || [];
        const loadedSongsCount = [songIds[0], songIds[1], songIds[2]].filter(Boolean).length;
        if (subEl) {
          subEl.textContent = `${loadedSongsCount} ${loadedSongsCount === 1 ? 'song' : 'songs'} loaded · lyrics view`;
          if (subEl.removeAttribute) subEl.removeAttribute('title');
          subEl.title = '';
        }

        for (let idx = 0; idx < 3; idx++) {
          const songId = songIds[idx];
          const song = (window.SONGS_DATABASE || []).find(s => s.id === songId);

          const isColLive = song && song.stanzas && song.stanzas.some((stanza, sIdx) => {
            const maxLines = state.maxLinesPerSlide || 4;
            const chunks = typeof window.splitStanzaIntoChunks === 'function' 
              ? window.splitStanzaIntoChunks(stanza, maxLines)
              : [{ ...stanza, chunkIndex: 0, totalChunks: 1, label: stanza.type }];
            return chunks.some((chunk, cIdx) => typeof window.isSongSlideLive === 'function' && window.isSongSlideLive(song.id, sIdx, chunks.length > 1 ? cIdx : null));
          });

          const col = document.createElement('div');
          col.className = `bento-slot-col ${isColLive ? 'active-song' : ''}`;

          // Drag & Drop for Song Medley Slot
          col.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            col.classList.add('drag-hover');
          };
          col.ondragleave = () => {
            col.classList.remove('drag-hover');
          };
          col.ondrop = (e) => {
            e.preventDefault();
            col.classList.remove('drag-hover');
            const droppedSongId = (e.dataTransfer ? e.dataTransfer.getData('application/song-id') : null) ||
              (window.sfDraggedItem && window.sfDraggedItem.type === 'song' ? window.sfDraggedItem.id : null) ||
              (e.dataTransfer ? e.dataTransfer.getData('text/plain') : null);
            if (droppedSongId && typeof window.swapMedleySong === 'function') {
              window.swapMedleySong(idx, droppedSongId, false);
            }
          };

          let slidesHtml = '';
          if (song && song.stanzas) {
            const maxLines = state.maxLinesPerSlide || 4;
            song.stanzas.forEach((stanza, sIdx) => {
              const chunks = typeof window.splitStanzaIntoChunks === 'function' 
                ? window.splitStanzaIntoChunks(stanza, maxLines)
                : [{ ...stanza, chunkIndex: 0, totalChunks: 1, label: stanza.type }];

              chunks.forEach((chunk, cIdx) => {
                const slideId = (chunks.length > 1) ? `medley_${song.id}_${sIdx}_c${cIdx}` : `medley_${song.id}_${sIdx}`;
                const refStr = `${song.title} (${chunk.label})`;
                const isLive = typeof window.isSongSlideLive === 'function' && window.isSongSlideLive(song.id, sIdx, chunks.length > 1 ? cIdx : null);

                window._bentoSlideRegistry.set(slideId, { slideId, text: chunk.text, refStr });
                slidesHtml += `
                  <div id="bento_card_${slideId}" data-slide-id="${slideId}" class="bento-slide-card ${isLive ? 'live' : ''}" onclick="window.projectBentoSlide('${slideId}')" ondblclick="event.stopPropagation(); window.projectBentoSlide('${slideId}', true)">
                    <div class="tag">
                      <span>${escapeHtml(chunk.label || stanza.type || `VERSE ${sIdx + 1}`)}</span>
                      ${isLive ? '<span class="bento-live-badge"></span>' : ''}
                    </div>
                    <div class="ln">${escapeHtml(chunk.text).replace(/\n/g, '<br>')}</div>
                  </div>
                `;
              });
            });
          } else {
            slidesHtml = `
              <div class="bento-empty-unit compact" style="margin:0; padding:18px 10px;">
                <div class="empty-icon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
                <div class="empty-title">Slot S${idx + 1} empty</div>
                <div class="empty-desc">Drag a song here from library or click Change above.</div>
              </div>
            `;
          }

          col.innerHTML = `
            <div class="bento-slot-col-head">
              <span class="bento-slot-badge">S${idx + 1}</span>
              <span class="t">${song ? escapeHtml(song.title) : 'Empty Slot'}</span>
              <span class="change" onclick="event.stopPropagation(); window.openSongPicker(${idx}, event)">Change</span>
            </div>
            <div class="bento-slides">${slidesHtml}</div>
          `;
          container.appendChild(col);
        }
      }

    } else {
      // SINGLE MODE FULL-WIDTH BENTO GRID
      container.className = 'bento-single-deck';
      container.setAttribute('data-cols', state.bentoSingleCols !== undefined ? state.bentoSingleCols : 1);
      container.style.gridAutoRows = '';

      // Drag & Drop for Single Deck
      container.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        container.classList.add('drag-hover');
      };
      container.ondragleave = (e) => {
        if (!container.contains(e.relatedTarget)) container.classList.remove('drag-hover');
      };
      container.ondrop = (e) => {
        e.preventDefault();
        container.classList.remove('drag-hover');
        let songId = (e.dataTransfer ? e.dataTransfer.getData('application/song-id') : null) ||
          (window.sfDraggedItem && window.sfDraggedItem.type === 'song' ? window.sfDraggedItem.id : null);
        let book = (e.dataTransfer ? e.dataTransfer.getData('application/bible-book') : null) ||
          (window.sfDraggedItem && window.sfDraggedItem.type === 'bible' ? window.sfDraggedItem.id : null);

        if (!songId && !book && e.dataTransfer) {
          const plain = e.dataTransfer.getData('text/plain');
          if (plain) {
            if ((window.SONGS_DATABASE || []).some(s => s.id === plain)) {
              songId = plain;
            } else if ((window.BIBLE_BOOKS || []).includes(plain)) {
              book = plain;
            }
          }
        }

        if (songId) {
          window.state.activeSongId = songId;
          if (typeof window.applySongBoundTheme === 'function') window.applySongBoundTheme(songId);
          window.state.currentTab = 'songs';
          syncBentoTabsUI();
          if (typeof window.renderLibrary === 'function') window.renderLibrary();
          renderBentoDeck();
          if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();
        } else if (book) {
          window.state.activeBibleBook = book;
          window.state.currentTab = 'bible';
          syncBentoTabsUI();
          if (typeof window.renderLibrary === 'function') window.renderLibrary();
          renderBentoDeck();
          if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();
        }
      };

      if (isBibleDeck) {
        const book = state.activeBibleBook;
        const ch = state.activeBibleChapter || 1;
        const ver = state.bibleVersion || 'KJV';
        const books = typeof window.getBibleBooks === 'function' ? window.getBibleBooks(ver) : [];

        if (!book || books.length === 0) {
          if (titleEl) {
            titleEl.textContent = books.length === 0 ? 'No Bible Installed' : 'No Scripture Selected';
            titleEl.removeAttribute('title');
          }
          if (subEl) {
            subEl.textContent = books.length === 0
              ? 'Import a translation from toolbar'
              : `Select a book from the library · ${ver} Translation`;
            subEl.removeAttribute('title');
          }
          if (books.length === 0) {
            container.innerHTML = `
              <div class="bento-empty-unit hero">
                <div class="empty-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                </div>
                <div class="empty-title">No Bible translations installed</div>
                <div class="empty-desc">Import your Bible JSON files or download translations from Cloud Repository.</div>
                <div class="sf-empty-actions">
                  <button type="button" class="song-empty-primary" onclick="openImportModal(); switchImportSubTab('bibles');">Import Bible</button>
                </div>
              </div>
            `;
          } else {
            container.innerHTML = `
              <div class="bento-empty-unit hero">
                <div class="empty-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                </div>
                <div class="empty-title">No scripture selected</div>
                <div class="empty-desc">Choose a Bible book from the library on the left to display verses.</div>
              </div>
            `;
          }
        } else {
          const verses = typeof window.getBibleVerses === 'function' ? window.getBibleVerses(book, ch, ver) : [];
          const allChapters = typeof window.getBibleChapters === 'function' ? window.getBibleChapters(book, ver) : [];
          const chNum = parseInt(ch, 10) || 1;
          const hasPrev = chNum > 1;
          const hasNext = chNum < allChapters.length;
          const fullSub = `${verses.length} verses · ${ver} Translation`;

          if (titleEl) {
            const navStyle = (window.state && window.state.scriptureNavStyle) || localStorage.getItem('sf_scripture_nav_style') || 'option1';
            const curV = (window.state && window.state.activeBibleVerse) ? parseInt(window.state.activeBibleVerse, 10) || 1 : 1;
            let navHtml = '';

            if (navStyle === 'option1') {
              // Option 1: Flat Text Triggers (Genesis · Ch 12 ▾ : Vs 1 ▾)
              navHtml = `
                <div class="bento-scripture-flat-nav">
                  <span class="book-title">${escapeHtml(book)}</span>
                  <span class="dot-sep">·</span>
                  <button type="button" class="bento-text-trigger" onclick="event.stopPropagation(); window.toggleBentoChapterPopover(event)" title="Jump to Chapter">Ch ${chNum} ▾</button>
                  <span class="colon-sep">:</span>
                  <button type="button" class="bento-text-trigger" id="bento-active-verse-badge" onclick="event.stopPropagation(); window.toggleBentoVersePopover(event)" title="Jump to Verse">Vs ${curV} ▾</button>
                </div>
              `;
            } else if (navStyle === 'option2') {
              // Option 2: Flat Sibling Buttons (No Outer Container Card)
              navHtml = `
                <div class="bento-scripture-sibling-nav">
                  <span class="book-title">${escapeHtml(book)}</span>
                  <button type="button" class="bento-sibling-btn" onclick="event.stopPropagation(); window.toggleBentoChapterPopover(event)" title="Jump to Chapter">Ch ${chNum} ▾</button>
                  <button type="button" class="bento-sibling-btn" id="bento-active-verse-badge" onclick="event.stopPropagation(); window.toggleBentoVersePopover(event)" title="Jump to Verse">Vs ${curV} ▾</button>
                </div>
              `;
            } else {
              // Option 3: Unified Single Reference Button
              navHtml = `
                <button type="button" class="bento-unified-ref-btn" id="bento-active-verse-badge" onclick="event.stopPropagation(); window.toggleBentoChapterPopover(event)" title="Jump to Chapter / Verse">${escapeHtml(book)} ${chNum}:${curV} ▾</button>
              `;
            }

            titleEl.innerHTML = `
              <div class="bento-scripture-title-wrap">
                <button type="button" class="bento-chapter-step-btn" title="Previous Chapter (Shift+Left)" onclick="event.stopPropagation(); window.bentoPrevBibleChapter(event)" ${!hasPrev ? 'disabled' : ''}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                ${navHtml}
                <button type="button" class="bento-chapter-step-btn" title="Next Chapter (Shift+Right)" onclick="event.stopPropagation(); window.bentoNextBibleChapter(event)" ${!hasNext ? 'disabled' : ''}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            `;
            titleEl.removeAttribute('title');
          }
          if (subEl) {
            subEl.textContent = fullSub;
            subEl.removeAttribute('title');
          }

          if (verses.length === 0) {
            container.innerHTML = `
              <div class="bento-empty-unit hero">
                <div class="empty-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>
                <div class="empty-title">No verses found</div>
                <div class="empty-desc">No verses found for ${escapeHtml(book)} ${ch}. Switch translation or chapter.</div>
              </div>
            `;
          } else {
            verses.forEach(v => {
              const slideId = `bible_${book}_${ch}_${v.verse}`;
              const refStr = `${book} ${ch}:${v.verse} (${ver})`;
              const isLive = typeof window.isBibleSlideLive === 'function' && window.isBibleSlideLive(ver, book, ch, v.verse);

              const cleanText = (typeof window.stripStrongsTags === 'function')
                ? window.stripStrongsTags(v.text)
                : (v.text || '').replace(/<sup\b[^>]*>.*?<\/sup>/gi, '').replace(/<[HG]\d+>/gi, '').replace(/[ \t]+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
              let verseBodyHtml = escapeHtml(cleanText);
              if (window.state && window.state.strongsMode) {
                let taggedText = v.text;
                if (typeof BIBLE_DATABASE !== 'undefined' && BIBLE_DATABASE['KJV_STRONGS'] && BIBLE_DATABASE['KJV_STRONGS'][book] && BIBLE_DATABASE['KJV_STRONGS'][book][ch]) {
                  const tv = BIBLE_DATABASE['KJV_STRONGS'][book][ch].find(item => item.verse === v.verse);
                  if (tv && tv.text) taggedText = tv.text;
                }
                if (typeof window.formatStrongsVerseHtml === 'function') {
                  verseBodyHtml = window.formatStrongsVerseHtml(taggedText);
                }
              }

              const card = document.createElement('div');
              card.id = `bento_card_${slideId}`;
              card.setAttribute('data-slide-id', slideId);
              if (card.dataset) card.dataset.slideId = slideId;
              card.className = `bento-single-card ${isLive ? 'live' : ''}`;
              card.onclick = () => window.projectSlide(slideId, cleanText, refStr);
              card.ondblclick = () => window.projectSlide(slideId, cleanText, refStr, { takeLive: true });

              card.innerHTML = `
                ${isLive ? `
                  <svg class="bento-live-shape-svg" aria-hidden="true">
                    <path d="" />
                  </svg>
                ` : ''}
                <div class="head-tag-row">
                  <span class="tag-title">VERSE ${v.verse}</span>
                  ${isLive ? '<div class="live-pill">LIVE</div>' : ''}
                </div>
                <div class="card-body-text">${verseBodyHtml}</div>
                ${isLive ? `
                  <div class="bento-corner-dock live-dock" title="Click to disengage follow-suit (return to CUE, keep display live)">
                    <button type="button" class="play-circle-btn live-toggle-btn" onclick="event.stopPropagation(); window.disengageLiveToCue('${slideId}');" aria-label="Disengage follow-suit">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                    </button>
                  </div>
                ` : ''}
              `;
              container.appendChild(card);
              if (isLive) {
                setupLiveCardObserver(card);
              }
            });
          }
        }

      } else {
        const songs = window.SONGS_DATABASE || [];
        const song = songs.find(s => s.id === state.activeSongId);
        const stanzas = song ? (song.stanzas || []) : [];
        const songTitle = song ? song.title : (songs.length === 0 ? 'No Songs in Library' : 'No Song Selected');
        const songSub = song 
          ? `${song.author || 'Unknown Author'} · ${stanzas.length} verses` 
          : (songs.length === 0 ? 'Import song files via the top toolbar to start' : 'Select a song from the library to populate slides');

        if (titleEl) {
          titleEl.textContent = songTitle;
          titleEl.removeAttribute('title');
        }
        if (subEl) {
          subEl.textContent = songSub;
          subEl.removeAttribute('title');
        }

        if (!song || stanzas.length === 0) {
          if (state.isDeckEditingSong) state.isDeckEditingSong = null;
          if (songs.length === 0) {
            container.innerHTML = `
              <div class="bento-empty-unit hero song-workspace-empty">
                <div class="empty-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
                <div class="empty-title">No songs in library</div>
                <div class="empty-desc">Import song files (.txt, .xml, .json) or create a new song to start.</div>
                <div class="sf-empty-actions">
                  <button type="button" class="song-empty-primary" onclick="openImportModal(); switchImportSubTab('songs');">Import songs</button>
                  <button type="button" class="song-empty-secondary" onclick="openNewSongModal()">New song</button>
                </div>
              </div>
            `;
          } else {
            container.innerHTML = `
              <div class="bento-empty-unit hero song-workspace-empty">
                <div class="empty-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
                <div class="empty-title">No song selected</div>
                <div class="empty-desc">Select a song from the library on the left or press Ctrl+K to search.</div>
                <div class="sf-empty-actions">
                  <button type="button" class="song-empty-primary" onclick="openOmniSearchPalette('songs')">Search songs</button>
                  <button type="button" class="song-empty-secondary" onclick="openNewSongModal()">New song</button>
                </div>
                <button type="button" class="song-empty-link" onclick="switchBentoTab('bible')">Browse Bible</button>
              </div>
            `;
          }
        } else if (state.isDeckEditingSong && state.isDeckEditingSong === song.id) {
          if (titleEl) {
            titleEl.textContent = `Editing: ${song.title}`;
          }
          if (subEl) {
            subEl.textContent = song.author || 'Song editor';
          }
          container.className = 'bento-single-deck in-split-editor';
          renderBentoDeckSplitEditor(container, song);
        } else {
          const maxLines = state.maxLinesPerSlide || 0;
          stanzas.forEach((stanza, sIdx) => {
            const chunks = typeof window.splitStanzaIntoChunks === 'function' 
              ? window.splitStanzaIntoChunks(stanza, maxLines)
              : [{ ...stanza, chunkIndex: 0, totalChunks: 1, label: stanza.type }];

            chunks.forEach((chunk, cIdx) => {
              const slideId = (chunks.length > 1) ? `${song.id}_${sIdx}_c${cIdx}` : `${song.id}_${sIdx}`;
              const refStr = `${song.title} (${chunk.label})`;
              const isLive = typeof window.isSongSlideLive === 'function' && window.isSongSlideLive(song.id, sIdx, chunks.length > 1 ? cIdx : null);

              const card = document.createElement('div');
              card.id = `bento_card_${slideId}`;
              card.setAttribute('data-slide-id', slideId);
              if (card.dataset) card.dataset.slideId = slideId;
              card.className = `bento-single-card ${isLive ? 'live' : ''}`;
              card.onclick = (e) => {
                if (card.classList.contains('is-inline-editing')) return;
                if (e && e.target && e.target.closest('.card-body-text[contenteditable="true"], .bento-card-quick-edit-btn, .bento-inline-edit-status')) return;
                window.projectSlide(slideId, chunk.text, refStr);
              };
              card.ondblclick = (e) => {
                if (card.classList.contains('is-inline-editing')) return;
                window.projectSlide(slideId, chunk.text, refStr, { takeLive: true });
              };

              card.innerHTML = `
                ${isLive ? `
                  <svg class="bento-live-shape-svg" aria-hidden="true">
                    <path d="" />
                  </svg>
                ` : ''}
                <div class="head-tag-row">
                  <span class="tag-title">${escapeHtml(chunk.label || stanza.type || `VERSE ${sIdx + 1}`)}</span>
                  <div class="card-head-actions">
                    <button type="button" class="bento-card-quick-edit-btn" title="Edit lyrics in-place" onclick="event.preventDefault(); event.stopPropagation(); window.startInlineCardEdit('${slideId}', '${song.id}', ${sIdx}, ${chunks.length > 1 ? cIdx : -1})">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
                      <span>Edit</span>
                    </button>
                    ${isLive ? '<div class="live-pill">LIVE</div>' : ''}
                  </div>
                </div>
                <div class="card-body-text">${escapeHtml(chunk.text).replace(/\n/g, '<br>')}</div>
                ${isLive ? `
                  <div class="bento-corner-dock live-dock" title="Click to disengage follow-suit (return to CUE, keep display live)">
                    <button type="button" class="play-circle-btn live-toggle-btn" onclick="event.stopPropagation(); window.disengageLiveToCue('${slideId}');" aria-label="Disengage follow-suit">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                    </button>
                  </div>
                ` : ''}
              `;
              container.appendChild(card);
              if (isLive) {
                setupLiveCardObserver(card);
              }
            });
          });

          // Append Add New Song action card at the end of the song's slides
          const addSongCard = document.createElement('div');
          addSongCard.className = 'bento-single-card bento-add-song-card';
          addSongCard.setAttribute('role', 'button');
          addSongCard.setAttribute('title', 'Add or create a new song');
          addSongCard.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.openNewSongModal === 'function') {
              window.openNewSongModal();
            } else if (typeof window.openSongEditorModal === 'function') {
              window.openSongEditorModal('new');
            }
          };
          addSongCard.innerHTML = `
            <div class="bento-add-song-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div class="bento-add-song-title">Add New Song</div>
            <div class="bento-add-song-desc">Create or import song into library</div>
          `;
          container.appendChild(addSongCard);
        }
      }
    }
    if (typeof window.syncStagedCardVisuals === 'function') {
      window.syncStagedCardVisuals();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FLOW 1: SEAMLESS IN-PLACE LIVE EDITING & FLOW 3: SONG SHEET INTEGRATION
  // ─────────────────────────────────────────────────────────────────────────────
  let _activeInlineEditor = null;

  window.cancelActiveInlineCardEdit = function() {
    if (!_activeInlineEditor) return;
    const { card, bodyEl, originalHtml } = _activeInlineEditor;
    if (card && bodyEl) {
      bodyEl.innerHTML = originalHtml;
      bodyEl.contentEditable = 'false';
      bodyEl.removeAttribute('role');
      bodyEl.removeAttribute('aria-multiline');
      bodyEl.onkeydown = null;
      bodyEl.onblur = null;
      bodyEl.onclick = null;
      bodyEl.onmousedown = null;
      bodyEl.onpointerdown = null;
      card.classList.remove('is-inline-editing');

      const editBtn = card.querySelector('.bento-card-quick-edit-btn');
      if (editBtn) {
        editBtn.classList.remove('active');
        editBtn.innerHTML = `
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
          <span>Edit</span>
        `;
      }
      const editBadge = card.querySelector('.bento-card-editing-badge');
      if (editBadge) editBadge.remove();
      const statusBar = card.querySelector('.bento-inline-edit-status');
      if (statusBar) statusBar.remove();
    }
    _activeInlineEditor = null;
  };

  window.startInlineCardEdit = function(slideId, songId, stanzaIndex, chunkIndex = -1) {
    if (_activeInlineEditor && _activeInlineEditor.slideId === slideId) {
      if (typeof _activeInlineEditor.finishSave === 'function') {
        _activeInlineEditor.finishSave();
      }
      return;
    }
    window.cancelActiveInlineCardEdit();

    const card = document.getElementById('bento_card_' + slideId);
    if (!card) return;

    const bodyEl = card.querySelector('.card-body-text');
    if (!bodyEl) return;

    const song = (window.SONGS_DATABASE || []).find(s => s.id === songId);
    if (!song || !song.stanzas || !song.stanzas[stanzaIndex]) return;

    const stanza = song.stanzas[stanzaIndex];
    let initialText = stanza.text;

    const maxLines = (window.state && window.state.maxLinesPerSlide) ? window.state.maxLinesPerSlide : 0;
    if (chunkIndex >= 0 && maxLines > 0) {
      const rawLines = stanza.text.split('\n');
      const start = chunkIndex * maxLines;
      const end = Math.min(rawLines.length, start + maxLines);
      initialText = rawLines.slice(start, end).join('\n');
    }

    const originalHtml = bodyEl.innerHTML;
    let finishSaveRef = null;
    _activeInlineEditor = {
      card,
      bodyEl,
      originalHtml,
      initialText,
      slideId,
      songId,
      stanzaIndex,
      chunkIndex,
      isSaved: false,
      finishSave: () => { if (finishSaveRef) finishSaveRef(); }
    };

    card.classList.add('is-inline-editing');
    bodyEl.contentEditable = 'true';
    bodyEl.spellcheck = false;
    bodyEl.setAttribute('role', 'textbox');
    bodyEl.setAttribute('aria-multiline', 'true');

    // Prevent any clicks or pointer interactions inside the editable body from triggering slide projection
    bodyEl.onclick = (e) => { e.stopPropagation(); };
    bodyEl.onmousedown = (e) => { e.stopPropagation(); };
    bodyEl.onpointerdown = (e) => { e.stopPropagation(); };

    // Toggle edit button to "Done"
    const editBtn = card.querySelector('.bento-card-quick-edit-btn');
    if (editBtn) {
      editBtn.classList.add('active');
      editBtn.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        <span>Done</span>
      `;
    }

    // Set cursor to end of text
    bodyEl.focus();
    try {
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(bodyEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (err) {}

    const finishSave = () => {
      if (!_activeInlineEditor || _activeInlineEditor.isSaved) return;
      _activeInlineEditor.isSaved = true;

      let newText = (bodyEl.innerText !== undefined ? bodyEl.innerText : bodyEl.textContent) || '';
      newText = newText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

      if (!newText) {
        if (typeof window.showToast === 'function') window.showToast('Lyrics cannot be blank', 'warning');
        window.cancelActiveInlineCardEdit();
        return;
      }

      if (chunkIndex >= 0 && maxLines > 0) {
        const rawLines = stanza.text.split('\n');
        const start = chunkIndex * maxLines;
        const end = Math.min(rawLines.length, start + maxLines);
        const newLines = newText.split('\n');
        rawLines.splice(start, end - start, ...newLines);
        stanza.text = rawLines.join('\n');
      } else {
        stanza.text = newText;
      }

      if (window.libraryImporter && typeof window.libraryImporter.updateSong === 'function') {
        window.libraryImporter.updateSong(songId, { stanzas: song.stanzas });
      }

      card.classList.remove('is-inline-editing');
      bodyEl.contentEditable = 'false';
      bodyEl.removeAttribute('role');
      bodyEl.removeAttribute('aria-multiline');
      bodyEl.onkeydown = null;
      bodyEl.onblur = null;
      bodyEl.onclick = null;
      bodyEl.onmousedown = null;
      bodyEl.onpointerdown = null;

      if (editBtn) {
        editBtn.classList.remove('active');
        editBtn.innerHTML = `
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
          <span>Edit</span>
        `;
      }
      const editBadge = card.querySelector('.bento-card-editing-badge');
      if (editBadge) editBadge.remove();
      const statusBar = card.querySelector('.bento-inline-edit-status');
      if (statusBar) statusBar.remove();

      bodyEl.innerHTML = escapeHtml(newText).replace(/\n/g, '<br>');

      // Strictly update live projection ONLY IF THIS EXACT SLIDE is currently live!
      if (window.state && window.state.activeLiveSlideId === slideId) {
        window.state.activeLiveText = newText;
        if (typeof window.reprojectCurrentLive === 'function') {
          window.reprojectCurrentLive();
        } else if (typeof window.broadcastState === 'function') {
          window.broadcastState();
        }
        if (typeof window.syncBentoStagePreview === 'function') {
          window.syncBentoStagePreview();
        }
      }

      _activeInlineEditor = null;
      if (typeof window.showToast === 'function') {
        window.showToast('Slide lyrics saved', 'success');
      }
    };
    finishSaveRef = finishSave;

    bodyEl.onkeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        window.cancelActiveInlineCardEdit();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        bodyEl.blur();
      }
    };

    bodyEl.onblur = () => {
      setTimeout(() => {
        if (_activeInlineEditor && !_activeInlineEditor.isSaved) {
          finishSave();
        }
      }, 50);
    };
  };

  // Flow 3 Helper: Open Focused Song Sheet Modal
  window.openSongSheetModal = function(songId, stanzaIndex = 0) {
    window.cancelActiveInlineCardEdit();
    if (typeof window.openSongEditorModal === 'function') {
      window.openSongEditorModal(songId, stanzaIndex);
    } else if (typeof window.openSongEditor === 'function') {
      window.openSongEditor(songId, stanzaIndex);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // IN-DECK SPLIT SONG LYRICS EDITOR (Tactile, Real-time, 0ms latency)
  // ─────────────────────────────────────────────────────────────────────────────

  let splitSession = null;

  function activeSplitSession() {
    return splitSession && window.state?.isDeckEditingSong === splitSession.songId &&
      window.state.activeSongId === splitSession.songId && document.getElementById('bento-deck-split-editor') ? splitSession : null;
  }

  // Preserve section identity using source offsets outside the changed text span.
  // Labels are not identifiers: a song may contain several identical choruses.
  function reconcileSplitSections(session, text, stanzas, ranges) {
    const previous = session.sections;
    const oldText = session.text;
    let start = 0;
    while (start < oldText.length && start < text.length && oldText[start] === text[start]) start++;
    let oldEnd = oldText.length;
    let newEnd = text.length;
    while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === text[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
    const used = new Set();
    const sections = stanzas.map((stanza, index) => ({ ...stanza, range: ranges[index], slides: [] }));
    previous.forEach(section => {
      const expected = section.range.start >= oldEnd ? section.range.start + newEnd - oldEnd : section.range.start;
      const matches = sections.filter(item => !item.previous && item.type === section.type && item.text === section.text);
      matches.sort((a, b) => Math.abs(a.range.start - expected) - Math.abs(b.range.start - expected));
      if (matches[0]) {
        matches[0].previous = section;
        used.add(section);
      }
    });
    previous.forEach(section => {
      if (used.has(section)) return;
      const matches = sections.filter(item => !item.previous && item.type === section.type);
      const oldMatches = previous.filter(item => !used.has(item) && item.type === section.type);
      if (matches.length === 1 && oldMatches.length === 1) {
        matches[0].previous = section;
        used.add(section);
      }
    });
    previous.forEach(section => {
      if (used.has(section)) return;
      if (section.range.start >= start && section.range.end <= oldEnd && oldEnd > start) return;
      let position = section.range.start;
      if (position >= oldEnd) position += newEnd - oldEnd;
      else if (position > start) return;
      const index = ranges.findIndex(range => range.start === position);
      if (index >= 0 && !sections[index].previous) {
        sections[index].previous = section;
        used.add(section);
      }
    });
    const unmatchedOld = previous.filter(section => !used.has(section));
    const unmatchedNew = sections.filter(section => !section.previous);
    // A single edited heading/section retains its identity, but bulk replacements do not.
    if (unmatchedOld.length === 1 && unmatchedNew.length === 1) {
      unmatchedNew[0].previous = unmatchedOld[0];
    }
    return sections;
  }

  window.resolveBentoSplitSlide = function(slideId) {
    const session = activeSplitSession();
    if (!session) return null;
    const slide = session.slides.find(item => item.slideId === slideId);
    if (slide) return slide.text.trim() ? slide : false;
    return session.knownIds.has(slideId) ? false : null;
  };

  function splitNavigationTarget(dir, liveOnly = false) {
    const session = activeSplitSession();
    if (!session) return null;
    const prepared = liveOnly ? null : window.getPreparedSlide?.();
    const anchorId = prepared?.slideId || window.state.activeLiveSlideId;
    if (liveOnly && anchorId && !session.knownIds.has(anchorId)) return null;
    const index = session.slides.findIndex(slide => slide.slideId === anchorId);
    if (index >= 0) {
      for (let i = index + dir; i >= 0 && i < session.slides.length; i += dir) {
        if (session.slides[i].text.trim()) return session.slides[i];
      }
      return null;
    }
    const removed = session.removed.get(anchorId);
    if (removed) {
      const candidates = dir > 0 ? removed.after : removed.before;
      return candidates.map(id => session.slides.find(slide => slide.slideId === id)).find(slide => slide?.text.trim()) || null;
    }
    return session.slides.find(slide => slide.text.trim()) || null;
  }

  window.navigateBentoSplitDraft = function(dir, liveOnly = false) {
    if (!activeSplitSession()) return false;
    if (window.state?.isHoldLive) return true;
    const target = splitNavigationTarget(dir, liveOnly);
    if (target) {
      window.projectSlide(target.slideId, target.text, target.reference, liveOnly ? { takeLive: true } : {});
      if (!liveOnly && document.activeElement?.closest?.('#bento-split-cards-stream')) {
        splitSession.cards.get(target.slideId)?.focus({ preventScroll: true });
      }
    }
    return true;
  };

  window.setBentoSplitFollow = function(mode) {
    const session = activeSplitSession();
    if (!session || !['off', 'live', 'edit'].includes(mode)) return;
    session.follow = mode;
    document.getElementById('bento-split-follow').value = mode;
    if (mode === 'live') window.locateBentoSplitCard('live', 'start');
    if (mode === 'edit') syncBentoSplitEditorScroll();
  };

  window.locateBentoSplitCard = function(kind, alignment = 'nearest') {
    const stream = document.getElementById('bento-split-cards-stream');
    const session = activeSplitSession();
    if (!stream || !session) return;
    const card = kind === 'live'
      ? session.cards.get(window.state.activeLiveSlideId)
      : Array.from(session.cards.values()).find(item => item.classList.contains('editing-focused'));
    if (card) scrollStreamCardIntoView(stream, card, alignment, 'instant');
  };

  window.refreshBentoSplitLive = function(follow = false) {
    const session = activeSplitSession();
    if (!session) return;
    const state = window.state;
    const live = session.slides.find(slide => slide.slideId === state.activeLiveSlideId);
    const ref = document.getElementById('bento-split-live-ref');
    const text = document.getElementById('bento-split-live-text');
    if (ref) ref.textContent = state.activeLiveSlideId ? state.activeLiveRef || 'Live output' : 'Nothing live';
    if (text) text.textContent = state.activeLiveSlideId ? state.activeLiveText || '' : '';
    const update = document.getElementById('bento-split-update-live');
    const changed = !!live?.text.trim() && (live.text !== state.activeLiveText || live.reference !== state.activeLiveRef);
    if (update) {
      update.hidden = !changed;
      update.disabled = !!state.isHoldLive;
    }
    const status = document.getElementById('bento-split-live-status');
    if (status) status.textContent = state.isHoldLive ? 'Held' : live && !live.text.trim() ? 'Empty in draft' : changed ? 'Draft changed' : session.removed.has(state.activeLiveSlideId) ? 'Removed from draft' : '';
    const locate = document.getElementById('bento-split-locate-live');
    if (locate) locate.disabled = !live;
    for (const [id, dir] of [['bento-split-prev', -1], ['bento-split-next', 1]]) {
      const button = document.getElementById(id);
      if (button) button.disabled = !!state.isHoldLive || !splitNavigationTarget(dir, true);
    }
    if (follow && session.follow === 'live') {
      window.locateBentoSplitCard('live', session.followedLiveId === state.activeLiveSlideId ? 'nearest' : 'start');
      session.followedLiveId = state.activeLiveSlideId;
    }
    return true;
  };

  window.updateBentoSplitLive = function() {
    const slide = window.resolveBentoSplitSlide(window.state?.activeLiveSlideId);
    if (slide) window.projectSlide(slide.slideId, slide.text, slide.reference, { takeLive: true });
  };

  window.finishBentoSplitSession = function(saved) {
    const session = splitSession;
    if (!session) return;
    // Rebind UI identities without broadcasting or altering the audience's snapshot.
    const targetSlides = saved ? session.slides : session.originalSlides;
    const liveId = window.state?.activeLiveSlideId;
    if (session.knownIds.has(liveId)) {
      const target = targetSlides.find(slide => slide.slideId === liveId);
      window.state.activeLiveSlideId = target?.canonicalId || `${session.songId}_removed_${session.sequence++}`;
    }
    const prepared = window.getPreparedSlide?.();
    if (prepared && session.knownIds.has(prepared.slideId)) window.cancelPreparedSlide?.();
    splitSession = null;
  };

  function renderBentoDeckSplitEditor(container, song) {
    if (!container || !song) return;
    if (splitSession && splitSession.songId !== song.id) window.finishBentoSplitSession(false);
    const existing = splitSession;
    const formattedText = existing ? existing.text : (song.stanzas || []).map(s => `[${s.type}]\n${s.text}`).join('\n\n');
    splitSession = existing || {
      songId: song.id, text: '', sections: [], slides: [], originalSlides: [],
      cards: new Map(), knownIds: new Set(), removed: new Map(), sequence: 0,
      follow: window.state?.activeLiveSlideId?.startsWith(song.id + '_') ? 'live' : 'edit'
    };
    splitSession.cards.forEach(card => window.cleanupLiveCardObserver?.(card));
    splitSession.cards = new Map();

    container.innerHTML = `
      <div class="bento-deck-split-editor" id="bento-deck-split-editor">
        <!-- LEFT COLUMN: Lyrics & Metadata Editor -->
        <div class="bento-deck-editor-left">
          <div class="bento-split-editor-header">
            <div class="bento-split-field-group">
              <label for="bento-split-title">Song Title</label>
              <input type="text" id="bento-split-title" class="bento-split-input" value="${escapeHtml(existing?.title ?? song.title)}" placeholder="Song Title" autocomplete="off" />
            </div>
            <div class="bento-split-field-group">
              <label for="bento-split-author">Author / Artist</label>
              <input type="text" id="bento-split-author" class="bento-split-input" value="${escapeHtml(existing?.author ?? song.author ?? '')}" placeholder="Author / Artist" autocomplete="off" />
            </div>
          </div>

          <div class="bento-split-tags-bar">
            <span class="bento-split-tag-label">Insert:</span>
            <button type="button" class="bento-split-tag-btn" onclick="insertBentoSplitTag('Verse')">+ Verse</button>
            <button type="button" class="bento-split-tag-btn" onclick="insertBentoSplitTag('Chorus')">+ Chorus</button>
            <button type="button" class="bento-split-tag-btn" onclick="insertBentoSplitTag('Bridge')">+ Bridge</button>
            <div style="flex:1;"></div>
            <button type="button" class="bento-split-format-btn" onclick="autoFormatBentoSplitEditor()" title="Clean and balance line breaks">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h14"/></svg>
              <span>Auto Format</span>
            </button>
          </div>

          <div class="bento-split-textarea-wrap">
            <textarea id="bento-split-lyrics" class="bento-split-textarea" placeholder="Type or paste lyrics here with tags like [Verse 1], [Chorus]...">${escapeHtml(formattedText)}</textarea>
          </div>

          <div class="bento-split-footer">
            <div class="bento-split-slide-count" id="bento-split-slide-count">${(song.stanzas || []).length} slides</div>
            <div class="bento-split-actions">
              <button type="button" class="bento-split-btn-secondary" onclick="closeDeckSplitEditor(false)">Discard</button>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN: Interactive Slide Cards Stream -->
        <div class="bento-deck-editor-right">
          <div class="bento-split-preview-header">
            <div class="bento-split-preview-title">
              <span>Slides</span>
            </div>
            <label class="bento-split-follow-label">Follow
              <select id="bento-split-follow" onchange="setBentoSplitFollow(this.value)" aria-label="Scroll follow mode">
                <option value="off">Off</option><option value="live">Live</option><option value="edit">Edit</option>
              </select>
            </label>
            <button type="button" class="bento-split-icon-btn" onclick="locateBentoSplitCard('edit')" title="Show edited section" aria-label="Show edited section">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H5v14h14v-4M16 3l5 5-9 9H7v-5z"/></svg>
            </button>
          </div>
          <div class="bento-split-live-strip" aria-label="Current live output">
            <div class="bento-split-live-heading"><span class="bento-split-on-air">LIVE</span><strong id="bento-split-live-ref"></strong></div>
            <div id="bento-split-live-text" class="bento-split-live-text"></div>
            <div class="bento-split-live-actions">
              <button type="button" id="bento-split-locate-live" class="bento-split-icon-btn" onclick="locateBentoSplitCard('live')" title="Locate live slide" aria-label="Locate live slide"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg></button>
              <button type="button" id="bento-split-prev" class="bento-split-icon-btn" onclick="navigateBentoSplitDraft(-1, true)" title="Previous live slide" aria-label="Previous live slide"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>
              <button type="button" id="bento-split-next" class="bento-split-icon-btn" onclick="navigateBentoSplitDraft(1, true)" title="Next live slide" aria-label="Next live slide"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></button>
            </div>
            <div class="bento-split-live-status-row">
              <span id="bento-split-live-status" role="status"></span>
              <button type="button" id="bento-split-update-live" class="bento-split-btn-secondary" onclick="updateBentoSplitLive()" hidden>Update live</button>
            </div>
          </div>
          <div class="bento-split-cards-stream" id="bento-split-cards-stream" tabindex="0" role="region" aria-label="Song slides"></div>
          <details class="bento-split-keyboard-settings">
          <summary>Keyboard</summary>
          <label class="bento-split-shortcut-label">Live keys
            <select id="bento-split-live-keys" aria-label="Live navigation shortcut">
              <option value="function">F8 / F9</option><option value="modified">Ctrl+Alt+PageUp / PageDown</option><option value="off">Off</option>
            </select>
          </label>
          </details>
        </div>
      </div>
    `;

    const lyricsInput = document.getElementById('bento-split-lyrics');
    const titleInput = document.getElementById('bento-split-title');
    const authorInput = document.getElementById('bento-split-author');
    const splitWrap = document.getElementById('bento-deck-split-editor');
    const stream = document.getElementById('bento-split-cards-stream');
    const followSelect = document.getElementById('bento-split-follow');
    if (followSelect) followSelect.value = splitSession.follow;
    const keys = document.getElementById('bento-split-live-keys');
    if (keys) {
      try { keys.value = localStorage.getItem('sf_split_live_keys') || 'function'; } catch {}
      keys.addEventListener('change', () => {
        try { localStorage.setItem('sf_split_live_keys', keys.value); } catch {}
      });
    }
    if (stream) {
      stream.addEventListener('wheel', () => window.setBentoSplitFollow('off'), { passive: true });
      stream.addEventListener('touchmove', () => window.setBentoSplitFollow('off'), { passive: true });
      stream.addEventListener('pointerdown', e => {
        if (e.target === stream) {
          window.setBentoSplitFollow('off');
          stream.focus({ preventScroll: true });
        }
      });
      stream.addEventListener('keydown', e => {
        if (['Home', 'End'].includes(e.key)) window.setBentoSplitFollow('off');
      });
    }

    if (lyricsInput) {
      lyricsInput.addEventListener('input', () => updateBentoSplitEditorPreview());
      lyricsInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
          e.preventDefault();
          saveBentoDeckSplitEditor();
        }
      });
      const handleCursorSync = () => {
        syncSplitActiveCardHighlight();
      };
      lyricsInput.addEventListener('keyup', handleCursorSync);
      lyricsInput.addEventListener('click', handleCursorSync);
      lyricsInput.addEventListener('select', handleCursorSync);
      lyricsInput.addEventListener('scroll', syncBentoSplitEditorScroll, { passive: true });
    }
    if (titleInput) {
      titleInput.addEventListener('input', () => updateBentoSplitEditorPreview());
    }
    if (authorInput) {
      authorInput.addEventListener('input', () => updateBentoSplitEditorPreview());
    }
    if (splitWrap) {
      splitWrap.querySelector('.bento-split-live-actions')?.addEventListener('pointerdown', e => {
        if (e.target.closest('button')) e.preventDefault();
      });
      splitWrap.addEventListener('keydown', (e) => {
        if (e.isComposing || e.defaultPrevented || window.sfActiveModal?.()) return;
        const functionKey = keys?.value === 'function' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && ['F8', 'F9'].includes(e.key);
        const modifiedKey = keys?.value === 'modified' && e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey && ['PageUp', 'PageDown'].includes(e.key);
        if (functionKey || modifiedKey) {
          e.preventDefault();
          e.stopPropagation();
          if (!e.repeat) window.navigateBentoSplitDraft(['F8', 'PageUp'].includes(e.key) ? -1 : 1, true);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          // Leaving typing focus must never discard an unfinished draft or clear output.
          stream?.focus({ preventScroll: true });
        }
      });
    }

    updateBentoSplitEditorPreview({ initialMount: true });
  }

  function getBentoSplitStanzaRanges(fullText, stanzas) {
    const ranges = [];
    if (!fullText || !stanzas || !stanzas.length) return ranges;
    let searchPos = 0;

    for (let i = 0; i < stanzas.length; i++) {
      const stanza = stanzas[i];
      let start = -1;

      if (stanza.type) {
        const escapedType = stanza.type.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const tagMatch = fullText.substring(searchPos).match(new RegExp('\\[' + escapedType + '\\]', 'i'));
        if (tagMatch) {
          start = searchPos + tagMatch.index;
        }
      }

      if (start === -1) {
        const anyTagMatch = fullText.substring(searchPos).match(/\[[^\]]+\]/);
        if (anyTagMatch) {
          start = searchPos + anyTagMatch.index;
        }
      }

      if (start === -1) {
        const firstLine = (stanza.text || '').split('\n')[0].trim();
        if (firstLine) {
          const idx = fullText.indexOf(firstLine, searchPos);
          if (idx !== -1) start = idx;
        }
      }

      if (start === -1) start = searchPos;
      if (ranges.length > 0) {
        ranges[ranges.length - 1].end = start;
      }
      ranges.push({ index: i, start, end: fullText.length });
      searchPos = start + (stanza.text ? Math.max(1, stanza.text.length) : 1);
    }
    return ranges;
  }

  function getBentoActiveStanzaIndex(cursorPos, ranges) {
    if (!ranges || !ranges.length) return 0;
    for (let i = 0; i < ranges.length; i++) {
      if (cursorPos >= ranges[i].start && cursorPos < ranges[i].end) {
        return ranges[i].index;
      }
    }
    return ranges.length - 1;
  }

  function syncBentoLyricsScrollToStanza(sIdx, stanzaRanges) {
    const textarea = document.getElementById('bento-split-lyrics');
    if (!textarea || !stanzaRanges || !stanzaRanges[sIdx]) return;
    const range = stanzaRanges[sIdx];
    const text = textarea.value || '';
    const linesBefore = text.substring(0, range.start).split('\n').length;
    const approxLineHeight = 19.5;
    const clientH = (typeof textarea.clientHeight === 'number' && textarea.clientHeight > 0) ? textarea.clientHeight : 300;
    const targetScrollTop = Math.max(0, Math.round(((linesBefore - 1) * approxLineHeight) - (clientH / 3)));
    if (typeof textarea.scrollTo === 'function') {
      textarea.scrollTo({ top: targetScrollTop, behavior: 'instant' });
    } else {
      textarea.scrollTop = targetScrollTop;
    }
    if (typeof textarea.setSelectionRange === 'function') {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(range.start, range.start);
    }
  }

  function splitCardScrollTop(stream, card) {
    const streamRect = stream.getBoundingClientRect();
    return card.getBoundingClientRect().top - streamRect.top - (stream.clientTop || 0) + stream.scrollTop;
  }

  function syncBentoSplitEditorScroll() {
    if (activeSplitSession()?.follow !== 'edit') return;
    const editor = document.getElementById('bento-split-lyrics');
    if (editor) window.syncSongPreviewScroll?.(editor, 'bento-split-cards-stream');
  }

  function scrollStreamCardIntoView(streamEl, targetCard, alignment = 'nearest', behavior = 'smooth') {
    if (!streamEl || !targetCard) return;
    targetCard._scrolledIntoView = true;
    const cardTop = splitCardScrollTop(streamEl, targetCard);
    const cardHeight = targetCard.offsetHeight || 70;
    const streamHeight = streamEl.clientHeight || 300;
    const currentScroll = streamEl.scrollTop || 0;

    if (alignment === 'start') {
      streamEl.scrollTop = Math.max(0, cardTop - 8);
      return;
    }

    if (alignment === 'center') {
      const centerTarget = cardTop - (streamHeight / 2) + (cardHeight / 2);
      const finalTop = Math.max(0, Math.round(centerTarget));
      if (behavior === 'instant') {
        streamEl.scrollTop = finalTop;
      } else if (typeof streamEl.scrollTo === 'function') {
        streamEl.scrollTo({ top: finalTop, behavior: 'smooth' });
      } else {
        streamEl.scrollTop = finalTop;
      }
    } else {
      // nearest
      if (cardTop <= currentScroll && cardTop + cardHeight >= currentScroll + streamHeight) return;
      if (cardTop < currentScroll) {
        if (behavior === 'instant') {
          streamEl.scrollTop = cardTop;
        } else if (typeof streamEl.scrollTo === 'function') {
          streamEl.scrollTo({ top: cardTop, behavior: 'smooth' });
        } else {
          streamEl.scrollTop = cardTop;
        }
      } else if (cardTop + cardHeight > currentScroll + streamHeight) {
        const targetScroll = cardTop + cardHeight - streamHeight;
        if (behavior === 'instant') {
          streamEl.scrollTop = targetScroll;
        } else if (typeof streamEl.scrollTo === 'function') {
          streamEl.scrollTo({ top: targetScroll, behavior: 'smooth' });
        } else {
          streamEl.scrollTop = targetScroll;
        }
      }
    }
  }

  function syncSplitActiveCardHighlight() {
    const lyricsInput = document.getElementById('bento-split-lyrics');
    const streamEl = document.getElementById('bento-split-cards-stream');
    if (!lyricsInput || !streamEl) return;

    const text = lyricsInput.value || '';
    const cursorPos = (typeof lyricsInput.selectionStart === 'number') ? lyricsInput.selectionStart : 0;
    const session = activeSplitSession();
    const ranges = session?.sections.map(section => section.range) || [];
    const activeIdx = getBentoActiveStanzaIndex(cursorPos, ranges);

    const cards = streamEl.querySelectorAll ? streamEl.querySelectorAll('.bento-single-card') : (streamEl.children || []);
    let targetCard = null;
    Array.from(cards).forEach(card => {
      const cardStanzaIdx = card.dataset ? card.dataset.stanzaIndex : card.getAttribute('data-stanza-index');
      const isMatch = (cardStanzaIdx === String(activeIdx));
      if (isMatch) {
        if (card.classList && typeof card.classList.add === 'function') {
          card.classList.add('editing-focused');
        }
        if (!targetCard) targetCard = card;
      } else {
        if (card.classList && typeof card.classList.remove === 'function') {
          card.classList.remove('editing-focused');
        }
      }
    });

    if (targetCard && session?.follow === 'edit') {
      const streamRect = (typeof streamEl.getBoundingClientRect === 'function') ? streamEl.getBoundingClientRect() : null;
      const cardRect = (typeof targetCard.getBoundingClientRect === 'function') ? targetCard.getBoundingClientRect() : null;
      const isOutOfView = streamRect && cardRect ? (cardRect.top < streamRect.top || cardRect.bottom > streamRect.bottom) : true;
      if (isOutOfView) {
        scrollStreamCardIntoView(streamEl, targetCard, 'nearest', 'instant');
      }
    }
  }

  function createSplitDraftCard() {
    const card = document.createElement('div');
    card.className = 'bento-single-card';
    card.tabIndex = -1;
    const head = document.createElement('div');
    head.className = 'head-tag-row';
    const tag = document.createElement('span');
    tag.className = 'tag-title';
    const number = document.createElement('span');
    number.className = 'bento-split-slide-number';
    const actions = document.createElement('div');
    actions.className = 'card-head-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'bento-split-icon-btn';
    edit.title = 'Locate in editor';
    edit.setAttribute('aria-label', 'Locate in editor');
    edit.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H5v14h14v-4M16 3l5 5-9 9H7v-5z"/></svg>';
    edit.onclick = e => {
      e.stopPropagation();
      const session = activeSplitSession();
      if (session) syncBentoLyricsScrollToStanza(card._slide.stanzaIndex, session.sections.map(section => section.range));
    };
    actions.appendChild(edit);
    head.append(number, tag, actions);
    const body = document.createElement('div');
    body.className = 'card-body-text';
    card.append(head, body);
    card._tag = tag;
    card._number = number;
    card._body = body;
    card.onclick = e => {
      if (e?.target?.closest?.('button')) return;
      card.focus({ preventScroll: true });
      const slide = card._slide;
      window.projectSlide?.(slide.slideId, slide.text, slide.reference);
    };
    card.ondblclick = e => {
      if (e?.target?.closest?.('button')) return;
      const slide = card._slide;
      window.projectSlide?.(slide.slideId, slide.text, slide.reference, { takeLive: true });
    };
    return card;
  }

  function updateBentoSplitEditorPreview(options = {}) {
    const session = activeSplitSession();
    const stream = document.getElementById('bento-split-cards-stream');
    const lyrics = document.getElementById('bento-split-lyrics');
    if (!session || !stream || !lyrics) return;
    const title = document.getElementById('bento-split-title')?.value.trim() || 'Untitled Song';
    const author = document.getElementById('bento-split-author')?.value.trim() || '';
    const text = lyrics.value || '';
    const parsed = text.trim()
      ? window.libraryImporter.parseSongText(text, title, author)
      : { stanzas: [] };
    const stanzas = [...(parsed.stanzas || [])];
    const trailingTag = text.match(/\[([a-zA-Z0-9\s]+)\]\s*$/);
    if (trailingTag && (!stanzas.length || stanzas[stanzas.length - 1].type.toLowerCase() !== trailingTag[1].trim().toLowerCase())) {
      stanzas.push({ type: trailingTag[1].trim(), text: '' });
    }
    const ranges = getBentoSplitStanzaRanges(text, stanzas);
    const sections = reconcileSplitSections(session, text, stanzas, ranges);
    const initial = !session.initialized;
    const oldSlides = session.slides;
    const slides = [];
    sections.forEach((section, stanzaIndex) => {
      const chunks = typeof window.splitStanzaIntoChunks === 'function'
        ? window.splitStanzaIntoChunks(section, window.state.maxLinesPerSlide || 0)
        : [{ text: section.text, label: section.type }];
      const previous = section.previous?.slides || [];
      const used = new Set();
      // Match unchanged chunks first, then retain the identity of the edited chunk.
      const matches = chunks.map(chunk => {
        const match = previous.find(slide => !used.has(slide) && slide.text === chunk.text);
        if (match) used.add(match);
        return match;
      });
      chunks.forEach((chunk, chunkIndex) => {
        const old = matches[chunkIndex] || previous.find(slide => !used.has(slide));
        if (old) used.add(old);
        const canonicalId = chunks.length > 1 ? session.songId + '_' + stanzaIndex + '_c' + chunkIndex : session.songId + '_' + stanzaIndex;
        const slideId = old?.slideId || (initial ? canonicalId : session.songId + '_draft_' + session.sequence++);
        const slide = { slideId, canonicalId, text: chunk.text, label: chunk.label || section.type, stanzaIndex, chunkIndex,
          reference: title + ' (' + (chunk.label || section.type) + ')' };
        section.slides.push(slide);
        slides.push(slide);
        session.knownIds.add(slideId);
      });
      delete section.previous;
    });
    const ids = new Set(slides.map(slide => slide.slideId));
    oldSlides.forEach((slide, index) => {
      if (!ids.has(slide.slideId)) {
        session.removed.set(slide.slideId, {
          before: oldSlides.slice(0, index).map(item => item.slideId).reverse(),
          after: oldSlides.slice(index + 1).map(item => item.slideId)
        });
      }
    });
    // Keep a removed live/cue anchor navigable across subsequent edits.
    session.removed.forEach(anchor => {
      const expand = (list, direction, visited = new Set()) => list.flatMap(id => {
        if (visited.has(id)) return [];
        visited.add(id);
        return ids.has(id) ? [id] : expand(session.removed.get(id)?.[direction] || [], direction, visited);
      });
      anchor.before = expand(anchor.before, 'before');
      anchor.after = expand(anchor.after, 'after');
    });
    session.sections = sections;
    session.slides = slides;
    session.text = text;
    session.title = title;
    session.author = author;
    session.initialized = true;
    if (initial) session.originalSlides = slides.map(slide => ({ ...slide }));

    const scrollTop = stream.scrollTop;
    const oldAnchor = Array.from(stream.children).find(card => splitCardScrollTop(stream, card) + card.offsetHeight > scrollTop);
    const anchorOffset = oldAnchor ? splitCardScrollTop(stream, oldAnchor) - scrollTop : 0;
    session.cards.forEach((card, id) => {
      if (!ids.has(id)) {
        if (card.contains?.(document.activeElement)) stream.focus({ preventScroll: true });
        window.cleanupLiveCardObserver?.(card);
        card.remove();
        session.cards.delete(id);
      }
    });
    if (slides.length) stream.querySelector('.bento-split-empty-stream')?.remove();
    const editingIndex = getBentoActiveStanzaIndex(lyrics.selectionStart || 0, ranges);
    slides.forEach((slide, index) => {
      let card = session.cards.get(slide.slideId);
      if (!card) {
        card = createSplitDraftCard();
        session.cards.set(slide.slideId, card);
        card.id = 'bento_card_' + slide.slideId;
        card.setAttribute('data-slide-id', slide.slideId);
      }
      card._slide = slide;
      card.setAttribute('data-stanza-index', String(slide.stanzaIndex));
      card.setAttribute('data-chunk-index', String(slide.chunkIndex));
      if (card._body.textContent !== slide.text) card._body.textContent = slide.text;
      if (card._tag.textContent !== slide.label) card._tag.textContent = slide.label;
      card._number.textContent = String(index + 1).padStart(2, '0') + ' / ' + slides.length;
      card.classList.toggle('editing-focused', slide.stanzaIndex === editingIndex);
      card.classList.toggle('bento-card-added-glow', !!options.highlightNewTag && slide.label.toLowerCase().includes(options.highlightNewTag.toLowerCase()));
      if (stream.children[index] !== card) stream.insertBefore(card, stream.children[index] || null);
    });
    if (!slides.length && !stream.querySelector('.bento-split-empty-stream')) {
      const empty = document.createElement('div');
      empty.className = 'bento-split-empty-stream';
      empty.textContent = 'No slides';
      stream.appendChild(empty);
    }
    if (oldAnchor && session.cards.has(oldAnchor.dataset.slideId)) {
      stream.scrollTop = Math.max(0, splitCardScrollTop(stream, oldAnchor) - anchorOffset);
    } else {
      stream.scrollTop = scrollTop;
    }
    const count = document.getElementById('bento-split-slide-count');
    if (count) count.textContent = slides.length + (slides.length === 1 ? ' slide' : ' slides');

    const prepared = window.getPreparedSlide?.();
    if (prepared && session.knownIds.has(prepared.slideId)) {
      const draft = slides.find(slide => slide.slideId === prepared.slideId);
      if (!draft) window.cancelPreparedSlide?.();
      else {
        prepared.text = draft.text;
        prepared.reference = draft.reference;
        const preparedText = document.getElementById('prepared-text');
        const preparedRef = document.getElementById('prepared-reference');
        if (preparedText) preparedText.textContent = draft.text;
        if (preparedRef) preparedRef.textContent = draft.reference;
      }
    }
    if (options.initialMount) {
      if (ids.has(window.state.activeLiveSlideId)) window.updateActiveSlideVisuals?.(window.state.activeLiveSlideId);
      window.syncStagedCardVisuals?.();
      if (session.follow === 'live') window.locateBentoSplitCard('live');
    }
    if (session.follow === 'edit') window.locateBentoSplitCard('edit');
    window.refreshBentoSplitLive(session.follow === 'live');
  }

  function insertBentoSplitTag(tagName) {
    const textarea = document.getElementById('bento-split-lyrics');
    if (!textarea) return;
    const start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : (textarea.value || '').length;
    const end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : start;
    const text = textarea.value || '';

    const before = text.substring(0, start);
    const after = text.substring(end);

    let prefix = '';
    if (before.length > 0) {
      if (before.endsWith('\n\n')) {
        prefix = '';
      } else if (before.endsWith('\n')) {
        prefix = '\n';
      } else {
        prefix = '\n\n';
      }
    }

    const tagStr = `${prefix}[${tagName}]\n`;
    textarea.value = before + tagStr + after;

    const newPos = start + tagStr.length;
    if (typeof textarea.focus === 'function') textarea.focus({ preventScroll: true });
    if (typeof textarea.setSelectionRange === 'function') {
      textarea.setSelectionRange(newPos, newPos);
    }

    const linesBefore = (before + tagStr).split('\n').length;
    const approxLineHeight = 19.5;
    const targetScrollTop = Math.max(0, ((linesBefore - 1) * approxLineHeight) - ((textarea.clientHeight || 300) / 2));
    if (typeof textarea.scrollTo === 'function') {
      textarea.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    } else {
      textarea.scrollTop = targetScrollTop;
    }

    updateBentoSplitEditorPreview({ highlightNewTag: tagName });
  }

  function autoFormatBentoSplitEditor() {
    const textarea = document.getElementById('bento-split-lyrics');
    if (!textarea) return;
    if (!textarea.value.trim()) {
      if (typeof window.showToast === 'function') window.showToast('Type or paste some lyrics first.', 'warning');
      textarea.focus({ preventScroll: true });
      return;
    }
    const formatter = window.formatSongEditorLyrics;
    if (typeof formatter === 'function') {
      textarea.value = formatter(textarea.value);
      updateBentoSplitEditorPreview();
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(0, 0);
      textarea.scrollTop = 0;
    }
  }

  function saveBentoDeckSplitEditor() {
    if (activeSplitSession()?.saving) return;
    const songId = (window.state && window.state.isDeckEditingSong);
    if (!songId) return;
    const titleInput = document.getElementById('bento-split-title');
    const authorInput = document.getElementById('bento-split-author');
    const lyricsInput = document.getElementById('bento-split-lyrics');

    const title = (titleInput && titleInput.value.trim()) || '';
    const author = (authorInput && authorInput.value.trim()) || '';
    const text = (lyricsInput && lyricsInput.value.trim()) || '';

    if (!title) {
      if (typeof window.showToast === 'function') window.showToast('Please enter a song title.', 'warning');
      if (titleInput) titleInput.focus({ preventScroll: true });
      return;
    }
    if (!text) {
      if (typeof window.showToast === 'function') window.showToast('Please enter song lyrics.', 'warning');
      if (lyricsInput) lyricsInput.focus({ preventScroll: true });
      return;
    }

    updateBentoSplitEditorPreview();
    const importer = window.libraryImporter || {};
    const parsed = typeof importer.parseSongText === 'function'
      ? importer.parseSongText(text, title, author)
      : { title, author, stanzas: [{ type: 'Verse 1', text }] };

    let success = false;
    try {
      success = typeof importer.updateSong === 'function' && importer.updateSong(songId, {
          title: parsed.title,
          author: parsed.author,
          stanzas: parsed.stanzas
        }, { notify: false, durableFallback: true });
    } catch (error) {
      console.error('Could not save split-editor song', error);
    }
    const finishSave = success => {
    if (!success) {
      window.showToast?.('Could not save this song. Your edits are still open; please try again.', 'error');
      return;
    }

    if (success) {
      window.finishBentoSplitSession(true);
      if (window.state) window.state.isDeckEditingSong = null;
      const deckCard = document.getElementById('bento-deck-card');
      if (deckCard) {
        deckCard.classList.remove('in-split-editor');
        deckCard.scrollTop = 0;
      }
      if (typeof window.renderDeck === 'function') window.renderDeck();
      setTimeout(() => {
        window.renderLibrary?.();
        window.renderAgenda?.();
        window.syncRemoteCatalog?.();
      }, 0);
      if (typeof window.showToast === 'function') {
        window.showToast(`Saved "${parsed.title}" successfully`, 'success');
      }
    }
    };
    if (success && typeof success.then === 'function') {
      const session = activeSplitSession();
      if (session) session.saving = true;
      const editor = document.querySelector('.bento-deck-editor-left');
      if (editor) editor.inert = true;
      const button = document.getElementById('bento-edit-btn');
      button?.setAttribute('aria-busy', 'true');
      return success.then(finishSave, error => {
        console.error('Could not save split-editor song', error);
        window.showToast?.('Song storage is unavailable. Your edits are still open.', 'error');
      }).finally(() => {
        if (session) session.saving = false;
        if (editor) editor.inert = false;
        button?.removeAttribute('aria-busy');
      });
    }
    return finishSave(success);
  }

  window.renderBentoDeckSplitEditor = renderBentoDeckSplitEditor;
  window.updateBentoSplitEditorPreview = updateBentoSplitEditorPreview;
  window.insertBentoSplitTag = insertBentoSplitTag;
  window.autoFormatBentoSplitEditor = autoFormatBentoSplitEditor;
  window.saveBentoDeckSplitEditor = saveBentoDeckSplitEditor;
  window.syncSplitActiveCardHighlight = syncSplitActiveCardHighlight;
  window.getBentoSplitStanzaRanges = getBentoSplitStanzaRanges;
  window.getBentoActiveStanzaIndex = getBentoActiveStanzaIndex;

  // ─────────────────────────────────────────────────────────────────────────────
  const stagePreviewTransitions = new WeakMap();

  // Snapshot only the outgoing preview layer; library/deck nodes stay untouched.
  function prepareStagePreviewTransition(element, key, mode, state) {
    if (!element) return () => {};
    const previous = stagePreviewTransitions.get(element);
    if (previous && previous.key === key && previous.mode === mode) return () => {};
    previous?.cancel();
    const animations = [];
    let outgoing;
    const record = { key, mode, cancel() {
      animations.forEach(animation => animation.cancel());
      outgoing?.remove();
    } };
    stagePreviewTransitions.set(element, record);
    const type = String(state.transitionType || 'fade').toLowerCase().replace(/[\s_]+/g, '-');
    const duration = Number.parseInt(state.transitionDuration ?? 300, 10);
    if (!previous?.key || !key || previous.mode !== mode || type === 'cut' || !(duration > 0) || !element.animate) {
      return () => {};
    }
    outgoing = element.cloneNode(true);
    outgoing.removeAttribute('id');
    outgoing.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    outgoing.setAttribute('aria-hidden', 'true');
    outgoing.style.pointerEvents = 'none';
    element.parentNode.insertBefore(outgoing, element);
    return () => {
      // Output moves 120/80 pixels on a 1920x1080 canvas; scale to this monitor.
      const monitor = element.closest('.dual-monitor') || element.parentElement;
      const scale = monitor.clientWidth / 1920;
      const x = 120 * scale;
      const y = 80 * scale;
      const transforms = {
        'zoom': ['scale(0.85)', 'scale(1.15)'],
        'zoom-in': ['scale(0.85)', 'scale(1.15)'],
        'zoom-out': ['scale(1.15)', 'scale(0.85)'],
        'slide-left': [`translateX(${x}px)`, `translateX(${-x}px)`],
        'slide-right': [`translateX(${-x}px)`, `translateX(${x}px)`],
        'slide-up': [`translateY(${y}px)`, `translateY(${-y}px)`],
        'slide-down': [`translateY(${-y}px)`, `translateY(${y}px)`]
      };
      const [entry, exit] = transforms[type] || ['', ''];
      const frames = (node, movement, entering) => {
        const computed = getComputedStyle(node).transform;
        const base = computed === 'none' ? '' : computed;
        const resting = { opacity: 1, transform: base || 'none' };
        const moved = { opacity: 0, transform: `${base} ${movement}`.trim() || 'none' };
        return entering ? [moved, resting] : [resting, moved];
      };
      const options = { duration: Math.max(50, duration), easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' };
      animations.push(outgoing.animate(frames(outgoing, exit, false), options));
      animations.push(element.animate(frames(element, entry, true), options));
      animations[1].onfinish = () => record.cancel();
    };
  }

  function syncBentoStagePreview() {
    const status = document.getElementById('bento-live-status');
    const holdBtn = document.getElementById('bento-hold-btn');
    const transBtn = document.getElementById('bento-trans-btn');
    const scaleLabel = document.getElementById('bento-textscale-label');
    const modeFull = document.getElementById('bento-prev-mode-full');
    const modeLt = document.getElementById('bento-prev-mode-lt');

    const state = window.state || {};
    const liveText = (state.activeLiveText || '').trim();
    const liveRef = (state.activeLiveRef || '').trim();
    const slideId = state.activeLiveSlideId || '';
    const previewKey = liveText || liveRef ? JSON.stringify([slideId, liveText, liveRef]) : '';
    const targetMode = window.previewTargetMode || 'sanctuary';
    const finishPreviewTransitions = [
      ['bento-preview-text-overlay', targetMode !== 'dual'],
      ['bento-dual-sanctuary-text', targetMode === 'dual'],
      ['bento-dual-livestream-lt', targetMode === 'dual']
    ].map(([id, visible]) => prepareStagePreviewTransition(
      document.getElementById(id), visible ? previewKey : '', targetMode, state));


    let idleHint = document.getElementById('bento-prev-idle-hint');
    const prevBox = document.getElementById('bento-preview-box');
    if (!idleHint && prevBox) {
      idleHint = document.createElement('div');
      idleHint.id = 'bento-prev-idle-hint';
      idleHint.className = 'bento-prev-idle';
      idleHint.innerHTML = `
        <div class="empty-icon">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/></svg>
        </div>
        <div class="empty-title">Output idle</div>
        <div class="empty-desc">Click any slide or AI suggestion to project live</div>
      `;
      prevBox.insertBefore(idleHint, prevBox.firstChild);
    }

    const prevBg = document.getElementById('bento-prev-bg');
    const prevVideo = document.getElementById('bento-prev-video');
    const prevDimmer = document.getElementById('bento-single-sanctuary-dimmer');
    const resTag = document.getElementById('bento-res-tag');
    const sancTheme = (window.themeManager && typeof window.themeManager.getSanctuaryPayload === 'function')
      ? window.themeManager.getSanctuaryPayload()
      : (state.sanctuaryTheme || null);

    // The selected preview target is authoritative. Output state can briefly lag
    // while this segmented control is being changed.
    window.syncOutputPreviews?.();
    window.liveAlertEngine?.updatePreview();
    const previewMode = window.previewTargetMode || 'sanctuary';
    const isFullMode = previewMode === 'sanctuary';
    const isTransActive = Boolean(state.transparentBg && !isFullMode);

    if (prevBox) {
      prevBox.classList.toggle('mode-full', isFullMode);
      prevBox.classList.toggle('mode-lt', !isFullMode);
      prevBox.classList.toggle('trans-active', isTransActive);
    }

    if (resTag) {
      resTag.textContent = isFullMode ? 'Full display • 1080p' : 'Lower-third • 1080p';
    }

    if (prevDimmer && sancTheme) {
      const dimmerVal = (typeof sancTheme.dimmer === 'number') ? sancTheme.dimmer : 30;
      prevDimmer.style.opacity = (dimmerVal / 100).toString();
    }

    if (prevBg && sancTheme) {
      const mediaFit = ['cover', 'contain', 'fill'].includes(sancTheme.fit) ? sancTheme.fit : 'cover';
      if (prevVideo) prevVideo.style.objectFit = mediaFit;
      if (isFullMode) {
        prevBg.style.display = 'block';
        if (sancTheme.type === 'video' && sancTheme.videoUrl) {
          prevBg.style.backgroundImage = 'none';
          prevBg.style.backgroundColor = '#000000';
          if (prevVideo) {
            if (prevVideo.getAttribute('data-src') !== sancTheme.videoUrl) {
              prevVideo.setAttribute('data-src', sancTheme.videoUrl);
              prevVideo.src = sancTheme.videoUrl;
            }
            prevVideo.style.display = 'block';
            const playAttempt = prevVideo.play();
            if (playAttempt && typeof playAttempt.catch === 'function') {
              playAttempt.catch(() => {
                if (sancTheme.imageUrl) prevBg.style.backgroundImage = `url('${sancTheme.imageUrl}')`;
              });
            }
          }
        } else if (sancTheme.type === 'image' && sancTheme.imageUrl) {
          if (prevVideo) {
            prevVideo.style.display = 'none';
            prevVideo.pause();
          }
          prevBg.style.backgroundImage = `url('${sancTheme.imageUrl}')`;
          prevBg.style.backgroundSize = mediaFit === 'fill' ? '100% 100%' : mediaFit;
          prevBg.style.backgroundRepeat = 'no-repeat';
          prevBg.style.backgroundColor = '#000';
          prevBg.style.backgroundPosition = 'center';
        } else {
          if (prevVideo) {
            prevVideo.style.display = 'none';
            prevVideo.pause();
          }
          prevBg.style.backgroundImage = 'none';
          prevBg.style.background = sancTheme.bgCss || '#0A0E18';
        }
      } else {
        prevBg.style.display = 'none';
        if (prevVideo) {
          prevVideo.style.display = 'none';
          prevVideo.pause();
        }
      }
    }

    const overlay = document.getElementById('bento-preview-text-overlay');
    const isBible = slideId.startsWith('bible_') || 
                    slideId.startsWith('medley_bible_') || 
                    slideId.startsWith('para_') || 
                    slideId.startsWith('hist_') ||
                    (slideId.startsWith('ai_') && /\b\d+\s*:\s*\d+/.test(liveRef)) ||
                    (state.currentTab === 'bible' && !slideId.includes('song'));
    const typo = state.typography || {};
    const activeAlign = isBible 
      ? (typo.textAlignBible || typo.textAlign || 'center') 
      : (typo.textAlignSongs || typo.textAlign || 'center');

    if (overlay) {
      overlay.style.textAlign = activeAlign;
      if (activeAlign === 'center') {
        overlay.style.alignItems = 'center';
      } else if (activeAlign === 'right') {
        overlay.style.alignItems = 'flex-end';
      } else {
        overlay.style.alignItems = 'flex-start';
      }

      // Apply the selected Sanctuary Typography font to the Stage Preview overlay
      const previewFont = (state.sanctuaryTheme && state.sanctuaryTheme.font)
        || (typeof localStorage !== 'undefined' && localStorage.getItem('sf_sanctuary_font'))
        || 'Outfit';
      overlay.style.fontFamily = `'${previewFont}', -apple-system, sans-serif`;

      if (liveText || liveRef) {
        if (idleHint) idleHint.style.display = 'none';

        const isLexiconSlide = Boolean(slideId.startsWith('lexicon_'));

        if (isLexiconSlide) {
          // FOR WORD STUDY / LEXICON: Crisp White Card with Bold Hero Translation
          overlay.classList.add('is-lexicon');
          overlay.classList.remove('is-bible', 'is-lyrics');

          const position = state.concordancePosition || (state.activeLexiconData && state.activeLexiconData.position) || 'right';
          overlay.classList.remove('pos-left', 'pos-center', 'pos-right');
          overlay.classList.add(`pos-${position}`);

          const lexData = state.activeLexiconData || {};
          const entry = window.currentLexiconEntry || lexData || {};
          const lemma = entry.lemma || lexData.lemma || liveText;
          const isHeb = entry.lang === 'Hebrew' || (entry.id && String(entry.id).startsWith('H')) || (lexData.id && String(lexData.id).startsWith('H'));
          const strongId = entry.id || lexData.id || (slideId.startsWith('lexicon_') ? slideId.replace('lexicon_', '').trim().toUpperCase() : '');
          const eng = window.currentLexiconEnglishWord || entry.englishWord || lexData.englishWord || entry.short_definition || lexData.short_definition || lemma;
          const translit = entry.transliteration || lexData.transliteration || '';
          const pron = entry.pronunciation || lexData.pronunciation || '';
          const pos = entry.part_of_speech || lexData.part_of_speech || '';
          const heroWord = translit ? (translit.charAt(0).toUpperCase() + translit.slice(1)) : (lemma || eng);

          overlay.innerHTML = `
            ${strongId || pos ? `
            <div class="bento-lex-meta">
              ${strongId ? `<span class="bento-lex-strong">${escapeHtml(strongId)}</span>` : ''}
              ${pos ? `<span class="bento-lex-pos">${escapeHtml(pos)}</span>` : ''}
            </div>` : ''}
            <div class="bento-lex-translation">${escapeHtml(heroWord)}</div>
            <div class="bento-lex-sub">
              <span class="bento-lex-orig" style="font-family:${isHeb ? "'David Libre', serif" : "'GFS Didot', serif"};">${escapeHtml(lemma)}</span>
              ${pron ? `<span class="bento-lex-dot">•</span><span class="bento-lex-pron">/${escapeHtml(pron)}/</span>` : ''}
              ${eng ? `<span class="bento-lex-dot">•</span><span class="bento-lex-trans">${escapeHtml(eng)}</span>` : ''}
            </div>
          `;
        } else if (!isBible) {
          // FOR LYRICS: Show all song lyric lines with uniform font weight, color, and size (all lines identical)
          overlay.classList.add('is-lyrics');
          overlay.classList.remove('is-bible', 'is-lexicon', 'pos-left', 'pos-center', 'pos-right');

          const rawLines = (liveText || '').split('\n');
          const lines = rawLines.filter(l => l.trim().length > 0);
          
          let lyricsHtml = '';
          if (state.showSongTitleInDisplay && liveRef) {
            lyricsHtml += `<div class="lyric-title-header" style="font-size:9.5px; font-weight:700; color:var(--purple-text, #c3b6ff); text-transform:uppercase; margin-bottom:4px; letter-spacing:0.04em;">${escapeHtml(liveRef)}</div>`;
          }
          if (lines.length > 0) {
            lyricsHtml += lines.map(line => `<div class="lyric-line">${escapeHtml(line.trim())}</div>`).join('');
          } else if (liveText) {
            lyricsHtml += `<div class="lyric-line">${escapeHtml(liveText)}</div>`;
          }
          overlay.innerHTML = lyricsHtml;
        } else {
          // FOR BIBLE: Retain existing scripture reference and verse layout
          overlay.classList.add('is-bible');
          overlay.classList.remove('is-lyrics', 'is-lexicon', 'pos-left', 'pos-center', 'pos-right');

          const lines = liveText.split('\n');
          const line1 = lines[0] || liveRef;
          const line2 = lines.slice(1).join(' ') || (lines[0] ? liveRef : '');
          overlay.innerHTML = `
            <div class="l1" id="bento-prev-l1">${escapeHtml(line1)}</div>
            <div class="l2" id="bento-prev-l2">${escapeHtml(line2)}</div>
          `;
        }


      } else {
        if (overlay.dataset) overlay.dataset.lastContentKey = '';
        overlay.classList.remove('is-lyrics', 'is-bible', 'is-lexicon', 'pos-left', 'pos-center', 'pos-right', 'bento-trans-anim');
        overlay.innerHTML = `
          <div class="l1" id="bento-prev-l1"></div>
          <div class="l2" id="bento-prev-l2"></div>
        `;
        if (idleHint) idleHint.style.display = 'flex';
      }
    }

    // ── Sync Dual Output Preview (Sanctuary + Livestream Monitors) ─────────────
    const singleWrap = document.getElementById('bento-single-prev-wrap');
    const dualWrap = document.getElementById('bento-dual-prev-wrap');
    const isDual = (window.previewTargetMode === 'dual');

    if (singleWrap && dualWrap) {
      singleWrap.style.display = isDual ? 'none' : 'flex';
      dualWrap.style.display = isDual ? 'flex' : 'none';
    }

    if (isDual) {
      const sancBg = document.getElementById('bento-dual-sanctuary-bg');
      const sancVideo = document.getElementById('bento-dual-sanctuary-video');
      const sancDimmer = document.getElementById('bento-dual-sanctuary-dimmer');
      const sancText = document.getElementById('bento-dual-sanctuary-text');
      const streamLt = document.getElementById('bento-dual-livestream-lt');

      const theme = (window.themeManager && typeof window.themeManager.getSanctuaryPayload === 'function')
        ? window.themeManager.getSanctuaryPayload()
        : null;

      if (sancBg && theme) {
        const mediaFit = ['cover', 'contain', 'fill'].includes(theme.fit) ? theme.fit : 'cover';
        const backgroundFit = mediaFit === 'fill' ? '100% 100%' : mediaFit;
        if (sancVideo) sancVideo.style.objectFit = mediaFit;
        if (theme.type === 'video' && theme.videoUrl) {
          sancBg.style.background = theme.imageUrl
            ? `#000 center / ${backgroundFit} no-repeat url('${theme.imageUrl}')`
            : '#0a1128';
          if (sancVideo) {
            if (sancVideo.dataset.src !== theme.videoUrl) {
              sancVideo.dataset.src = theme.videoUrl;
              sancVideo.src = theme.videoUrl;
            }
            sancVideo.style.display = 'block';
            const playAttempt = sancVideo.play();
            if (playAttempt && typeof playAttempt.catch === 'function') playAttempt.catch(() => {});
          }
        } else {
          if (sancVideo) {
            sancVideo.style.display = 'none';
            sancVideo.pause();
          }
          sancBg.style.background = theme.imageUrl
            ? `#000 center / ${backgroundFit} no-repeat url('${theme.imageUrl}')`
            : (theme.bgCss || '#0a1128');
        }
      }
      if (sancDimmer && theme) {
        sancDimmer.style.opacity = ((theme.dimmer !== undefined ? theme.dimmer : 30) / 100).toString();
      }

      if (sancText) {
        if (liveText || liveRef) {
          const lines = (liveText || '').split('\n').filter(l => l.trim().length > 0);
          if (isBible) {
            sancText.innerHTML = `
              <div class="sanctuary-l1" style="color:${theme ? theme.headerColor : '#60A5FA'}; font-family:${theme ? theme.font : 'Outfit'};">${escapeHtml(liveRef)}</div>
              <div class="sanctuary-l2" style="color:${theme ? theme.textColor : '#FFFFFF'}; text-shadow:${theme ? theme.textShadow : 'none'}; font-family:${theme ? theme.font : 'Outfit'};">${escapeHtml(liveText)}</div>
            `;
          } else {
            const displayLines = lines.slice(0, 3).map(l => escapeHtml(l.trim())).join('<br>');
            const songFullScale = state.songScaleFull !== undefined ? state.songScaleFull : 2.2;
            const fullPx = Math.round(8.5 * (songFullScale / 2.2 * 1.15));
            sancText.innerHTML = `
              ${liveRef ? `<div class="sanctuary-l1" style="color:${theme ? theme.headerColor : '#60A5FA'}; font-size:8px; font-family:${theme ? theme.font : 'Outfit'};">${escapeHtml(liveRef)}</div>` : ''}
              <div class="sanctuary-l2" style="color:${theme ? theme.textColor : '#FFFFFF'}; text-shadow:${theme ? theme.textShadow : 'none'}; font-family:${theme ? theme.font : 'Outfit'}; font-size:${fullPx}px;">${displayLines || escapeHtml(liveText)}</div>
            `;
          }
        } else {
          sancText.innerHTML = `<div class="dual-mon-empty">Output idle</div>`;
        }
      }

      if (streamLt) {
        if (liveText || liveRef) {
          const lines = (liveText || '').split('\n').filter(l => l.trim().length > 0);
          const firstLine = lines[0] || liveText;
          const songLtScale = state.songScaleLt !== undefined ? state.songScaleLt : 1.4;
          const ltPx = Math.round(7.5 * (songLtScale / 1.4));
          streamLt.innerHTML = `
            ${liveRef ? `<div class="lt-l1">${escapeHtml(liveRef)}</div>` : ''}
            <div class="lt-l2" style="font-size:${ltPx}px;">${escapeHtml(firstLine)}</div>
          `;
        } else {
          streamLt.innerHTML = `<div class="dual-mon-empty">Output idle</div>`;
        }
      }
    }

    if (status) {
      const isLive = !!(state.activeLiveSlideId && !state.isClear && !state.clear && !state.blackout);
      status.classList.toggle('idle', !isLive);
      status.style.opacity = '1';
      if (isLive) {
        status.innerHTML = `<i></i>LIVE`;
      } else {
        status.innerHTML = `<i></i>IDLE`;
      }
    }

    if (holdBtn) {
      holdBtn.classList.toggle('active', !!state.isHoldLive);
      const label = holdBtn.querySelector('.btn-label');
      if (label) {
        label.textContent = state.isHoldLive ? 'Locked' : 'Hold';
      }
      holdBtn.setAttribute('aria-pressed', String(!!state.isHoldLive));
      holdBtn.title = state.isHoldLive ? 'Release hold (Pinned live)' : 'Hold current slide live';
    }

    if (transBtn) {
      transBtn.classList.toggle('active', !!state.transparentBg);
      transBtn.setAttribute('aria-pressed', String(!!state.transparentBg));
    }

    const isLt = window.previewTargetMode === 'livestream';
    const modeDual = document.getElementById('bento-prev-mode-dual');

    const isSong = !isBible && !Boolean(slideId.startsWith('lexicon_')) && Boolean(liveText || slideId);
    let scale = state.textSize || 1.0;
    if (isSong) {
      if (isLt) {
        scale = state.songScaleLt !== undefined ? state.songScaleLt : 1.4;
      } else {
        scale = state.songScaleFull !== undefined ? state.songScaleFull : 2.2;
      }
    }

    if (window.getPreviewTextScaleControl) scale = window.getPreviewTextScaleControl().value;
    if (scaleLabel) {
      scaleLabel.textContent = Number(scale).toFixed(1) + 'x';
      if (prevBox && prevBox.style && typeof prevBox.style.setProperty === 'function') {
        prevBox.style.setProperty('--user-scale', scale);
      }
    }

    if (prevBox) {
      prevBox.classList.toggle('mode-lt', isLt);
      prevBox.classList.toggle('mode-full', !isLt && !isDual);
      prevBox.classList.toggle('mode-dual', isDual);
      prevBox.classList.toggle('trans-active', !!state.transparentBg);
      const resTag = document.getElementById('bento-res-tag') || prevBox.querySelector('.res-tag');
      if (resTag) {
        if (isDual) resTag.textContent = 'Dual output • 1080p';
        else if (isLt) resTag.textContent = 'Lower-third • 1080p';
        else resTag.textContent = 'Sanctuary • 1080p';
      }

      // Single View Sanctuary Theme Background
      if (!isLt && !isDual) {
        const theme = (window.themeManager && typeof window.themeManager.getSanctuaryPayload === 'function')
          ? window.themeManager.getSanctuaryPayload()
          : null;
        if (theme && theme.bgCss) {
          prevBox.style.background = theme.bgCss;
        } else {
          prevBox.style.background = '#0a0a0f';
        }
        const singleDimmer = document.getElementById('bento-single-sanctuary-dimmer');
        if (singleDimmer) {
          const dimmerVal = (theme && theme.dimmer !== undefined) ? theme.dimmer : 30;
          singleDimmer.style.opacity = (dimmerVal / 100).toString();
        }
      } else {
        prevBox.style.background = '#08080c';
      }
    }

    if (modeFull && modeLt) {
      modeFull.classList.toggle('active', window.previewTargetMode === 'sanctuary');
      modeLt.classList.toggle('active', window.previewTargetMode === 'livestream');
      modeFull.setAttribute('aria-pressed', String(window.previewTargetMode === 'sanctuary'));
      modeLt.setAttribute('aria-pressed', String(window.previewTargetMode === 'livestream'));
    }
    if (modeDual) {
      modeDual.classList.toggle('active', isDual);
      modeDual.setAttribute('aria-pressed', String(isDual));
    }
    finishPreviewTransitions.forEach(finish => finish());
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. BENTO AI SPEECH HUD & RECOMMENDATIONS
  // ─────────────────────────────────────────────────────────────────────────────
  function syncBentoAiHud() {
    const transcriptEl = document.getElementById('bento-ai-transcript-text');
    const listEl = document.getElementById('bento-ai-feed-list');
    const state = window.state || {};
    const isListening = !!state.aiListening;

    // ── Update live indicator dot ───────────────────────────────────────────────
    const liveDot = document.getElementById('bento-ai-live-dot');
    if (liveDot) {
      liveDot.classList.toggle('active', isListening);
    }

    // ── Update live transcript box ──────────────────────────────────────────────
    if (transcriptEl) {
      const transcript = (state.aiTranscript || '').trim();
      if (transcript && isListening) {
        transcriptEl.textContent = `"${transcript}"`;
        transcriptEl.style.fontStyle = 'italic';
        transcriptEl.style.color = 'var(--text, #f3f2f7)';
      } else if (isListening) {
        transcriptEl.textContent = 'Listening... speak scripture or sing lyrics live.';
        transcriptEl.style.fontStyle = 'normal';
        transcriptEl.style.color = 'var(--mute, #696773)';
      } else {
        transcriptEl.textContent = state.aiSpeechMessage || 'Click "AI Mic" to listen to preacher speech or choir...';
        transcriptEl.style.fontStyle = 'normal';
        transcriptEl.style.color = 'var(--mute, #696773)';
      }
    }

    // ── Update History button label ─────────────────────────────────────────────
    const docBadgeEl = document.getElementById('bento-transcript-badge-text');
    if (docBadgeEl) {
      docBadgeEl.textContent = 'History';
    }

    // ── Render unified live stream ──────────────────────────────────────────────
    if (!listEl) return;
    const verses = (state.aiDetectedVerses || []).map(v => ({ ...v, _type: 'verse' }));
    const songs = (state.aiDetectedSongs || []).map(v => ({ ...v, _type: 'song' }));
    const quotations = (state.paraphraseMatches || []).map(v => ({ ...v, _type: 'quotation' }));
    const concordance = (state.aiDetectedConcordance || []).map(v => ({ ...v, _type: 'concordance' }));
    window.renderDetectionCards?.(listEl, [...verses, ...songs, ...quotations, ...concordance], { bento: true, diagnostics: true });
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // 6. GLOBAL HELPERS & TOPBAR CONTROLLERS
  // ─────────────────────────────────────────────────────────────────────────────
  function syncBentoTabsUI() {
    const tabBible = document.getElementById('bento-tab-bible');
    const tabSongs = document.getElementById('bento-tab-songs');
    const transSel = document.getElementById('bento-trans-sel');
    const searchInput = document.getElementById('bento-search-input');
    const curTab = window.state ? window.state.currentTab : 'songs';

    if (tabBible) {
      tabBible.classList.toggle('active', curTab === 'bible');
      tabBible.setAttribute('aria-selected', String(curTab === 'bible'));
    }
    if (tabSongs) {
      tabSongs.classList.toggle('active', curTab === 'songs');
      tabSongs.setAttribute('aria-selected', String(curTab === 'songs'));
    }

    if (transSel) {
      transSel.style.display = (curTab === 'bible') ? 'flex' : 'none';
    }

    const strongsBtn = document.getElementById('bento-strongs-btn');
    if (strongsBtn) {
      strongsBtn.style.display = (curTab === 'bible') ? 'inline-flex' : 'none';
      strongsBtn.classList.toggle('active', Boolean(window.state && window.state.strongsMode));
    }

    if (searchInput) {
      searchInput.placeholder = curTab === 'bible' ? 'Filter books & chapters (Ctrl+L)...' : 'Search title, artist, lyric line (Ctrl+L)...';
    }
  }

  window.switchBentoTab = function(tab) {
    if (typeof window.switchLibraryTab === 'function') {
      window.switchLibraryTab(tab);
      return;
    }
    if (!window.state) return;
    window.state.currentTab = tab;
    syncBentoTabsUI();
    renderBentoLibrary();

    const isLive = Boolean(window.state.activeLiveSlideId || window.state.liveEngagedDeck);
    const isSongActive = Boolean(window.state.activeSongId && (!window.state.activeDeckType || window.state.activeDeckType === 'song'));
    const isBibleActive = Boolean(window.state.activeBibleBook && window.state.activeDeckType === 'bible');
    const hasActiveItem = isLive || isSongActive || isBibleActive;

    if (!hasActiveItem) {
      window.state.activeDeckType = (tab === 'bible') ? 'bible' : 'song';
    }

    renderBentoDeck();
    if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();
  };

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        syncBentoTabsUI();
        renderBentoAgenda();
        renderBentoLibrary();
        renderBentoDeck();
        syncBentoStagePreview();
        syncBentoAiHud();
      });
    } else {
      syncBentoTabsUI();
      renderBentoAgenda();
      renderBentoLibrary();
      renderBentoDeck();
      syncBentoStagePreview();
      syncBentoAiHud();
    }
  }

  window.clearBentoSearch = function() {
    const input = document.getElementById('bento-search-input');
    const clearBtn = document.getElementById('bento-search-clear');
    if (input) {
      input.value = '';
      input.focus();
    }
    if (clearBtn) clearBtn.style.display = 'none';
    renderBentoLibrary('');
  };

  let _bentoSearchDebounceTimer = null;
  window.handleBentoSearch = function(val) {
    const clearBtn = document.getElementById('bento-search-clear');
    if (clearBtn) {
      clearBtn.style.display = (val && val.trim().length > 0) ? 'inline-block' : 'none';
    }
    if (_bentoSearchDebounceTimer) clearTimeout(_bentoSearchDebounceTimer);
    _bentoSearchDebounceTimer = setTimeout(() => {
      renderBentoLibrary(val);
    }, 120);
  };

  window.assignBibleBookToSlot = function(book, slotIdx, chapter, allowToggle = true) {
    if (!window.state) return;
    if (!Array.isArray(window.state.medleyBibleSlots)) {
      window.state.medleyBibleSlots = [null, null, null];
    }
    const existing = window.state.medleyBibleSlots[slotIdx];
    if (allowToggle && existing && existing.book === book && chapter === undefined) {
      window.state.medleyBibleSlots[slotIdx] = null;
    } else {
      window.state.medleyBibleSlots[slotIdx] = {
        book: book,
        chapter: chapter || 1,
        version: window.state.bibleVersion || 'KJV'
      };
    }
    if (typeof window.renderLibrary === 'function') window.renderLibrary();
    if (typeof window.renderDeck === 'function') window.renderDeck(true);
    if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function setBentoSingleCols(cols) {
    cols = parseInt(cols, 10) || 2;
    if (window.state) window.state.bentoSingleCols = cols;
    try { localStorage.setItem('sf_bento_single_cols', cols); } catch(e) {}
    const seg = document.getElementById('bento-cols-seg');
    if (seg) {
      seg.querySelectorAll('span').forEach(sp => {
        sp.classList.toggle('active', parseInt(sp.dataset.cols, 10) === cols);
      });
    }
    const deck = document.getElementById('bento-medley-container');
    if (deck) {
      deck.setAttribute('data-cols', cols);
      deck.style.gridAutoRows = 'minmax(min-content, max-content)';
    }

    // Instantly recalibrate live card SVG cutout to match the new column width and keep active card in view
    requestAnimationFrame(() => {
      const liveCards = document.querySelectorAll('.bento-single-card.live');
      liveCards.forEach(card => {
        if (typeof window.updateBentoLiveCardShape === 'function') {
          window.updateBentoLiveCardShape(card);
        }
        if (typeof window.setupLiveCardObserver === 'function') {
          window.setupLiveCardObserver(card);
        }
      });
      if (typeof window.scrollToActiveSlide === 'function') {
        window.scrollToActiveSlide();
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. BENTO BIBLE CHAPTER NAVIGATION & FLOATING HUD POPOVER
  // ─────────────────────────────────────────────────────────────────────────────
  window.selectBentoBibleChapter = function(book, chNum, openVerseNext = true, triggerEl = null) {
    if (!window.state) window.state = {};
    const parsedCh = parseInt(chNum, 10) || 1;
    closeBentoChapterPopover();

    // Capture button geometry immediately before any DOM updates
    let savedRect = null;
    let isDrawer = false;
    const rawEl = triggerEl && (triggerEl.currentTarget || triggerEl.target || triggerEl);
    if (rawEl && typeof rawEl.getBoundingClientRect === 'function') {
      const r = rawEl.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        savedRect = { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
        isDrawer = rawEl.classList && rawEl.classList.contains('bento-drawer-btn');
      }
    }

    if (openVerseNext) {
      // User clicked a chapter to pick a verse: DO NOT change the main deck yet!
      window.state.pendingVerseSelection = { book: book, chapter: parsedCh };

      // Highlight the chapter button being browsed in the drawer
      document.querySelectorAll('.bento-drawer-btn.picking-active').forEach(el => {
        el.classList.remove('picking-active');
      });
      if (rawEl && rawEl.classList && rawEl.classList.contains('bento-drawer-btn')) {
        rawEl.classList.add('picking-active');
      }

      setTimeout(() => {
        if (typeof window.toggleBentoVersePopover === 'function') {
          window.toggleBentoVersePopover({
            book: book,
            chapter: parsedCh,
            savedRect: savedRect,
            isDrawerBtn: isDrawer,
            currentTarget: rawEl || document.getElementById('bento-active-verse-badge'),
            stopPropagation: () => {}
          });
        }
      }, 10);
      return;
    }

    // Direct chapter selection (e.g. keyboard navigation without verse picker)
    window.state.activeBibleBook = book;
    window.state.activeBibleChapter = parsedCh;
    window.state.expandedBibleBook = book;
    window.state.activeDeckType = 'bible';
    window.state.pendingVerseSelection = null;
    window.state.liveEngagedDeck = null;
    if (typeof window.cancelPreparedSlide === 'function') window.cancelPreparedSlide();
    if (typeof window.renderLibrary === 'function') window.renderLibrary();
    if (typeof window.renderDeck === 'function') window.renderDeck(true);
    if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();
  };

  window.bentoPrevBibleChapter = function(e) {
    if (e) e.stopPropagation();
    if (!window.state) return;
    const curBook = window.state.activeBibleBook;
    const ver = window.state.bibleVersion || 'KJV';
    const books = typeof window.getBibleBooks === 'function' ? window.getBibleBooks(ver) : [];
    const curBookIdx = books.indexOf(curBook);
    const curCh = parseInt(window.state.activeBibleChapter, 10) || 1;

    if (curCh > 1) {
      window.state.activeBibleChapter = curCh - 1;
    } else if (curBookIdx > 0) {
      window.state.activeBibleBook = books[curBookIdx - 1];
      const prevChs = typeof window.getBibleChapters === 'function' ? window.getBibleChapters(window.state.activeBibleBook, ver) : [1];
      window.state.activeBibleChapter = prevChs.length > 0 ? prevChs.length : 1;
      window.state.expandedBibleBook = window.state.activeBibleBook;
    }
    window.state.activeDeckType = 'bible';
    window.state.liveEngagedDeck = null;
    if (typeof window.cancelPreparedSlide === 'function') window.cancelPreparedSlide();
    if (typeof window.renderLibrary === 'function') window.renderLibrary();
    if (typeof window.renderDeck === 'function') window.renderDeck(true);
    if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();
  };

  window.bentoNextBibleChapter = function(e) {
    if (e) e.stopPropagation();
    if (!window.state) return;
    const curBook = window.state.activeBibleBook;
    const ver = window.state.bibleVersion || 'KJV';
    const books = typeof window.getBibleBooks === 'function' ? window.getBibleBooks(ver) : [];
    const curBookIdx = books.indexOf(curBook);
    const chs = typeof window.getBibleChapters === 'function' ? window.getBibleChapters(curBook, ver) : [1];
    const curCh = parseInt(window.state.activeBibleChapter, 10) || 1;

    if (curCh < chs.length) {
      window.state.activeBibleChapter = curCh + 1;
    } else if (curBookIdx !== -1 && curBookIdx + 1 < books.length) {
      window.state.activeBibleBook = books[curBookIdx + 1];
      window.state.activeBibleChapter = 1;
      window.state.expandedBibleBook = window.state.activeBibleBook;
    }
    window.state.activeDeckType = 'bible';
    window.state.liveEngagedDeck = null;
    if (typeof window.cancelPreparedSlide === 'function') window.cancelPreparedSlide();
    if (typeof window.renderLibrary === 'function') window.renderLibrary();
    if (typeof window.renderDeck === 'function') window.renderDeck(true);
    if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();
  };

  function renderBentoChapterPopoverGrid(filterQ = '') {
    const list = document.getElementById('bento-chapter-popover-grid');
    if (!list) return;
    list.innerHTML = '';

    const book = (window.state && window.state.activeBibleBook) ? window.state.activeBibleBook : 'Genesis';
    const ver = (window.state && window.state.bibleVersion) ? window.state.bibleVersion : 'KJV';
    const chs = typeof window.getBibleChapters === 'function' ? window.getBibleChapters(book, ver) : [];
    const curCh = parseInt(window.state && window.state.activeBibleChapter, 10) || 1;
    const q = (filterQ || '').trim();

    const filtered = q ? chs.filter(c => c.startsWith(q) || c === q) : chs;

    if (filtered.length === 0) {
      list.innerHTML = `<div style="grid-column:1/-1; padding:12px; text-align:center; color:var(--dim); font-size:11px;">No chapters found</div>`;
      return;
    }

    filtered.forEach(chStr => {
      const chNum = parseInt(chStr, 10);
      const isActive = chNum === curCh;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `bento-popover-btn ${isActive ? 'active' : ''}`;
      btn.textContent = chNum;
      btn.onclick = (e) => {
        e.stopPropagation();
        window.selectBentoBibleChapter(book, chNum, true, e.currentTarget);
      };
      list.appendChild(btn);
    });
  }

  window.toggleBentoChapterPopover = function(event) {
    if (event) event.stopPropagation();
    let popover = document.getElementById('bento-chapter-popover');
    if (!popover) {
      popover = document.createElement('div');
      popover.id = 'bento-chapter-popover';
      popover.className = 'bento-chapter-popover';
      popover.innerHTML = `
        <div class="bento-popover-search">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="bento-popover-search-input" placeholder="Type chapter number..." autocomplete="off">
        </div>
        <div class="bento-popover-grid" id="bento-chapter-popover-grid"></div>
      `;
      document.body.appendChild(popover);

      const searchInp = popover.querySelector('#bento-popover-search-input');
      if (searchInp) {
        searchInp.oninput = (e) => renderBentoChapterPopoverGrid(e.target.value);
        searchInp.onkeydown = (e) => {
          if (e.key === 'Enter') {
            const val = parseInt(e.target.value.trim(), 10);
            if (!isNaN(val) && window.state && window.state.activeBibleBook) {
              window.selectBentoBibleChapter(window.state.activeBibleBook, val);
              setTimeout(() => {
                if (typeof window.toggleBentoVersePopover === 'function') {
                  const verseTrigger = document.getElementById('bento-active-verse-badge');
                  if (verseTrigger) {
                    window.toggleBentoVersePopover({ currentTarget: verseTrigger, stopPropagation: () => {} });
                  }
                }
              }, 50);
            }
          } else if (e.key === 'Escape') {
            closeBentoChapterPopover();
          }
        };
      }
    }

    const isOpen = popover.classList.contains('open');
    if (isOpen) {
      closeBentoChapterPopover();
      return;
    }

    const targetEl = event ? (event.currentTarget || event.target) : document.querySelector('.bento-chapter-capsule .badge:not(.badge-verse)');
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      popover.style.position = 'fixed';
      popover.style.top = `${rect.bottom + 8}px`;
      popover.style.left = `${Math.max(10, Math.min(window.innerWidth - 300, rect.left))}px`;
    }

    const searchInp = popover.querySelector('#bento-popover-search-input');
    if (searchInp) searchInp.value = '';
    renderBentoChapterPopoverGrid('');
    popover.classList.add('open');
    if (typeof window.openDismissShield === 'function') {
      window.openDismissShield(() => {
        closeBentoChapterPopover();
        closeBentoVersePopover();
      }, 9998);
    }
    if (searchInp && typeof searchInp.focus === 'function') {
      setTimeout(() => {
        if (typeof searchInp.focus === 'function') searchInp.focus();
      }, 60);
    }
  };

  function closeBentoChapterPopover() {
    const popover = document.getElementById('bento-chapter-popover');
    if (popover) popover.classList.remove('open');
    const vsPopover = document.getElementById('bento-verse-popover');
    if (!vsPopover || !vsPopover.classList.contains('open')) {
      if (typeof window.closeDismissShield === 'function') window.closeDismissShield();
    }
  }
  window.closeBentoChapterPopover = closeBentoChapterPopover;

  function renderBentoVersePopoverGrid(filterQ = '') {
    const list = document.getElementById('bento-verse-popover-grid');
    const popover = document.getElementById('bento-verse-popover');
    if (!list) return;
    list.innerHTML = '';

    const book = (popover && popover._targetBook) || (window.state && (window.state.pendingVerseSelection?.book || window.state.activeBibleBook)) || 'Genesis';
    const ch = parseInt((popover && popover._targetChapter) || (window.state && (window.state.pendingVerseSelection?.chapter || window.state.activeBibleChapter)), 10) || 1;
    const ver = (window.state && window.state.bibleVersion) ? window.state.bibleVersion : 'KJV';
    const verses = typeof window.getBibleVerses === 'function' ? window.getBibleVerses(book, ch, ver) : [];
    const titleEl = document.getElementById('bento-verse-popover-title');
    const cntEl = document.getElementById('bento-verse-popover-cnt');
    if (titleEl) titleEl.textContent = `${book} ${ch} · Verses`;
    if (cntEl) cntEl.textContent = `${verses.length} vs`;

    const q = (filterQ || '').trim();
    const filtered = q ? verses.filter(v => String(v.verse).startsWith(q) || String(v.verse) === q) : verses;

    if (filtered.length === 0) {
      list.innerHTML = `<div style="grid-column:1/-1; padding:12px; text-align:center; color:var(--dim); font-size:11px;">No verses found</div>`;
      return;
    }

    filtered.forEach(v => {
      const vNum = v.verse;
      const slideId = `bible_${book}_${ch}_${vNum}`;
      const isLive = typeof window.isBibleSlideLive === 'function' && window.isBibleSlideLive(ver, book, ch, vNum);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `bento-popover-btn ${isLive ? 'active' : ''}`;
      btn.textContent = vNum;
      btn.onclick = (e) => {
        e.stopPropagation();
        window.selectBentoBibleVerse(vNum, book, ch);
      };
      list.appendChild(btn);
    });
  }

  window.selectBentoBibleVerse = function(verseNum, targetBook = null, targetChapter = null) {
    const popover = document.getElementById('bento-verse-popover');
    const book = targetBook || (popover && popover._targetBook) || (window.state && (window.state.pendingVerseSelection?.book || window.state.activeBibleBook)) || 'Genesis';
    const ch = parseInt(targetChapter || (popover && popover._targetChapter) || (window.state && (window.state.pendingVerseSelection?.chapter || window.state.activeBibleChapter)), 10) || 1;
    const vNum = parseInt(verseNum, 10) || 1;

    closeBentoVersePopover();

    if (!window.state) window.state = {};
    window.state.activeBibleBook = book;
    window.state.activeBibleChapter = ch;
    window.state.activeBibleVerse = vNum;
    window.state.expandedBibleBook = book;
    window.state.activeDeckType = 'bible';
    window.state.pendingVerseSelection = null;
    window.state.liveEngagedDeck = null;
    if (typeof window.cancelPreparedSlide === 'function') window.cancelPreparedSlide();

    // Transition the main deck and library synchronously to the newly selected passage
    if (typeof window.renderLibrary === 'function') window.renderLibrary();
    if (typeof window.renderDeck === 'function') window.renderDeck(true);
    if (typeof window.syncDashboardWorkspace === 'function') window.syncDashboardWorkspace();

    const badge = document.getElementById('bento-active-verse-badge');
    if (badge) {
      if (badge.classList.contains('bento-unified-ref-btn')) {
        badge.textContent = `${book} ${ch}:${vNum} ▾`;
      } else {
        badge.textContent = `Vs ${vNum} ▾`;
      }
    }

    const slideId = `bible_${book}_${ch}_${vNum}`;
    requestAnimationFrame(() => {
      const card = document.getElementById(`bento_card_${slideId}`);
      if (card) {
        card.classList.add('bento-card-pulse');
        setTimeout(() => card.classList.remove('bento-card-pulse'), 1200);
        card.click();
      } else {
        if (typeof window.projectSlide === 'function') {
          window.projectSlide(slideId);
        }
      }
      if (typeof window.scrollToActiveSlide === 'function') {
        window.scrollToActiveSlide({ center: true });
      }
    });
  };

  window.toggleBentoVersePopover = function(event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    closeBentoChapterPopover();
    let popover = document.getElementById('bento-verse-popover');
    if (!popover) {
      popover = document.createElement('div');
      popover.id = 'bento-verse-popover';
      popover.className = 'bento-chapter-popover bento-verse-popover';
      popover.innerHTML = `
        <div class="bento-drawer-head" style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <span id="bento-verse-popover-title" style="font-size:11px; font-weight:700; color:var(--purple-text, #c4b5fd);">Select verse</span>
          <span id="bento-verse-popover-cnt" class="cnt" style="font-size:10px; color:var(--dim, #a3a1ae);"></span>
        </div>
        <div class="bento-popover-search">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="bento-verse-popover-search-input" aria-label="Search verse number" inputmode="numeric" placeholder="Type verse number..." autocomplete="off">
        </div>
        <div class="bento-popover-grid" id="bento-verse-popover-grid"></div>
      `;
      document.body.appendChild(popover);

      const searchInp = popover.querySelector('#bento-verse-popover-search-input');
      if (searchInp) {
        searchInp.oninput = (e) => renderBentoVersePopoverGrid(e.target.value);
        searchInp.onkeydown = (e) => {
          if (e.key === 'Enter') {
            const val = parseInt(e.target.value.trim(), 10);
            if (!isNaN(val)) {
              window.selectBentoBibleVerse(val, popover._targetBook, popover._targetChapter);
            }
          } else if (e.key === 'Escape') {
            closeBentoVersePopover();
          }
        };
      }
    }

    const targetBook = (event && event.book) || (window.state && window.state.pendingVerseSelection?.book) || (window.state && window.state.activeBibleBook) || 'Genesis';
    const targetChapter = parseInt((event && event.chapter) || (window.state && window.state.pendingVerseSelection?.chapter) || (window.state && window.state.activeBibleChapter), 10) || 1;

    const isOpen = popover.classList.contains('open');
    if (isOpen && popover._targetBook === targetBook && popover._targetChapter === targetChapter && !event?.savedRect) {
      closeBentoVersePopover();
      return;
    }

    popover._targetBook = targetBook;
    popover._targetChapter = targetChapter;

    // Render contents first so popover has actual rendered elements to measure
    const searchInp = popover.querySelector('#bento-verse-popover-search-input');
    if (searchInp) searchInp.value = '';
    renderBentoVersePopoverGrid('');

    // Open so real rendered height and width can be accurately calculated
    popover.classList.add('open');
    if (typeof window.openDismissShield === 'function') {
      window.openDismissShield(() => {
        closeBentoVersePopover();
        closeBentoChapterPopover();
      }, 9998);
    }

    const targetEl = (event && (event.currentTarget || event.target)) || document.getElementById('bento-active-verse-badge');
    const isDrawerBtn = (event && event.isDrawerBtn) || (targetEl && targetEl.classList && targetEl.classList.contains('bento-drawer-btn'));
    const rect = (event && event.savedRect) || (targetEl && typeof targetEl.getBoundingClientRect === 'function' ? targetEl.getBoundingClientRect() : null);

    // Measure actual rendered dimensions dynamically
    const popoverHeight = popover.offsetHeight || 300;
    const popoverWidth = popover.offsetWidth || 290;

    if (rect) {
      popover.style.position = 'fixed';
      if (isDrawerBtn) {
        let left = rect.right + 12;
        let top = rect.top - 12;

        // Check horizontal screen overflow (flip arrow if near right edge)
        if (left + popoverWidth > window.innerWidth - 12) {
          left = Math.max(12, rect.left - popoverWidth - 12);
          popover.classList.remove('flyout-left-arrow');
          popover.classList.add('flyout-right-arrow');
        } else {
          popover.classList.remove('flyout-right-arrow');
          popover.classList.add('flyout-left-arrow');
        }

        // Strict vertical clamping: NEVER go outside the screen
        const maxTop = window.innerHeight - popoverHeight - 16;
        if (top > maxTop) {
          top = maxTop;
        }
        if (top < 12) {
          top = 12;
        }

        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;

        // Arrow vertical alignment directly to clicked chapter button center
        const btnCenterY = rect.top + (rect.height / 2);
        const arrowTop = Math.max(16, Math.min(popoverHeight - 24, btnCenterY - top - 7));
        popover.style.setProperty('--arrow-top', `${arrowTop}px`);
      } else {
        popover.classList.remove('flyout-left-arrow', 'flyout-right-arrow');
        let top = rect.bottom + 8;
        let left = Math.max(10, Math.min(window.innerWidth - popoverWidth - 12, rect.left));
        const maxTop = window.innerHeight - popoverHeight - 16;
        if (top > maxTop) {
          const topAbove = rect.top - popoverHeight - 8;
          top = topAbove >= 12 ? topAbove : Math.max(12, maxTop);
        }
        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;
      }
    } else {
      popover.classList.remove('flyout-left-arrow', 'flyout-right-arrow');
      popover.style.position = 'fixed';
      popover.style.top = '100px';
      popover.style.left = '320px';
    }

    if (searchInp && typeof searchInp.focus === 'function') {
      setTimeout(() => {
        if (typeof searchInp.focus === 'function') searchInp.focus();
      }, 60);
    }
  };

  function closeBentoVersePopover() {
    const popover = document.getElementById('bento-verse-popover');
    if (popover) {
      popover.classList.remove('open');
      popover.classList.remove('flyout-left-arrow', 'flyout-right-arrow');
    }
    if (window.state) {
      window.state.pendingVerseSelection = null;
    }
    document.querySelectorAll('.bento-drawer-btn.picking-active').forEach(el => {
      el.classList.remove('picking-active');
    });
    const chPopover = document.getElementById('bento-chapter-popover');
    if (!chPopover || !chPopover.classList.contains('open')) {
      if (typeof window.closeDismissShield === 'function') window.closeDismissShield();
    }
  }
  window.closeBentoVersePopover = closeBentoVersePopover;

  // Global outside click and escape listeners
  document.addEventListener('click', (e) => {
    const chPopover = document.getElementById('bento-chapter-popover');
    if (chPopover && chPopover.classList.contains('open')) {
      if (!chPopover.contains(e.target) && !e.target.closest('.bento-text-trigger, .bento-sibling-btn, .bento-unified-ref-btn, .bento-chapter-capsule')) {
        closeBentoChapterPopover();
      }
    }
    const vsPopover = document.getElementById('bento-verse-popover');
    if (vsPopover && vsPopover.classList.contains('open')) {
      if (!vsPopover.contains(e.target) && !e.target.closest('#bento-active-verse-badge, .bento-drawer-btn')) {
        closeBentoVersePopover();
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeBentoChapterPopover();
      closeBentoVersePopover();
    }
  });

  window.setScriptureNavStyle = function(style) {
    if (!window.state) window.state = {};
    window.state.scriptureNavStyle = style;
    try { localStorage.setItem('sf_scripture_nav_style', style); } catch (e) {}
    if (typeof window.renderBentoDeck === 'function') {
      window.renderBentoDeck();
    }
  };

  // Lock outer deck container and middle column against any inadvertent browser scroll
  const setupDeckScrollGuards = () => {
    const deckCard = document.getElementById('bento-deck-card');
    if (deckCard) {
      deckCard.addEventListener('scroll', () => {
        if (deckCard.scrollTop !== 0) deckCard.scrollTop = 0;
        if (deckCard.scrollLeft !== 0) deckCard.scrollLeft = 0;
      }, { passive: true });
    }
    const colCenter = document.getElementById('bento-col-center');
    if (colCenter) {
      colCenter.addEventListener('scroll', () => {
        if (colCenter.scrollTop !== 0) colCenter.scrollTop = 0;
        if (colCenter.scrollLeft !== 0) colCenter.scrollLeft = 0;
      }, { passive: true });
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupDeckScrollGuards);
  } else {
    setupDeckScrollGuards();
  }

  // Export renderers to global window object
  window.setBentoSingleCols = setBentoSingleCols;
  window.renderBentoAgenda = renderBentoAgenda;
  window.renderBentoLibrary = renderBentoLibrary;
  window.renderBentoDeck = renderBentoDeck;
  window.syncBentoStagePreview = syncBentoStagePreview;
  window.syncBentoAiHud = syncBentoAiHud;
  window.syncBentoTabsUI = syncBentoTabsUI;

})();
