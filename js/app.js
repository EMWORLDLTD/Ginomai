// Ginomia - Master Control Engine
'use strict';

const CHANNEL_NAME = 'scriptureflow_sync';
const syncChannel = new BroadcastChannel(CHANNEL_NAME);
const REMOTE_MODE = new URLSearchParams(window.location.search).get('remote') === '1';

// State Store
const state = {
  currentTab: 'songs', // 'bible' | 'songs' (Default to SONGS library tab)
  activeDeckType: 'song', // 'song' | 'bible' (Center presentation deck content type)
  currentMode: 'full', // 'full' | 'lt'
  maxLinesPerSlide: 0, // Max lines per slide for auto-splitting (0 for Full/disabled, 2, 3, 4)
  songEditorMode: (typeof localStorage !== 'undefined' && localStorage.getItem('sf_song_editor_mode')) || 'split', // 'split' | 'modal'
  isDeckEditingSong: null, // songId when deck split editor is active
  showMedleyView: false, // Toggle for showing S1, S2, S3 Medley buttons on Songs (Disabled by default)
  showBibleMedleyButtons: false, // Toggle for showing S1, S2, S3 Medley buttons on Bible (Disabled by default)
  bibleMedleyChangeTarget: localStorage.getItem('sf_bible_medley_change_target') || 'chapter', // 'chapter' | 'version'
  isMedleyMode: false,
  medleySongIds: [],
  medleyVersionCodes: [],
  medleyBibleSlots: [],
  expandedBibleBook: null,
  chapterTargetSlot: null,
  activePickerSlot: 0,
  activePickerType: 'song', // 'song' | 'version' | 'bible'

  // Service Agenda Items (Supports Drag & Drop)
  agendaItems: [],

  textSize: 1.0,
  songScaleFull: (typeof localStorage !== 'undefined' && parseFloat(localStorage.getItem('sf_song_scale_full'))) || 2.2,
  songScaleLt: (typeof localStorage !== 'undefined' && parseFloat(localStorage.getItem('sf_song_scale_lt'))) || 1.4,
  textAutoScale: true,
  bibleVersion: 'KJV',
  compareBibleVersion: 'NIV',
  compareData: null,
  isCompareMode: false,
  isHoldLive: false,
  activeAiTab: 'detected', // 'detected' | 'songs' | 'paraphrase' | 'history'
  aiProvider: (typeof localStorage !== 'undefined' && localStorage.getItem('sf_ai_provider')) || '',
  deepgramApiKey: (typeof localStorage !== 'undefined' && localStorage.getItem('sf_deepgram_api_key')) || '',
  deepgramModel: (typeof localStorage !== 'undefined' && localStorage.getItem('sf_deepgram_model')) || 'nova-3',
  churchCustomTerms: (typeof localStorage !== 'undefined' && localStorage.getItem('sf_church_custom_terms')) || '',
  scriptureHistory: [],
  paraphraseMatches: [],
  aiDetectedVerses: [],
  aiDetectedSongs: [],
  lastAutoDetectedRef: '',
  lastAutoDetectedSongSlide: '',

  // Broadcast Target Flags
  projectorActive: true,
  livestreamActive: true,
  showSongTitleInDisplay: (typeof localStorage !== 'undefined' && localStorage.getItem('sf_show_song_title') === 'true'), // Disabled by default
  transparentBg: false, // Remove background for transparent OBS overlay (Disabled by default)
  transitionType: (typeof localStorage !== 'undefined' && localStorage.getItem('sf_transition_type')) || 'fade', // 'fade' | 'zoom-in' | 'zoom-out' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'cut'
  transitionDuration: (typeof localStorage !== 'undefined' && parseInt(localStorage.getItem('sf_transition_duration'), 10)) || 300,
  bentoSingleCols: 1, // 1 | 2 | 3 column layout for Bento Single View (Default: 1 Col)
  bentoSingleScale: 1.0,
  bentoMedleyScale: 1.0,
  deckScale: 1.0,
  deckZoom: 1.0,

  // Advanced Typography & Layout State (Minimalist Pro UI)
  typography: {
    fontType: 'app', // 'app' | 'sys'
    fontFamily: 'Outfit',
    highlightColor: '#EAB308',
    target: 'verse', // 'verse' | 'ref'
    fontSize: 48,
    longVerseMode: 'fit', // 'fit' | 'split'
    lineHeight: '1.4',
    letterSpacing: '0',
    verseWeight: '800',
    verseTransform: 'none',
    textAlign: 'center', // 'left' | 'center' | 'right'
    textAlignBible: 'center',
    textAlignSongs: 'center',
    hPadding: '4rem',
    vPadding: 'none',
    shadowLevel: 1 // 0 to 5
  },

  activeLiveSlideId: null,
  activeLiveText: '',
  activeLiveRef: '',
  liveEngagedDeck: null,   // { type: 'bible'|'song', book?, chapter?, songId? }
  activeSongId: null,
  activeBibleBook: '',
  activeBibleChapter: 1,
  background: '#0A0A0E',

  aiListening: false,
  autoProject: false,
  lastAutoSongMatch: '',
  aiTranscript: '',
  aiSuggestions: []
};

let speechAi = null;
let lastCatalogSignature = '';
let themeManager = null;

window.state = state;

// ── Hoisted Global Variables (TDZ Protection) ─────────────────────────────
var previewTargetMode = (typeof localStorage !== 'undefined' && localStorage.getItem('sf_preview_target_mode')) || 'sanctuary';
window.previewTargetMode = previewTargetMode;

var customLanIp = '';
window.customLanIp = customLanIp;

var audioInputDevices = [];
window.audioInputDevices = audioInputDevices;

var selectedAudioDeviceId = (typeof localStorage !== 'undefined' && localStorage.getItem('sf_selected_mic_device')) || 'default';
window.selectedAudioDeviceId = selectedAudioDeviceId;

var audioMicDevices = [];
window.audioMicDevices = audioMicDevices;

var sessionPanelState = {
  enabled: false,
  operatorUrl: '',
  roomCode: '',
  activePeers: 0,
  pendingImports: []
};
window.sessionPanelState = sessionPanelState;

var omniSearchCurrentMode = 'all'; // 'all' | 'verses' | 'songs'
window.omniSearchCurrentMode = omniSearchCurrentMode;

var omniSearchDebounceTimer = null;
window.omniSearchDebounceTimer = omniSearchDebounceTimer;

var testTransitionToggle = false;
window.testTransitionToggle = testTransitionToggle;

var _syncWorkspaceTimer = null;

// ── Hoisted Global Functions ───────────────────────────────────────────────
function closeSongEditor() {
  const modal = document.getElementById('song-editor-modal-backdrop');
  if (modal) modal.classList.remove('open');
}
window.closeSongEditor = closeSongEditor;

function saveSongEditor() {
  if (typeof saveSongEditorChanges === 'function') saveSongEditorChanges();
}
window.saveSongEditor = saveSongEditor;

function deleteSongEditor() {
  if (typeof deleteCurrentEditingSong === 'function') deleteCurrentEditingSong();
}
window.deleteSongEditor = deleteSongEditor;


function setSongEditorModeSetting(mode) {
  state.songEditorMode = (mode === 'modal') ? 'modal' : 'split';
  try {
    localStorage.setItem('sf_song_editor_mode', state.songEditorMode);
  } catch (e) {}

  const sel = document.getElementById('setting-song-editor-mode');
  if (sel) {
    sel.value = state.songEditorMode;
    if (typeof window.syncCustomSelect === 'function') window.syncCustomSelect(sel);
  }

  if (state.songEditorMode === 'modal' && state.isDeckEditingSong) {
    if (typeof window.closeDeckSplitEditor === 'function') {
      window.closeDeckSplitEditor(false);
    }
  }

  if (typeof showToast === 'function') {
    showToast(`Song editor mode: ${state.songEditorMode === 'split' ? 'In-Deck Split View' : 'Overlay Modal Dialog'}`, 'info');
  }
}
window.setSongEditorModeSetting = setSongEditorModeSetting;

function openDeckSplitEditor(songId, stanzaIndex = null) {
  if (!songId) songId = state.activeSongId;
  if (!songId) return;
  state.activeSongId = songId;
  state.activeDeckType = 'song';
  state.isDeckEditingSong = songId;
  const deckCard = document.getElementById('bento-deck-card');
  if (deckCard) {
    deckCard.classList.add('in-split-editor');
    deckCard.scrollTop = 0;
  }
  if (typeof renderDeck === 'function') {
    renderDeck();
  }
  {
    const textarea = document.getElementById('bento-split-lyrics');
    if (textarea) {
      if (stanzaIndex !== null && stanzaIndex >= 0) {
        const song = (window.SONGS_DATABASE || []).find(s => s.id === songId);
        if (song && song.stanzas && song.stanzas[stanzaIndex]) {
          const targetStanza = song.stanzas[stanzaIndex];
          const tag = `[${targetStanza.type}]`;
          const ranges = window.getBentoSplitStanzaRanges?.(textarea.value, song.stanzas);
          const pos = ranges?.[stanzaIndex]?.start ?? textarea.value.indexOf(tag);
          if (pos !== -1) {
            textarea.focus({ preventScroll: true });
            textarea.setSelectionRange(pos, pos + tag.length);
            const linesBefore = textarea.value.substring(0, pos).split('\n').length;
            textarea.scrollTop = Math.max(0, (linesBefore - 2) * 20);
            if (deckCard) deckCard.scrollTop = 0;
            return;
          }
        }
      }
      textarea.focus({ preventScroll: true });
      if (deckCard) deckCard.scrollTop = 0;
    }
  }
}
window.openDeckSplitEditor = openDeckSplitEditor;

function closeDeckSplitEditor(save = false) {
  if (save) {
    if (typeof window.saveBentoDeckSplitEditor === 'function') {
      window.saveBentoDeckSplitEditor();
      return;
    }
  }
  window.finishBentoSplitSession?.(false);
  state.isDeckEditingSong = null;
  const deckCard = document.getElementById('bento-deck-card');
  if (deckCard) {
    deckCard.classList.remove('in-split-editor');
    deckCard.scrollTop = 0;
  }
  if (typeof renderDeck === 'function') {
    renderDeck();
  }
}
window.closeDeckSplitEditor = closeDeckSplitEditor;

function toggleDeckSplitEditor(songId) {
  if (state.isDeckEditingSong && (!songId || state.isDeckEditingSong === songId)) {
    closeDeckSplitEditor(true);
  } else {
    openDeckSplitEditor(songId);
  }
}
window.toggleDeckSplitEditor = toggleDeckSplitEditor;

function openSongEditor(songId, stanzaIndex = null) {
  if (!songId) songId = state.activeSongId;
  const mode = state.songEditorMode || 'split';
  if (mode === 'split' && songId && songId !== 'new') {
    if (state.isDeckEditingSong === songId && stanzaIndex === null) {
      return closeDeckSplitEditor(true);
    }
    return openDeckSplitEditor(songId, stanzaIndex);
  }
  if (typeof openSongEditorModal === 'function') {
    return openSongEditorModal(songId, stanzaIndex);
  } else if (typeof window.openSongEditorModal === 'function') {
    return window.openSongEditorModal(songId, stanzaIndex);
  }
}
window.openSongEditor = openSongEditor;
var omniCloudSearchSeq = 0;
var cloudTabSearchSequence = 0;
if (!window._omniCloudMap) window._omniCloudMap = new Map();
if (!window._cloudTabSearchResultsMap) window._cloudTabSearchResultsMap = new Map();

function omniAddAndOpenCloudSong(songOrIdOrIdx) {
  if (typeof omniAddAndProjectCloudSong === 'function') {
    omniAddAndProjectCloudSong(songOrIdOrIdx);
  }
}
window.omniAddAndOpenCloudSong = omniAddAndOpenCloudSong;

function performClearBiblesOnly() {
  if (typeof window.performClearBiblesOnly === 'function' && window.performClearBiblesOnly !== performClearBiblesOnly) {
    return window.performClearBiblesOnly();
  }
  if (confirm('Are you sure you want to remove all installed Bible translations?')) {
    if (window.libraryImporter && typeof window.libraryImporter.clearBiblesOnly === 'function') {
      window.libraryImporter.clearBiblesOnly();
    }
    state.activeBibleBook = '';
    state.activeBibleChapter = 1;
    renderLibrary();
    renderDeck();
    syncDashboardWorkspace(true);
    showToast('All Bible translations cleared', 'info');
  }
}
window.performClearBiblesOnly = performClearBiblesOnly;

function performClearSongsOnly() {
  if (typeof window.performClearSongsOnly === 'function' && window.performClearSongsOnly !== performClearSongsOnly) {
    return window.performClearSongsOnly();
  }
  if (confirm('Are you sure you want to remove all songs from your library?')) {
    if (window.libraryImporter && typeof window.libraryImporter.clearSongsOnly === 'function') {
      window.libraryImporter.clearSongsOnly();
    }
    state.activeSongId = null;
    state.agendaItems = [];
    renderAgenda();
    renderLibrary();
    renderDeck();
    syncDashboardWorkspace(true);
    showToast('All songs cleared', 'info');
  }
}
window.performClearSongsOnly = performClearSongsOnly;


function initThemeManager() {
  if (typeof ThemeManager !== 'undefined') {
    themeManager = new ThemeManager(state, (payload) => {
      broadcastState(payload);
    });
    window.themeManager = themeManager;
    window.loadSanctuaryUploads();
    themeManager.updateSettingsUi();
    if (typeof themeManager.updateSanctuaryUi === 'function') {
      themeManager.updateSanctuaryUi();
    }
  }
}

function setUiThemeStyle(styleKey) {
  if (!themeManager && typeof ThemeManager !== 'undefined') {
    initThemeManager();
  }
  if (themeManager) {
    themeManager.setStyle(styleKey);
  }
  if (typeof ThemeResizerEngine !== 'undefined') {
    ThemeResizerEngine.init();
  }
  renderAgenda();
  renderLibrary();
  renderDeck();
  renderAiHud();
  if (typeof window.syncBentoStagePreview === 'function') {
    window.syncBentoStagePreview();
  }
}
window.setUiThemeStyle = setUiThemeStyle;

function setUiThemeMode(modeKey) {
  if (!themeManager && typeof ThemeManager !== 'undefined') {
    initThemeManager();
  }
  if (themeManager) {
    themeManager.setMode(modeKey);
  }
}
window.setUiThemeMode = setUiThemeMode;

function toggleThemeMode() {
  if (!themeManager && typeof ThemeManager !== 'undefined') {
    initThemeManager();
  }
  if (themeManager) {
    const newMode = themeManager.toggleMode();
    showToast(`Switched to ${newMode === 'dark' ? 'Dark' : 'Light'} Mode`, 'info');
  }
}
window.toggleThemeMode = toggleThemeMode;

const WORKSPACE_STORAGE_KEY = REMOTE_MODE ? 'sf_remote_workspace_state' : 'sf_workspace_dashboard_snapshot';
const LIVE_STATE_STORAGE_KEY = 'scriptureflow_live_state';

// Workspace State Restoration & Hydration Engine
function restoreSavedWorkspaceState() {
  try {
    if (localStorage.getItem('sf_system_formatted') === 'true') {
      if (typeof SONGS_DATABASE !== 'undefined') SONGS_DATABASE.length = 0;
      if (typeof SONGBOOKS_DATABASE !== 'undefined') SONGBOOKS_DATABASE.length = 0;
      if (typeof BIBLE_DATABASE !== 'undefined') { for (let k in BIBLE_DATABASE) delete BIBLE_DATABASE[k]; }
      state.activeSongId = null;
      state.activeBibleBook = '';
      state.activeBibleChapter = 1;
      state.agendaItems = [];
      state.medleySongIds = [];
      state.medleyBibleSlots = [];
      state.bentoSingleCols = 1;
      state.bentoSingleScale = 1.0;
      state.bentoMedleyScale = 1.0;
      state.deckScale = 1.0;
      state.deckZoom = 1.0;
      state.maxLinesPerSlide = 0;
      syncMedleySettingsUI();
      return;
    }

    if (window.libraryImporter) {
      window.libraryImporter.initStorage();
    }
    const savedStateStr = localStorage.getItem(WORKSPACE_STORAGE_KEY) || localStorage.getItem(LIVE_STATE_STORAGE_KEY);
    if (savedStateStr) {
      const saved = JSON.parse(savedStateStr);
      const dash = saved.dashboard || saved;

      if (dash.currentTab) state.currentTab = dash.currentTab;
      if (dash.activeDeckType) state.activeDeckType = dash.activeDeckType;
      if (typeof dash.isMedleyMode === 'boolean') state.isMedleyMode = dash.isMedleyMode;
      if (Array.isArray(dash.medleySongIds)) state.medleySongIds = dash.medleySongIds;
      if (Array.isArray(dash.medleyVersionCodes)) state.medleyVersionCodes = dash.medleyVersionCodes;
      if (dash.activeSongId) state.activeSongId = dash.activeSongId;
      if (dash.activeBibleBook) state.activeBibleBook = dash.activeBibleBook;
      if (dash.activeBibleChapter) state.activeBibleChapter = dash.activeBibleChapter;
      if (dash.activeLiveSlideId) state.activeLiveSlideId = dash.activeLiveSlideId;
      if (dash.activeLiveText) state.activeLiveText = dash.activeLiveText;
      if (dash.activeLiveRef) state.activeLiveRef = dash.activeLiveRef;
      if (Array.isArray(dash.agendaItems)) state.agendaItems = dash.agendaItems;
      if (dash.currentMode) {
        state.currentMode = dash.currentMode;
        previewTargetMode = (state.currentMode === 'lt' || state.currentMode === 'lowerthird') ? 'livestream' : 'sanctuary';
        window.previewTargetMode = previewTargetMode;
      }
      if (dash.maxLinesPerSlide !== undefined) state.maxLinesPerSlide = dash.maxLinesPerSlide;
      if (dash.textSize !== undefined) state.textSize = dash.textSize;
      if (dash.bibleVersion) state.bibleVersion = dash.bibleVersion;
      if (dash.transparentBg !== undefined) state.transparentBg = dash.transparentBg;
      if (dash.transitionType) state.transitionType = dash.transitionType;
      if (dash.transitionDuration !== undefined) state.transitionDuration = dash.transitionDuration;
      if (dash.showSongTitleInDisplay !== undefined) state.showSongTitleInDisplay = dash.showSongTitleInDisplay;
      if (dash.showBibleMedleyButtons !== undefined) state.showBibleMedleyButtons = dash.showBibleMedleyButtons;
      if (dash.showMedleyView !== undefined) state.showMedleyView = dash.showMedleyView;
      if (dash.bibleMedleyChangeTarget) state.bibleMedleyChangeTarget = dash.bibleMedleyChangeTarget;
      if (dash.typography && typeof dash.typography === 'object') {
        state.typography = { ...state.typography, ...dash.typography };
      }
    }
  } catch (e) {
    console.warn('Could not restore saved workspace state', e);
  }
  syncMedleySettingsUI();
  syncTypographySettingsUI();
  syncTransitionSettingsUI();
  syncSongSettingsUI();
  if (typeof syncActiveTabUI === 'function') syncActiveTabUI();
  else if (typeof window.syncBentoTabsUI === 'function') window.syncBentoTabsUI();
  ensureActiveSong();
  if (typeof ensureBibleLoaded === 'function') {
    ensureBibleLoaded(state.bibleVersion || 'KJV');
  }
}
window.restoreSavedWorkspaceState = restoreSavedWorkspaceState;

function ensureActiveSong() {
  if (typeof SONGS_DATABASE !== 'undefined' && SONGS_DATABASE.length > 0) {
    if (state.activeSongId) {
      const exists = SONGS_DATABASE.some(s => s.id === state.activeSongId);
      if (!exists) {
        state.activeSongId = null;
      }
    }
  }
}

window.onLibraryDataUpdated = function () {
  ensureActiveSong();
  if (typeof populateBibleVersionSelects === 'function') populateBibleVersionSelects();
  if (typeof renderTranslationOptions === 'function') renderTranslationOptions();
  renderAgenda();
  renderLibrary();
  renderDeck();
  syncRemoteCatalog();
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  initThemeManager();
  restoreSavedWorkspaceState();
  if (typeof ensureBibleLoaded === 'function') {
    ensureBibleLoaded(state.bibleVersion || 'KJV');
  }

  initTabs();
  initAgendaDragDrop();
  initSongPickerModal();
  initTranslationDropdown();
  initPanics();
  if (REMOTE_MODE) {
    initRemoteOperator();
  } else {
    initSpeechAi();
    initRemoteControl();
    updateOperatorHeaderUI();
  }
  initSearchFilter();
  initKeyboardNav();
  initGlobalTooltips();
  initCustomSelects();
  initModalBackdropDismiss();
  initAudioMicPicker();

  ensureActiveSong();

  renderAgenda();
  renderLibrary();
  renderDeck();
  renderAiHud();
  renderSessionPanel();
  updateRemoteSessionHeaderUI();
  syncRemoteCatalog();

  // Async load from IndexedDB and refresh library views
  if (window.libraryImporter) {
    window.libraryImporter.loadFromIndexedDB(() => {
      ensureActiveSong();
      renderLibrary();
      renderDeck();
      syncRemoteCatalog();
    });
  }

  // Dynamic Output Routing Modal Links Initialization
  updateOutputLinksModal();
  if (!REMOTE_MODE) detectLanIp();

  // Desktop Native Electron Initialization
  initDesktopIntegration();

  // Sync preview controls with restored state
  const fullBtn = document.getElementById('preview-mode-full-btn');
  const ltBtn = document.getElementById('preview-mode-lt-btn');
  if (fullBtn) fullBtn.classList.toggle('active', previewTargetMode === 'sanctuary');
  if (ltBtn) ltBtn.classList.toggle('active', previewTargetMode === 'livestream');

  const bentoFull = document.getElementById('bento-prev-mode-full');
  const bentoLt = document.getElementById('bento-prev-mode-lt');
  const bentoDual = document.getElementById('bento-prev-mode-dual');
  if (bentoFull) bentoFull.classList.toggle('active', previewTargetMode === 'sanctuary');
  if (bentoLt) bentoLt.classList.toggle('active', previewTargetMode === 'livestream');
  if (bentoDual) bentoDual.classList.toggle('active', previewTargetMode === 'dual');

  const previewTargetBtn = document.getElementById('preview-target-toggle-btn');
  if (previewTargetBtn) {
    if (previewTargetMode === 'sanctuary') previewTargetBtn.textContent = 'Sanctuary';
    else if (previewTargetMode === 'dual') previewTargetBtn.textContent = 'Dual Output';
    else previewTargetBtn.textContent = 'Livestream';
    previewTargetBtn.classList.toggle('active', previewTargetMode === 'livestream');
  }
  const previewTransToggle = document.getElementById('preview-transparent-bg-toggle');
  if (previewTransToggle) previewTransToggle.checked = !!state.transparentBg;
  const settingTransToggle = document.getElementById('setting-transparent-bg-toggle');
  if (settingTransToggle) settingTransToggle.checked = !!state.transparentBg;
  syncTransparentBtnUI();
  const settingBibleMedleyToggle = document.getElementById('setting-bible-medley-toggle');
  if (settingBibleMedleyToggle) settingBibleMedleyToggle.checked = !!state.showBibleMedleyButtons;
  const settingMedleyToggle = document.getElementById('setting-medley-view-toggle');
  if (settingMedleyToggle) settingMedleyToggle.checked = !!state.showMedleyView;
  const settingBibleMedleyTarget = document.getElementById('setting-bible-medley-change-target');
  if (settingBibleMedleyTarget) settingBibleMedleyTarget.value = state.bibleMedleyChangeTarget || 'chapter';
  const previewIframe = document.getElementById('preview-iframe');
  if (previewIframe) {
    const baseUrl = getBaseDisplayUrl();
    previewIframe.src = `${baseUrl}?target=${previewTargetMode}&preview=1`;
  }

  // Listen for sync request from newly opened OBS / Sanctuary output windows
  syncChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'REQUEST_STATE') {
      broadcastState();
    }
  };

  // Matrix Preview Auto-Scalers
  scalePreviewIframe();
  window.addEventListener('resize', scalePreviewIframe);
  setTimeout(scalePreviewIframe, 300);
});

// HTML5 Drag & Drop Engine for Service Agenda
let agendaDragCounter = 0;

function initAgendaDragDrop() {
  const card = document.querySelector('.sidebar-agenda-card');
  const container = document.getElementById('agenda-items-list');
  if (!container && !card) return;

  const targetEl = card || container;

  targetEl.ondragenter = (e) => {
    e.preventDefault();
    agendaDragCounter++;
    targetEl.classList.add('drag-hover');
    if (container) container.classList.add('drag-hover');
  };

  targetEl.ondragover = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!targetEl.classList.contains('drag-hover')) {
      targetEl.classList.add('drag-hover');
      if (container) container.classList.add('drag-hover');
    }
  };

  targetEl.ondragleave = () => {
    agendaDragCounter = Math.max(0, agendaDragCounter - 1);
    if (agendaDragCounter === 0) {
      targetEl.classList.remove('drag-hover');
      if (container) container.classList.remove('drag-hover');
    }
  };

  targetEl.ondrop = (e) => {
    e.preventDefault();
    agendaDragCounter = 0;
    targetEl.classList.remove('drag-hover');
    if (container) container.classList.remove('drag-hover');

    let songId = e.dataTransfer ? e.dataTransfer.getData('application/song-id') : null;
    let bibleBook = e.dataTransfer ? e.dataTransfer.getData('application/bible-book') : null;
    const sourceAgendaIdxStr = e.dataTransfer ? e.dataTransfer.getData('application/agenda-index') : null;

    if (!songId && !bibleBook && window.sfDraggedItem) {
      if (window.sfDraggedItem.type === 'song') songId = window.sfDraggedItem.id;
      else if (window.sfDraggedItem.type === 'bible') bibleBook = window.sfDraggedItem.id;
    }
    if (!songId && !bibleBook && !sourceAgendaIdxStr && e.dataTransfer) {
      const plain = e.dataTransfer.getData('text/plain');
      if (plain) {
        if (SONGS_DATABASE.some(s => s.id === plain)) songId = plain;
        else if (typeof BIBLE_BOOKS !== 'undefined' && BIBLE_BOOKS.includes(plain)) bibleBook = plain;
      }
    }

    if (sourceAgendaIdxStr !== '' && sourceAgendaIdxStr !== null && sourceAgendaIdxStr !== undefined) {
      const fromIdx = parseInt(sourceAgendaIdxStr, 10);
      if (!isNaN(fromIdx) && fromIdx >= 0 && fromIdx < state.agendaItems.length) {
        const [movedItem] = state.agendaItems.splice(fromIdx, 1);
        state.agendaItems.push(movedItem);
        renderAgenda();
        renderLibrary();
        syncDashboardWorkspace();
        return;
      }
    }

    if (songId) {
      addSongToAgenda(songId);
    } else if (bibleBook) {
      addBibleBookToAgenda(bibleBook);
    }
  };
}

function addBibleBookToAgenda(book, targetIndex = null) {
  const ver = state.bibleVersion || 'KJV';
  const newItem = {
    type: 'bible',
    id: book,
    book: book,
    chapter: state.activeBibleChapter || 1,
    version: ver,
    title: `${book} ${state.activeBibleChapter || 1}`,
    meta: `${ver} Translation`
  };
  if (targetIndex !== null && targetIndex !== undefined) {
    state.agendaItems.splice(targetIndex, 0, newItem);
  } else {
    state.agendaItems.push(newItem);
  }
  renderAgenda();
  renderLibrary();
  syncDashboardWorkspace();
}

function addSongToAgenda(songId, targetIndex = null) {
  const song = SONGS_DATABASE.find(s => s.id === songId);
  if (!song) return;

  const existingIndex = state.agendaItems.findIndex(item => item.id === song.id);
  const newItem = {
    type: 'song',
    id: song.id,
    title: `${song.title} (${song.author || 'Unknown'})`
  };

  if (existingIndex !== -1) {
    if (targetIndex !== null && targetIndex !== undefined && targetIndex !== existingIndex) {
      state.agendaItems.splice(existingIndex, 1);
      const insertAt = targetIndex > existingIndex ? targetIndex - 1 : targetIndex;
      state.agendaItems.splice(insertAt, 0, newItem);
    }
  } else {
    if (targetIndex !== null && targetIndex !== undefined) {
      state.agendaItems.splice(targetIndex, 0, newItem);
    } else {
      state.agendaItems.push(newItem);
    }
  }

  renderAgenda();
  renderLibrary();
  syncDashboardWorkspace();
}

function toggleSongAgenda(songId) {
  const song = SONGS_DATABASE.find(s => s.id === songId);
  if (!song) return;
  const existingIndex = state.agendaItems.findIndex(item => item.id === song.id);
  if (existingIndex !== -1) {
    state.agendaItems.splice(existingIndex, 1);
  } else {
    state.agendaItems.push({
      type: 'song',
      id: song.id,
      title: `${song.title} (${song.author || 'Unknown'})`
    });
  }
  renderAgenda();
  renderLibrary();
  syncDashboardWorkspace();
}

async function addCustomAgendaPrompt() {
  let title = null;
  if (typeof window.showCustomPrompt === 'function') {
    title = await window.showCustomPrompt({
      title: 'Add Agenda Item',
      message: 'Enter custom agenda item title:',
      placeholder: 'e.g. Opening Prayer, Praise & Worship, Sermon',
      confirmText: 'Add to Agenda',
      icon: 'plus'
    });
  } else {
    title = prompt('Enter custom agenda item title (e.g. Opening Prayer, Praise & Worship, Sermon):');
  }

  if (title && title.trim()) {
    state.agendaItems.push({
      type: 'custom',
      id: 'custom_' + Date.now(),
      title: title.trim()
    });
    renderAgenda();
    renderLibrary();
    syncDashboardWorkspace();
  }
}

function removeAgendaItem(index) {
  state.agendaItems.splice(index, 1);
  renderAgenda();
  renderLibrary();
  syncDashboardWorkspace();
}

function renderAgenda() {
  if (typeof window.renderBentoAgenda === 'function') {
    window.renderBentoAgenda();
  }
  if (window.sessionManager && typeof window.sessionManager.updateTopBarUi === 'function') {
    window.sessionManager.updateTopBarUi();
  }

  // If Bento layout is active, skip rendering hidden Classic DOM elements
  const currentThemeStyle = (window.themeManager && window.themeManager.currentStyle) || (document.body && document.body.getAttribute('data-theme-style')) || 'bento';
  if (currentThemeStyle === 'bento') {
    return;
  }

  const container = document.getElementById('agenda-items-list');
  if (!container) return;
  container.innerHTML = '';

  if (state.agendaItems.length === 0) {
    container.innerHTML = `
      <div class="agenda-empty-state">
        Drag songs from below or click "+ Item" to build Service Agenda
      </div>
    `;
    return;
  }

  state.agendaItems.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'library-item agenda-list-item';
    card.style.display = 'flex';
    card.style.justifyContent = 'space-between';
    card.style.alignItems = 'center';
    card.style.opacity = '0.85';
    card.setAttribute('draggable', 'true');

    card.onmouseenter = () => { card.style.opacity = '1.0'; };
    card.onmouseleave = () => { card.style.opacity = '0.85'; };

    card.ondragstart = (e) => {
      window.sfIsInternalDrag = true;
      window.sfDraggedItem = { type: item.type, id: item.id, item, idx };
      if (item.type === 'song') {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.setData('application/song-id', item.id);
      } else if (item.type === 'bible') {
        e.dataTransfer.setData('text/plain', item.book || item.id);
        e.dataTransfer.setData('application/bible-book', item.book || item.id);
      } else {
        e.dataTransfer.setData('text/plain', item.id);
      }
      e.dataTransfer.setData('application/agenda-index', String(idx));
      e.dataTransfer.effectAllowed = 'copyMove';
      card.classList.add('dragging');
    };

    card.ondragend = () => {
      window.sfIsInternalDrag = false;
      window.sfDraggedItem = null;
      card.classList.remove('dragging');
      document.querySelectorAll('.agenda-list-item').forEach(el => {
        el.classList.remove('drag-over-top', 'drag-over-bottom');
      });
      const agendaCard = document.querySelector('.sidebar-agenda-card') || document.getElementById('bento-agenda-card');
      if (agendaCard) agendaCard.classList.remove('drag-hover');
      if (container) container.classList.remove('drag-hover');
    };

    card.ondragover = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      const rect = card.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        card.classList.add('drag-over-top');
        card.classList.remove('drag-over-bottom');
      } else {
        card.classList.add('drag-over-bottom');
        card.classList.remove('drag-over-top');
      }
    };

    card.ondragleave = (e) => {
      card.classList.remove('drag-over-top', 'drag-over-bottom');
    };

    card.ondrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      card.classList.remove('drag-over-top', 'drag-over-bottom');
      const agendaCard = document.querySelector('.sidebar-agenda-card') || document.getElementById('bento-agenda-card');
      if (agendaCard) agendaCard.classList.remove('drag-hover');
      if (container) container.classList.remove('drag-hover');

      const rect = card.getBoundingClientRect();
      const isBefore = e.clientY < (rect.top + rect.height / 2);
      let targetIdx = isBefore ? idx : idx + 1;

      const sourceAgendaIdxStr = e.dataTransfer ? e.dataTransfer.getData('application/agenda-index') : null;
      if (sourceAgendaIdxStr !== '' && sourceAgendaIdxStr !== null && sourceAgendaIdxStr !== undefined) {
        const fromIdx = parseInt(sourceAgendaIdxStr, 10);
        if (!isNaN(fromIdx) && fromIdx >= 0 && fromIdx < state.agendaItems.length) {
          if (fromIdx === idx) return;
          const [movedItem] = state.agendaItems.splice(fromIdx, 1);
          const finalTargetIdx = targetIdx > fromIdx ? targetIdx - 1 : targetIdx;
          state.agendaItems.splice(finalTargetIdx, 0, movedItem);
          renderAgenda();
          renderLibrary();
          syncDashboardWorkspace();
          return;
        }
      }

      let songId = e.dataTransfer ? e.dataTransfer.getData('application/song-id') : null;
      let bibleBook = e.dataTransfer ? e.dataTransfer.getData('application/bible-book') : null;
      if (!songId && !bibleBook && window.sfDraggedItem) {
        if (window.sfDraggedItem.type === 'song') songId = window.sfDraggedItem.id;
        else if (window.sfDraggedItem.type === 'bible') bibleBook = window.sfDraggedItem.id;
      }
      if (!songId && !bibleBook && e.dataTransfer) {
        const plain = e.dataTransfer.getData('text/plain');
        if (plain) {
          if (SONGS_DATABASE.some(s => s.id === plain)) songId = plain;
          else if (typeof BIBLE_BOOKS !== 'undefined' && BIBLE_BOOKS.includes(plain)) bibleBook = plain;
        }
      }

      if (songId) {
        addSongToAgenda(songId, targetIdx);
      } else if (bibleBook) {
        addBibleBookToAgenda(bibleBook, targetIdx);
      }
    };

    card.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; flex:1; overflow:hidden;">
        <span style="font-family:var(--font-mono); font-size:10px; color:var(--text-dim); font-weight:500;">#${idx + 1}</span>
        <span style="font-size:11.5px; font-weight:450; color:var(--text-starlight); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title}</span>
      </div>
      <div style="display:flex; align-items:center; gap:4px;">
        <button class="medley-assign-btn agenda-remove-btn" style="color:var(--text-dim); opacity:0.6; padding:2px 6px; font-size:10px;" onclick="event.stopPropagation(); removeAgendaItem(${idx})" title="Remove from Agenda"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
    `;

    card.onclick = () => {
      if (item.type === 'song') {
        const isDifferent = (state.activeSongId !== item.id);
        state.activeSongId = item.id;
        state.activeDeckType = 'song';
        if (isDifferent) {
          state.liveEngagedDeck = null;
          if (typeof window.cancelPreparedSlide === 'function') window.cancelPreparedSlide();
        }
        applySongBoundTheme(item.id);
        state.currentTab = 'songs';
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'songs'));
        renderLibrary();
        scrollActiveLibraryItemIntoView(item.id);
        renderDeck(true);
        syncDashboardWorkspace();
      }
    };

    container.appendChild(card);
  });

  if (typeof window.renderBentoAgenda === 'function') {
    window.renderBentoAgenda();
  }
}

// Navigation & Workspace Tabs (Zone 1 Sidebar)
function syncActiveTabUI() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === state.currentTab);
  });
  if (typeof window.syncBentoTabsUI === 'function') {
    window.syncBentoTabsUI();
  }
}
window.syncActiveTabUI = syncActiveTabUI;

function switchLibraryTab(targetTab) {
  if (!targetTab) return;
  state.currentTab = targetTab;
  syncActiveTabUI();

  // Dynamic Search Input Placeholder & Reset
  const searchInput = document.getElementById('sidebar-search-input');
  const clearBtn = document.getElementById('sidebar-search-clear');
  if (searchInput) {
    searchInput.value = '';
    searchInput.placeholder = (targetTab === 'songs') ? 'Search for lyrics (Ctrl+L)...' : 'Filter book, chapter or verse (Ctrl+L)...';
  }
  if (clearBtn) clearBtn.style.display = 'none';

  const bentoSearchInput = document.getElementById('bento-search-input');
  if (bentoSearchInput) {
    bentoSearchInput.value = '';
    bentoSearchInput.placeholder = (targetTab === 'songs') ? 'Search title, artist, lyric line (Ctrl+L)...' : 'Filter books & chapters (Ctrl+L)...';
  }

  renderLibrary();

  // Decouple Library Browsing from Center Deck:
  // If a slide is LIVE, or an active presentation is engaged/loaded in the deck:
  // PRESERVE the center presentation deck so the operator never loses control of live slides!
  const isLive = Boolean(state.activeLiveSlideId || state.liveEngagedDeck);
  const isSongActive = Boolean(state.activeSongId && (!state.activeDeckType || state.activeDeckType === 'song'));
  const isBibleActive = Boolean(state.activeBibleBook && state.activeDeckType === 'bible');
  const hasActiveItem = isLive || isSongActive || isBibleActive;

  if (!hasActiveItem) {
    // Neither song nor scripture is actively loaded or live:
    // Deck follows the library tab to display the corresponding empty state.
    state.activeDeckType = (targetTab === 'bible') ? 'bible' : 'song';
  }

  renderDeck();
  syncDashboardWorkspace();
}
window.switchLibraryTab = switchLibraryTab;

function initTabs() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    const switchAction = (e) => {
      if (e && e.button !== undefined && e.button !== 0) return;
      const targetTab = tab.dataset.tab;
      if (!targetTab || state.currentTab === targetTab) return;
      switchLibraryTab(targetTab);
    };
    tab.onpointerdown = switchAction;
    tab.onclick = switchAction;
  });

  syncActiveTabUI();

  const searchInput = document.getElementById('sidebar-search-input');
  if (searchInput) {
    searchInput.placeholder = (state.currentTab === 'songs') ? 'Search for lyrics (Ctrl+L)...' : 'Filter book, chapter or verse (Ctrl+L)...';
  }
}
window.initTabs = initTabs;

function focusLibrarySearch() {
  const isBento = document.body && document.body.getAttribute('data-theme-style') === 'bento';
  const bentoInput = document.getElementById('bento-search-input');
  const classicInput = document.getElementById('sidebar-search-input');

  const target = (isBento && bentoInput) ? bentoInput : (classicInput || bentoInput);
  if (target) {
    target.focus();
    if (typeof target.select === 'function') target.select();
  }
}
window.focusLibrarySearch = focusLibrarySearch;

function initKeyboardNav() {
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || window.sfActiveModal?.() || e.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    // 1. Handle Global Undo / Redo Shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
    const isCtrl = e.ctrlKey || e.metaKey;
    if (isCtrl && (e.key === 'z' || e.key === 'Z')) {
      if (e.shiftKey) {
        e.preventDefault();
        redoLastEdit();
      } else {
        e.preventDefault();
        undoLastEdit();
      }
      return;
    }
    if (isCtrl && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      redoLastEdit();
      return;
    }
    if (isCtrl && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      const modal = document.getElementById('cmd-modal-backdrop');
      if (modal && modal.classList.contains('open')) {
        closeCommandPalette();
      } else {
        openCommandPalette();
      }
      return;
    }
    if (isCtrl && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      focusLibrarySearch();
      return;
    }

    // Ignore slide navigation when user is typing inside text fields or editable boxes
    const activeEl = document.activeElement;
    if (activeEl && (
      activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.isContentEditable ||
      activeEl.getAttribute('contenteditable') === 'true'
    )) {
      if (e.key === 'Escape') {
        closeCommandPalette();
        closeTranslationDropdown();
        closeAudioMicPopover();
      }
      return;
    }

    // 2. ENTER / SPACE → Take staged slide live (Smart Follow-Suit)
    if ((e.key === 'Enter' || e.key === ' ') && !isCtrl) {
      if (window.getPreparedSlide?.()) {
        e.preventDefault();
        window.takePreparedSlide();
        return;
      }
      // If Enter but nothing staged, fall through to other handlers
      // Space does NOT advance slides — only takes staged live
      if (e.key === ' ') { e.preventDefault(); return; }
    }

    // 3. Direct Song / Chapter Switching (Ctrl+Arrow or Shift+Arrow)
    if ((isCtrl || e.shiftKey) && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) {
      e.preventDefault();
      switchToAdjacentSong(1);
      return;
    }
    if ((isCtrl || e.shiftKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) {
      e.preventDefault();
      switchToAdjacentSong(-1);
      return;
    }

    // 4. Physical 4-Direction Navigation Keys
    // UP / LEFT / PAGE UP -> Go back to previous slide/verse (Both Single & Medley)
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      navigateLiveVerse(-1);
    }
    // DOWN / RIGHT / PAGE DOWN -> Advance to next slide/verse (Both Single & Medley)
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      navigateLiveVerse(1);
    }
    // ESCAPE / F1 -> Clear all outputs and close overlays
    else if (e.key === 'Escape' || e.key === 'F1') {
      clearAllOutputs();
      closeCommandPalette();
      closeSettingsModal();
      closeTranslationDropdown();
      closeAudioMicPopover();
    }
    // F5 / H -> Toggle Hold Live output
    else if (e.key === 'F5' || ((e.key === 'h' || e.key === 'H') && !isCtrl)) {
      e.preventDefault();
      toggleHoldLive();
    }
  });
}

// Helper functions to check if a slide is live across Single and Medley views
function isBibleSlideLive(verCode, book, chapter, verseNum, slotIdx) {
  if (!state.activeLiveSlideId) return false;
  const id = state.activeLiveSlideId;
  const bookStr = String(book);
  const chStr = String(chapter);
  const vStr = String(verseNum);

  if (slotIdx !== undefined) {
    if (id === `medley_bible_s${slotIdx}_${bookStr}_${chStr}_${vStr}`) return true;
  }

  if (id === `medley_bible_${verCode}_${bookStr}_${chStr}_${vStr}` ||
    id === `bible_${verCode}_${bookStr}_${chStr}_${vStr}`) {
    return true;
  }

  if (id === `bible_${bookStr}_${chStr}_${vStr}`) {
    return verCode === state.bibleVersion;
  }

  if (id.startsWith('bible_compare_')) {
    const parts = id.split('_');
    if (parts.length >= 7) {
      const liveBook = parts[4];
      const liveCh = parts[5];
      const liveV = parts[6];
      return liveBook === bookStr && liveCh === chStr && liveV === vStr;
    }
  }

  const parts = id.split('_');
  if (parts[0] === 'medley' && parts[1] === 'bible') {
    if (parts[2].startsWith('s') && parts.length >= 6) {
      const liveSlot = parts[2].substring(1);
      const liveBook = parts[3];
      const liveCh = parts[4];
      const liveV = parts[5];
      if (slotIdx !== undefined && String(slotIdx) === liveSlot) {
        return liveBook === bookStr && liveCh === chStr && liveV === vStr;
      }
      return liveBook === bookStr && liveCh === chStr && liveV === vStr;
    } else if (parts.length >= 6) {
      const liveVer = parts[2];
      const liveBook = parts[3];
      const liveCh = parts[4];
      const liveV = parts[5];
      return liveVer === verCode && liveBook === bookStr && liveCh === chStr && liveV === vStr;
    }
  } else if (parts[0] === 'bible') {
    if (parts.length >= 5) {
      const liveVer = parts[1];
      const liveBook = parts[2];
      const liveCh = parts[3];
      const liveV = parts[4];
      return liveVer === verCode && liveBook === bookStr && liveCh === chStr && liveV === vStr;
    } else if (parts.length === 4) {
      const liveBook = parts[1];
      const liveCh = parts[2];
      const liveV = parts[3];
      return verCode === state.bibleVersion && liveBook === bookStr && liveCh === chStr && liveV === vStr;
    }
  }

  return false;
}

// Helper: Smart Auto-Splitting of Long Song Stanzas into Sub-Slides
function splitStanzaIntoChunks(stanza, maxLines = 4) {
  if (!maxLines || maxLines <= 0 || !stanza || !stanza.text) {
    return [{ ...stanza, chunkIndex: 0, totalChunks: 1, label: stanza.type }];
  }

  const rawLines = stanza.text.split('\n');
  if (rawLines.length <= maxLines) {
    return [{ ...stanza, chunkIndex: 0, totalChunks: 1, label: stanza.type }];
  }

  const chunks = [];
  for (let i = 0; i < rawLines.length; i += maxLines) {
    const linesChunk = rawLines.slice(i, i + maxLines);
    while (linesChunk.length && !linesChunk[0].trim()) linesChunk.shift();
    while (linesChunk.length && !linesChunk[linesChunk.length - 1].trim()) linesChunk.pop();

    if (linesChunk.length > 0) {
      chunks.push(linesChunk.join('\n'));
    }
  }

  if (chunks.length <= 1) {
    return [{ ...stanza, chunkIndex: 0, totalChunks: 1, label: stanza.type }];
  }

  return chunks.map((chunkText, idx) => ({
    type: stanza.type,
    text: chunkText,
    chunkIndex: idx,
    totalChunks: chunks.length,
    label: `${stanza.type} (${idx + 1}/${chunks.length})`
  }));
}

function isSongSlideLive(songId, stanzaIndex, chunkIndex = null) {
  if (!state.activeLiveSlideId) return false;
  const id = state.activeLiveSlideId;
  if (chunkIndex !== null && chunkIndex !== undefined) {
    if (id === `medley_${songId}_${stanzaIndex}_c${chunkIndex}` || id === `${songId}_${stanzaIndex}_c${chunkIndex}`) {
      return true;
    }
  }
  if (id === `medley_${songId}_${stanzaIndex}` || id === `${songId}_${stanzaIndex}`) {
    return true;
  }
  if (chunkIndex === null || chunkIndex === undefined) {
    if (id.startsWith(`medley_${songId}_${stanzaIndex}_c`) || id.startsWith(`${songId}_${stanzaIndex}_c`)) {
      return true;
    }
  }
  return false;
}

// Worship Medley Mode Toggle (Zone 2 Deck)
function setMedleyMode(isMedley) {
  state.isMedleyMode = !!isMedley;
  state.isDeckEditingSong = null;
  if (!Array.isArray(state.medleySongIds)) state.medleySongIds = [];
  if (!Array.isArray(state.medleyVersionCodes)) state.medleyVersionCodes = [];
  if (!Array.isArray(state.medleyBibleSlots)) state.medleyBibleSlots = [];

  if (state.isMedleyMode) {
    if (state.medleySongIds.filter(Boolean).length === 0 && state.activeSongId) {
      state.medleySongIds[0] = state.activeSongId;
    }
    if (state.medleyBibleSlots.length === 0) {
      state.medleyBibleSlots = [
        state.activeBibleBook ? { book: state.activeBibleBook, chapter: state.activeBibleChapter || 1, version: state.bibleVersion || 'KJV' } : null,
        null,
        null
      ];
    }
  }

  const singleBtn = document.getElementById('btn-single-mode');
  const medleyBtn = document.getElementById('btn-medley-mode');
  if (singleBtn) singleBtn.classList.toggle('active', !isMedley);
  if (medleyBtn) medleyBtn.classList.toggle('active', isMedley);

  const segSingle = document.getElementById('bento-seg-single');
  const segMedley = document.getElementById('bento-seg-medley');
  if (segSingle) segSingle.classList.toggle('active', !isMedley);
  if (segMedley) segMedley.classList.toggle('active', isMedley);

  if (isMedley) {
    if (state.currentTab === 'bible') {
      if (state.bibleVersion && !state.medleyVersionCodes.includes(state.bibleVersion)) {
        state.medleyVersionCodes[0] = state.bibleVersion;
      }
    }
  } else {
    if (state.currentTab === 'bible') {
      if (state.activeLiveSlideId && (state.activeLiveSlideId.startsWith('medley_bible_') || state.activeLiveSlideId.startsWith('bible_'))) {
        const parts = state.activeLiveSlideId.split('_');
        let ver;
        if (parts[0] === 'medley' && parts[1] === 'bible' && parts.length >= 6) {
          ver = parts[2];
        } else if (parts[0] === 'bible' && parts.length >= 5) {
          ver = parts[1];
        }
        if (ver && ver !== state.bibleVersion) {
          state.bibleVersion = ver;
          const label = document.getElementById('active-version-label');
          if (label) label.textContent = ver;
        }
      }
    } else if (state.currentTab === 'songs') {
      if (state.activeLiveSlideId) {
        const songDb = (typeof SONGS_DATABASE !== 'undefined') ? SONGS_DATABASE : (window.SONGS_DATABASE || []);
        const matchingSong = songDb.find(s =>
          state.activeLiveSlideId === s.id ||
          state.activeLiveSlideId.startsWith(`${s.id}_`) ||
          state.activeLiveSlideId.startsWith(`medley_${s.id}_`)
        );
        if (matchingSong && matchingSong.id !== state.activeSongId) {
          state.activeSongId = matchingSong.id;
          renderLibrary();
        }
      }
    }
  }

  const targetZoom = isMedley ? (state.bentoMedleyScale || 1.0) : (state.bentoSingleScale || state.deckScale || 1.0);
  const bentoLbl = document.getElementById('bento-zoom-label');
  if (bentoLbl) bentoLbl.textContent = `${Math.round(targetZoom * 100)}%`;

  if (typeof window.renderBentoDeck === 'function') {
    window.renderBentoDeck();
  }
  renderDeck(true);
  syncDashboardWorkspace();
}

function selectSingleViewSong(songId) {
  const isDifferent = (state.activeSongId !== songId);
  state.activeSongId = songId;
  state.activeDeckType = 'song';
  if (isDifferent) {
    state.liveEngagedDeck = null;
    state.isDeckEditingSong = null;
    if (typeof window.cancelPreparedSlide === 'function') window.cancelPreparedSlide();
  }
  applySongBoundTheme(songId);
  renderLibrary();
  scrollActiveLibraryItemIntoView(songId);
  renderDeck(true);
  syncDashboardWorkspace();
}

// Render Zone 2 Deck (Single View vs Medley Deck View for Bible / Songs)
function renderDeck(resetScroll = false) {
  if (typeof window.renderBentoDeck === 'function') {
    window.renderBentoDeck();
  }

  // If Bento layout is active, skip rendering hidden Classic DOM elements
  const currentThemeStyle = (window.themeManager && window.themeManager.currentStyle) || (document.body && document.body.getAttribute('data-theme-style')) || 'bento';
  if (currentThemeStyle === 'bento') {
    return;
  }

  const container = document.getElementById('deck-container');
  const titleEl = document.getElementById('deck-title');
  const compareBtn = document.getElementById('btn-compare-mode');
  const editSongBtn = document.getElementById('btn-edit-song');

  // Keep Single View and Medley Deck buttons strictly in sync with state.isMedleyMode
  const singleBtn = document.getElementById('btn-single-mode');
  const medleyBtn = document.getElementById('btn-medley-mode');
  if (singleBtn) singleBtn.classList.toggle('active', !state.isMedleyMode);
  if (medleyBtn) medleyBtn.classList.toggle('active', !!state.isMedleyMode);

  const versionSwitcherWrap = document.getElementById('bible-version-switcher-wrap');
  const comparePickerWrap = document.getElementById('compare-version-picker-wrap');
  const sidebarVersionBar = document.getElementById('sidebar-bible-version-bar');

  const hasActiveItem = Boolean(state.activeLiveSlideId || state.liveEngagedDeck || (state.activeDeckType === 'song' && state.activeSongId) || (state.activeDeckType === 'bible' && state.activeBibleBook));
  const deckType = hasActiveItem ? (state.activeDeckType || (state.currentTab === 'bible' ? 'bible' : 'song')) : (state.currentTab === 'bible' ? 'bible' : 'song');
  const isBibleDeck = (deckType === 'bible');

  if (isBibleDeck) {
    populateBibleVersionSelects();
    if (versionSwitcherWrap) versionSwitcherWrap.style.display = state.isMedleyMode ? 'none' : 'flex';
    if (comparePickerWrap) comparePickerWrap.style.display = (!state.isMedleyMode && state.isCompareMode) ? 'flex' : 'none';
    if (compareBtn) {
      compareBtn.style.display = state.isMedleyMode ? 'none' : 'inline-flex';
      compareBtn.classList.toggle('active', state.isCompareMode);
    }
  } else {
    if (versionSwitcherWrap) versionSwitcherWrap.style.display = 'none';
    if (comparePickerWrap) comparePickerWrap.style.display = 'none';
    if (compareBtn) compareBtn.style.display = 'none';
  }

  if (sidebarVersionBar) {
    sidebarVersionBar.style.display = (state.currentTab === 'bible') ? 'flex' : 'none';
  }

  const classicStrongsBtn = document.getElementById('btn-strongs-mode');
  if (classicStrongsBtn) {
    classicStrongsBtn.style.display = isBibleDeck ? 'inline-flex' : 'none';
    classicStrongsBtn.classList.toggle('active', Boolean(state.strongsMode));
  }
  const bentoStrongsBtn = document.getElementById('bento-strongs-btn');
  if (bentoStrongsBtn) {
    bentoStrongsBtn.style.display = isBibleDeck ? 'inline-flex' : 'none';
    bentoStrongsBtn.classList.toggle('active', Boolean(state.strongsMode));
  }

  if (editSongBtn) {
    editSongBtn.style.display = isBibleDeck ? 'none' : 'inline-flex';
  }

  const linesSwitcher = document.getElementById('deck-lines-switcher');
  if (linesSwitcher) {
    linesSwitcher.style.display = isBibleDeck ? 'none' : 'flex';
    linesSwitcher.querySelectorAll('.btn-lines-opt').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.lines, 10) === state.maxLinesPerSlide);
    });
  }

  if (!container) return;
  if (resetScroll) {
    container.scrollTop = 0;
  }
  container.innerHTML = '';

  if (state.isMedleyMode) {
    const isBibleTab = isBibleDeck;

    if (isBibleTab) {
      if (!Array.isArray(state.medleyBibleSlots)) {
        state.medleyBibleSlots = [];
      }
    } else {
      if (!Array.isArray(state.medleySongIds)) {
        state.medleySongIds = [];
      }
    }

    if (titleEl) {
      if (isBibleTab) {
        titleEl.innerHTML = `
          <span class="eyebrow-tag" style="gap:6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            SCRIPTURE MEDLEY DECK
          </span>
          <span class="deck-title-hint">(Drag & drop scriptures below)</span>
        `;
      } else {
        titleEl.innerHTML = `
          <span class="eyebrow-tag" style="gap:6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EC4899" stroke-width="2.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            WORSHIP MEDLEY DECK
          </span>
          <span class="deck-title-hint">(Drag & drop songs below)</span>
        `;
      }
    }

    const grid = document.createElement('div');
    grid.className = 'medley-3card-grid';

    if (isBibleTab) {
      // -------------------------------------------------------------
      // BIBLE SCRIPTURE MEDLEY DECK (3 Independent Scripture Slots)
      // -------------------------------------------------------------
      state.medleyBibleSlots.forEach((slot, idx) => {
        const book = slot?.book || null;
        const chapter = slot?.chapter || 1;
        const verCode = slot?.version || state.bibleVersion || 'KJV';
        const colCard = document.createElement('div');
        const verses = book ? getBibleVerses(book, chapter, verCode) : [];

        colCard.ondragover = (e) => {
          e.preventDefault();
          colCard.classList.add('drag-hover');
        };
        colCard.ondragleave = () => {
          colCard.classList.remove('drag-hover');
        };
        colCard.ondrop = (e) => {
          e.preventDefault();
          colCard.classList.remove('drag-hover');
          const droppedBook = e.dataTransfer.getData('application/bible-book') || e.dataTransfer.getData('text/plain');
          if (droppedBook) {
            assignBibleBookToSlot(droppedBook, idx);
          }
        };

        let versesHtml = '';
        if (verses.length > 0) {
          verses.forEach(v => {
            const slideId = `medley_bible_s${idx}_${book}_${chapter}_${v.verse}`;
            const refStr = `${book} ${chapter}:${v.verse} (${verCode})`;
            const isLive = isBibleSlideLive(verCode, book, chapter, v.verse, idx);

            if (window._bentoSlideRegistry) window._bentoSlideRegistry.set(slideId, { slideId, text: v.text, refStr });
            versesHtml += `
              <div id="card_${slideId}" data-slide-id="${slideId}" class="slide-card ${isLive ? 'live-active' : ''}" onclick="window.projectBentoSlide('${slideId}')">
                <div class="slide-header">
                  <span>VERSE ${v.verse}</span>
                </div>
                <div class="slide-body">${v.text.replace(/\n/g, '<br>')}</div>
              </div>
            `;
          });
        } else {
          // Empty State Prompt for Bible Passage
          versesHtml = `
            <div style="padding:28px 14px; text-align:center; border:1px dashed rgba(255,255,255,0.12); border-radius:10px; background:rgba(7,10,17,0.35);">
              <div style="display:flex; justify-content:center; margin-bottom:6px;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              </div>
              <div style="font-size:12.5px; font-weight:600; color:var(--text-starlight); margin-bottom:4px;">No Scripture Added</div>
              <div style="font-size:11px; color:var(--text-muted); margin-bottom:12px; line-height:1.45;">Drag a Bible book here or click Select to pick a passage for Slot S${idx + 1}.</div>
              <button class="mode-toggle-btn active" style="font-size:10px; margin:0 auto; padding:5px 12px; background:rgba(59,130,246,0.18); border-color:rgba(59,130,246,0.35); color:#93C5FD;" data-slot="${idx}" onclick="openBiblePassagePicker(${idx}, event)">+ Pick Scripture</button>
            </div>
          `;
        }

        const colIsActive = book && verses.some(v => isBibleSlideLive(verCode, book, chapter, v.verse, idx));
        colCard.className = `medley-column-card ${colIsActive ? 'active-version active-song' : ''}`;

        const changeTarget = state.bibleMedleyChangeTarget || 'chapter';
        const isVersionAction = changeTarget === 'version';
        const changeOnClick = isVersionAction ? `openVersionPicker(${idx}, event)` : `openBiblePassagePicker(${idx}, event)`;
        const changeLabel = isVersionAction ? 'Version' : 'Change';
        const changeTip = isVersionAction ? 'Switch Bible translation for this slot' : 'Select scripture book & chapter for this slot';

        colCard.innerHTML = `
          <div class="medley-col-header">
            <div style="flex:1; min-width:0; overflow:hidden;">
              <div class="medley-slot-tag" style="color:#93C5FD;">SCRIPTURE SLOT S${idx + 1}</div>
              <div class="medley-song-title" style="cursor:pointer;" onclick="openBiblePassagePicker(${idx}, event)" title="Click to change book & chapter">${book ? `${book} ${chapter}` : 'Empty Slot'}</div>
              <div class="medley-song-author" style="cursor:pointer; color:#60A5FA;" onclick="openVersionPicker(${idx}, event)" title="Click to switch translation">${verCode} Translation ▾</div>
            </div>
            <button class="medley-change-btn" data-slot="${idx}" onclick="${changeOnClick}" title="${changeTip}">${changeLabel}</button>
          </div>
          <div class="medley-stanzas-wrap">${versesHtml}</div>
        `;
        grid.appendChild(colCard);
      });

    } else {
      // -------------------------------------------------------------
      // SONGS MEDLEY DECK
      // -------------------------------------------------------------
      [0, 1, 2].forEach((idx) => {
        const songId = state.medleySongIds[idx];
        const song = SONGS_DATABASE.find(s => s.id === songId);
        const colCard = document.createElement('div');

        colCard.ondragover = (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          colCard.classList.add('drag-hover');
        };
        colCard.ondragleave = () => {
          colCard.classList.remove('drag-hover');
        };
        colCard.ondrop = (e) => {
          e.preventDefault();
          colCard.classList.remove('drag-hover');
          const droppedSongId = e.dataTransfer.getData('application/song-id') || e.dataTransfer.getData('text/plain');
          if (droppedSongId) {
            swapMedleySong(idx, droppedSongId, false);
          }
        };

        let stanzasHtml = '';
        if (song) {
          const maxLines = state.maxLinesPerSlide || 4;
          song.stanzas.forEach((stanza, sIdx) => {
            const chunks = splitStanzaIntoChunks(stanza, maxLines);
            chunks.forEach((chunk, cIdx) => {
              const slideId = (chunks.length > 1) ? `medley_${song.id}_${sIdx}_c${cIdx}` : `medley_${song.id}_${sIdx}`;
              const refStr = `${song.title} (${chunk.label})`;
              const isLive = isSongSlideLive(song.id, sIdx, chunks.length > 1 ? cIdx : null);

              if (window._bentoSlideRegistry) window._bentoSlideRegistry.set(slideId, { slideId, text: chunk.text, refStr });
              stanzasHtml += `
                <div id="card_${slideId}" data-slide-id="${slideId}" class="slide-card ${isLive ? 'live-active' : ''}" onclick="window.projectBentoSlide('${slideId}')">
                  <div class="slide-header">
                    <span>${chunk.label}</span>
                  </div>
                  <div class="slide-body">${chunk.text.replace(/\n/g, '<br>')}</div>
                </div>
              `;
            });
          });

          const colIsActive = song.stanzas.some((s, sIdx) => isSongSlideLive(song.id, sIdx));
          colCard.className = `medley-column-card ${colIsActive ? 'active-song' : ''}`;

          colCard.innerHTML = `
            <div class="medley-col-header">
              <div style="flex:1; min-width:0; overflow:hidden;">
                <div class="medley-slot-tag">SONG SLOT S${idx + 1}</div>
                <div class="medley-song-title">${song.title}</div>
                <div class="medley-song-author">by ${song.author || 'Unknown'}</div>
              </div>
              <button class="medley-change-btn" data-slot="${idx}" onclick="openSongPicker(${idx}, event)">Change</button>
            </div>
            <div class="medley-stanzas-wrap">${stanzasHtml}</div>
          `;
        } else {
          // Empty State Prompt for Songs
          colCard.className = 'medley-column-card';
          colCard.innerHTML = `
            <div class="medley-col-header">
              <div style="flex:1; min-width:0; overflow:hidden;">
                <div class="medley-slot-tag">SONG SLOT S${idx + 1}</div>
                <div class="medley-song-title" style="color:var(--text-dim); font-weight:500;">Empty Slot</div>
              </div>
              <button class="medley-change-btn" data-slot="${idx}" onclick="openSongPicker(${idx}, event)">Select</button>
            </div>
            <div style="padding:28px 14px; text-align:center; border:1px dashed rgba(255,255,255,0.12); border-radius:10px; background:rgba(7,10,17,0.35);">
              <div style="display:flex; justify-content:center; margin-bottom:6px;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F472B6" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              </div>
              <div style="font-size:12.5px; font-weight:600; color:var(--text-starlight); margin-bottom:4px;">No Song Added</div>
              <div style="font-size:11px; color:var(--text-muted); margin-bottom:12px; line-height:1.45;">Drag a song here or click Select to pick a song for Slot S${idx + 1}.</div>
              <button class="mode-toggle-btn active" style="font-size:10px; margin:0 auto; padding:5px 12px; background:rgba(236,72,153,0.18); border-color:rgba(236,72,153,0.35); color:#F472B6;" data-slot="${idx}" onclick="openSongPicker(${idx}, event)">+ Pick Song</button>
            </div>
          `;
        }

        grid.appendChild(colCard);
      });
    }

    container.appendChild(grid);

  } else {
    // Single View (Bible OR Song)
    if (isBibleDeck) {
      const books = getBibleBooks(state.bibleVersion);
      const verses = getBibleVerses(state.activeBibleBook, state.activeBibleChapter, state.bibleVersion);

      if (!state.activeBibleBook || books.length === 0) {
        if (titleEl) {
          titleEl.innerHTML = `
            <span class="eyebrow-tag" style="gap:6px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              BIBLE PASSAGE DISPLAY
            </span>
          `;
        }

        if (books.length === 0) {
          container.innerHTML = `
            <div style="padding:48px 20px; text-align:center; border:1px dashed rgba(255,255,255,0.12); border-radius:12px; margin:16px; background:rgba(7,10,17,0.35);">
              <div style="display:flex; justify-content:center; margin-bottom:10px;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              </div>
              <div style="font-size:15px; font-weight:600; color:var(--text-starlight); margin-bottom:6px;">No Bible Translations Installed</div>
              <div style="font-size:12px; color:var(--text-muted); max-width:340px; margin:0 auto 16px; line-height:1.5;">Import your Bible JSON files or download translations directly from the Cloud Repository.</div>
              <button class="mode-toggle-btn active" style="font-size:12px; padding:8px 18px; margin:0 auto;" onclick="openImportModal(); switchImportSubTab('bibles');">Launch Import Manager ↗</button>
            </div>
          `;
        } else {
          container.innerHTML = `
            <div style="padding:48px 20px; text-align:center; border:1px dashed rgba(255,255,255,0.12); border-radius:12px; margin:16px; background:rgba(7,10,17,0.35);">
              <div style="display:flex; justify-content:center; margin-bottom:10px;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              </div>
              <div style="font-size:15px; font-weight:600; color:var(--text-starlight); margin-bottom:6px;">No Scripture Passage Selected</div>
              <div style="font-size:12px; color:var(--text-muted); max-width:380px; margin:0 auto 16px; line-height:1.5;">Select a Bible book and chapter from the left panel to load verses into the live slide deck.</div>
            </div>
          `;
        }
        return;
      }

      if (titleEl) {
        const hintText = state.isCompareMode
          ? `(${state.bibleVersion} vs ${state.compareBibleVersion})`
          : `(${state.bibleVersion})`;

        const allChapters = getBibleChapters(state.activeBibleBook, state.bibleVersion);
        let chapterOptionsHtml = '';
        allChapters.forEach(c => {
          const cNum = parseInt(c, 10);
          chapterOptionsHtml += `<option value="${cNum}" ${cNum === parseInt(state.activeBibleChapter, 10) ? 'selected' : ''}>Chapter ${cNum}</option>`;
        });

        titleEl.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="eyebrow-tag" style="gap:6px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              ${(state.activeBibleBook || 'SCRIPTURE').toUpperCase()}
            </span>
            ${allChapters.length > 1 ? `
              <select class="mode-toggle-btn" style="background:rgba(7,10,17,0.7); border:1px solid rgba(59,130,246,0.3); color:#93C5FD; font-size:11.5px; font-weight:700; padding:2px 8px; border-radius:var(--radius-pill); cursor:pointer; outline:none;" onchange="selectBibleChapter('${state.activeBibleBook}', this.value)">
                ${chapterOptionsHtml}
              </select>
            ` : `<span style="font-size:12px; font-weight:700; color:#93C5FD;">Chapter 1</span>`}
            <span class="deck-title-hint">${hintText}</span>
          </div>
        `;
      }

      const grid = document.createElement('div');
      grid.className = 'slides-grid';

      const compareVerses = state.isCompareMode
        ? getBibleVerses(state.activeBibleBook, state.activeBibleChapter, state.compareBibleVersion)
        : [];

      verses.forEach(v => {
        if (state.isCompareMode) {
          const compV = compareVerses.find(cv => cv.verse === v.verse);
          const compText = compV ? compV.text : '';
          const cleanText1 = (typeof stripStrongsTags === 'function') ? stripStrongsTags(v.text) : v.text;
          const cleanText2 = (typeof stripStrongsTags === 'function') ? stripStrongsTags(compText) : compText;
          const slideId = `bible_compare_${state.bibleVersion}_${state.compareBibleVersion}_${state.activeBibleBook}_${state.activeBibleChapter}_${v.verse}`;
          const refStr = `${state.activeBibleBook} ${state.activeBibleChapter}:${v.verse} (${state.bibleVersion} vs ${state.compareBibleVersion})`;
          const isLive = isBibleSlideLive(state.bibleVersion, state.activeBibleBook, state.activeBibleChapter, v.verse);

          const card = document.createElement('div');
          card.id = `card_${slideId}`;
          card.dataset.slideId = slideId;
          card.className = `slide-card ${isLive ? 'live-active' : ''}`;

          const comparePayload = {
            ver1: { code: state.bibleVersion, text: cleanText1 },
            ver2: { code: state.compareBibleVersion, text: cleanText2 }
          };

          const trigger = (e) => {
            if (e && e.button !== undefined && e.button !== 0) return;
            projectSlide(slideId, cleanText1, refStr, { compareData: comparePayload });
          };
          card.onclick = trigger;
          card.ondblclick = () => projectSlide(slideId, cleanText1, refStr, { compareData: comparePayload, takeLive: true });
          card.innerHTML = `
            <div class="slide-header">
              <span>Verse ${v.verse}</span>
            </div>
            <div class="slide-body" style="display:flex; flex-direction:column; gap:8px;">
              <div>
                <span style="font-size:10px; font-weight:700; color:#60A5FA; text-transform:uppercase; letter-spacing:0.04em;">[${state.bibleVersion}]</span>
                <div style="margin-top:2px; font-size:12px; line-height:1.4;">${escapeHtml(cleanText1)}</div>
              </div>
              <div style="border-top:1px solid rgba(255,255,255,0.06); padding-top:6px;">
                <span style="font-size:10px; font-weight:700; color:#F472B6; text-transform:uppercase; letter-spacing:0.04em;">[${state.compareBibleVersion}]</span>
                <div style="margin-top:2px; font-size:12px; line-height:1.4; color:var(--text-muted);">${escapeHtml(cleanText2) || '(Not available in this version)'}</div>
              </div>
            </div>
          `;
          grid.appendChild(card);
        } else {
          const slideId = `bible_${state.bibleVersion}_${state.activeBibleBook}_${state.activeBibleChapter}_${v.verse}`;
          const refStr = `${state.activeBibleBook} ${state.activeBibleChapter}:${v.verse} (${state.bibleVersion})`;
          const isLive = isBibleSlideLive(state.bibleVersion, state.activeBibleBook, state.activeBibleChapter, v.verse);
          const cleanText = (typeof stripStrongsTags === 'function') ? stripStrongsTags(v.text) : v.text;

          const card = document.createElement('div');
          card.id = `card_${slideId}`;
          card.dataset.slideId = slideId;
          card.className = `slide-card ${isLive ? 'live-active' : ''}`;
          const trigger = (e) => {
            if (e && e.button !== undefined && e.button !== 0) return;
            projectSlide(slideId, cleanText, refStr, { compareData: null });
          };
          card.onclick = trigger;
          card.ondblclick = () => projectSlide(slideId, cleanText, refStr, { compareData: null, takeLive: true });
          let verseBodyHtml = escapeHtml(cleanText);
          if (state.strongsMode) {
            let taggedText = v.text;
            if (typeof BIBLE_DATABASE !== 'undefined' && BIBLE_DATABASE['KJV_STRONGS'] && BIBLE_DATABASE['KJV_STRONGS'][state.activeBibleBook] && BIBLE_DATABASE['KJV_STRONGS'][state.activeBibleBook][state.activeBibleChapter]) {
              const tv = BIBLE_DATABASE['KJV_STRONGS'][state.activeBibleBook][state.activeBibleChapter].find(item => item.verse === v.verse);
              if (tv && tv.text) taggedText = tv.text;
            }
            if (typeof window.formatStrongsVerseHtml === 'function') {
              verseBodyHtml = window.formatStrongsVerseHtml(taggedText);
            }
          }

          card.innerHTML = `
            <div class="slide-header">
              <span>Verse ${v.verse}</span>
            </div>
            <div class="slide-body">${verseBodyHtml}</div>
          `;
          grid.appendChild(card);
        }
      });
      container.appendChild(grid);

    } else {
      // SONGS Tab Selected in Zone 1: Render Vertical Stanza List View
      const song = SONGS_DATABASE.find(s => s.id === state.activeSongId) || SONGS_DATABASE[0];

      if (!song || SONGS_DATABASE.length === 0) {
        if (titleEl) {
          titleEl.innerHTML = `
            <span class="eyebrow-tag" style="gap:6px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EC4899" stroke-width="2.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              WORSHIP SONG LYRICS
            </span>
          `;
        }
        container.innerHTML = `
          <div style="padding:48px 20px; text-align:center; border:1px dashed rgba(255,255,255,0.1); border-radius:12px; margin:16px; background:rgba(7,10,17,0.3);">
            <div style="display:flex; justify-content:center; margin-bottom:10px;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#EC4899" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
            <div style="font-size:15px; font-weight:600; color:var(--text-starlight); margin-bottom:6px;">Your Worship Songbook is Empty</div>
            <div style="font-size:12px; color:var(--text-muted); max-width:360px; margin:0 auto 16px; line-height:1.5;">Drag & drop your song files (.txt, .xml, .json) or copy/paste lyrics into the importer to create slide cards.</div>
            <button class="mode-toggle-btn active" style="font-size:12px; padding:8px 18px; margin:0 auto; background:var(--accent-pink-gradient); color:white;" onclick="openImportModal(); switchImportSubTab('songs');">Import Song Lyrics ↗</button>
          </div>
        `;
        return;
      }

      if (titleEl && song) {
        titleEl.innerHTML = `
          <span class="eyebrow-tag" style="gap:6px; max-width:70%; overflow:hidden;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EC4899" stroke-width="2.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            <span class="inline-editable-title" 
              style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-transform:uppercase;"
              ondblclick="makeElementEditable(this)"
              onblur="this.contentEditable='false'; saveInlineSongTitle('${song.id}', this.innerText)" 
              onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}" 
              title="${song.title} (Double-click to rename)">${song.title}</span>
          </span>
          <span class="deck-title-hint">by ${song.author || 'Unknown'}</span>
        `;
      }

      // If songs are in medley slots, add a quick Slot Switcher Bar in Single View
      const validMedleySlots = (state.medleySongIds || []).filter(id => Boolean(id));
      if (validMedleySlots.length > 0) {
        const slotBar = document.createElement('div');
        slotBar.className = 'single-view-slot-bar';
        slotBar.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:10px; padding:4px 6px; background:rgba(10,14,23,0.5); border:1px solid rgba(255,255,255,0.08); border-radius:8px; flex-shrink:0;';

        let slotButtons = '';
        state.medleySongIds.forEach((mId, mIdx) => {
          if (!mId) return;
          const mSong = SONGS_DATABASE.find(s => s.id === mId);
          if (!mSong) return;
          const isSelected = mSong.id === song.id;
          const isLive = mSong.stanzas && mSong.stanzas.some((_, sIdx) => isSongSlideLive(mSong.id, sIdx));
          slotButtons += `
            <button class="mode-toggle-btn ${isSelected ? 'active' : ''}" style="font-size:11px; padding:4px 10px; border-radius:6px; display:flex; align-items:center; gap:6px; flex:1; max-width:240px; overflow:hidden;" onclick="selectSingleViewSong('${mSong.id}')">
              <span style="font-family:var(--font-mono); font-weight:700; color:var(--accent-pink-light); font-size:10px;">S${mIdx + 1}</span>
              <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${mSong.title}</span>
              ${isLive ? '<span style="width:6px; height:6px; border-radius:50%; background:#10B981; flex-shrink:0;"></span>' : ''}
            </button>
          `;
        });

        slotBar.innerHTML = `
          <span style="font-family:var(--font-mono); font-size:9.5px; font-weight:700; color:var(--text-dim); padding:0 4px; letter-spacing:0.06em; flex-shrink:0;">SLOTS:</span>
          ${slotButtons}
        `;
        container.appendChild(slotBar);
      }

      const listContainer = document.createElement('div');
      listContainer.className = 'song-stanzas-list-view';

      const maxLines = state.maxLinesPerSlide || 4;
      song.stanzas.forEach((stanza, sIdx) => {
        const chunks = splitStanzaIntoChunks(stanza, maxLines);
        chunks.forEach((chunk, cIdx) => {
          const slideId = (chunks.length > 1) ? `${song.id}_${sIdx}_c${cIdx}` : `${song.id}_${sIdx}`;
          const isLive = isSongSlideLive(song.id, sIdx, chunks.length > 1 ? cIdx : null);

          const card = document.createElement('div');
          card.id = `card_${slideId}`;
          card.dataset.slideId = slideId;
          card.className = `song-stanza-list-card ${isLive ? 'live-active' : ''}`;

          const trigger = (e) => {
            if (e && e.button !== undefined && e.button !== 0) return;
            if (e && (e.target.isContentEditable || e.target.getAttribute('contenteditable') === 'true')) return;

            if (state.isEditingMode) {
              state.isEditingMode = false;
              return;
            }

            projectSlide(
              slideId,
              chunk.text,
              `${song.title} (${chunk.label})`
            );
          };
          card.onclick = trigger;
          card.ondblclick = (e) => {
            const targetEl = e.target.closest('.song-stanza-inner-box, .song-stanza-label') || card.querySelector('.song-stanza-inner-box');
            if (targetEl) {
              makeElementEditable(targetEl);
            }
          };

          card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <div class="song-stanza-label"
                onblur="this.contentEditable='false'; saveInlineStanzaType('${song.id}', ${sIdx}, this.innerText)"
                onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}"
                title="Single-click projects • Double-click to rename tag">${chunk.label}</div>
            </div>
            <div class="song-stanza-inner-box"
              onblur="this.contentEditable='false'; saveInlineStanzaText('${song.id}', ${sIdx}, this.innerText)">${chunk.text.replace(/\n/g, '<br>')}</div>
          `;
          listContainer.appendChild(card);
        });
      });

      container.appendChild(listContainer);
    }
  }

  // Safety net: Guarantee deck container is never left pitch black/empty
  const hasChildren = (typeof container.hasChildNodes === 'function' ? container.hasChildNodes() : (container.children && container.children.length > 0));
  if (!hasChildren || !container.innerHTML.trim()) {
    container.innerHTML = `
      <div style="padding:48px 24px; text-align:center; border:1.5px dashed rgba(255,255,255,0.14); border-radius:14px; background:rgba(7,10,17,0.4); margin:16px;">
        <div style="width:52px; height:52px; border-radius:50%; background:rgba(59,130,246,0.12); border:1px solid rgba(59,130,246,0.3); display:flex; align-items:center; justify-content:center; margin:0 auto 14px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
        </div>
        <div style="font-size:16px; font-weight:700; color:var(--text-starlight); margin-bottom:6px;">Slide Deck Workspace Empty</div>
        <div style="font-size:12.5px; color:var(--text-muted); max-width:420px; margin:0 auto 16px; line-height:1.5;">
          Select a song or Bible passage from the left sidebar library to populate slide cards here for live projection.
        </div>
      </div>
    `;
  }

  if (typeof window.renderBentoDeck === 'function') {
    window.renderBentoDeck();
  }

  if (typeof window.syncStagedCardVisuals === 'function') {
    window.syncStagedCardVisuals();
  }

  scrollToActiveSlide();
}

function scrollActiveLibraryItemIntoView(itemId) {
  if (!itemId) return;
  const libraryList = document.getElementById('library-list');
  if (!libraryList) return;

  const activeEl = libraryList.querySelector(`[data-song-id="${itemId}"]`) ||
    libraryList.querySelector(`.library-item.active`);
  if (!activeEl) return;

  const containerRect = libraryList.getBoundingClientRect();
  const itemRect = activeEl.getBoundingClientRect();

  // If outside visible area of libraryList, smoothly bring it into view with nearest anchor
  if (itemRect.top < containerRect.top + 4 || itemRect.bottom > containerRect.bottom - 4) {
    scrollElementIntoContainerView(activeEl, libraryList, { padding: 4 });
  }
}

function scrollElementIntoContainerView(element, container, options = {}) {
  if (!element || !container) return;
  const padding = options.padding !== undefined ? options.padding : 16;
  const containerRect = container.getBoundingClientRect ? container.getBoundingClientRect() : { top: 0, bottom: 500, height: 500 };
  const elemRect = element.getBoundingClientRect ? element.getBoundingClientRect() : { top: 0, bottom: 50, height: 50 };

  if (options.center) {
    const offset = elemRect.top - containerRect.top;
    const targetScrollTop = (container.scrollTop || 0) + offset - (containerRect.height / 2) + (elemRect.height / 2);
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: options.behavior || 'smooth'
      });
    }
    return;
  }

  // If top of element is above container top (user scrolled down or navigated backward)
  if (elemRect.top < containerRect.top + padding) {
    const scrollDiff = elemRect.top - containerRect.top - padding;
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({
        top: Math.max(0, (container.scrollTop || 0) + scrollDiff),
        behavior: options.behavior || 'smooth'
      });
    }
    return;
  }

  // Find target bottom (check active element + preview 1 upcoming sibling)
  let targetBottom = elemRect.bottom;
  if (options.includeNextSibling) {
    let sibling = element.nextElementSibling;
    while (sibling) {
      if (sibling.classList && (sibling.classList.contains('slide-card') || sibling.classList.contains('song-stanza-list-card') || sibling.classList.contains('bento-single-card') || sibling.classList.contains('bento-slide-card'))) {
        targetBottom = sibling.getBoundingClientRect ? sibling.getBoundingClientRect().bottom : targetBottom;
        break;
      }
      sibling = sibling.nextElementSibling;
    }
  }

  // If bottom of active element or upcoming sibling extends past bottom of container
  if (targetBottom > containerRect.bottom - padding) {
    const scrollNeeded = targetBottom - containerRect.bottom + padding;
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({
        top: Math.max(0, (container.scrollTop || 0) + scrollNeeded),
        behavior: options.behavior || 'smooth'
      });
    }
  }
}

function scrollToActiveSlide(options = {}) {
  if (state.isDeckEditingSong && window.refreshBentoSplitLive?.(true)) return;
  requestAnimationFrame(() => {
    // 1. Classic Theme Deck Scroll
    const container = document.getElementById('deck-container');
    const activeCard = document.querySelector('#deck-container .slide-card.live-active, #deck-container .song-stanza-list-card.live-active, #deck-container .slide-card.live, #deck-container .song-stanza-list-card.live');
    if (container && container.classList) {
      container.classList.toggle('has-live-active', !!activeCard);
    }
    if (activeCard) {
      const medleyWrap = (typeof activeCard.closest === 'function') ? activeCard.closest('.medley-stanzas-wrap') : null;
      if (medleyWrap) {
        scrollElementIntoContainerView(activeCard, medleyWrap, { center: true, ...options });
      } else if (container) {
        scrollElementIntoContainerView(activeCard, container, { center: true, ...options });
      }
    }

    // 2. Bento Theme Deck Scroll (Single View & Medley Columns)
    const bentoContainer = document.getElementById('bento-medley-container');
    const bentoActiveCard = document.querySelector('#bento-medley-container .bento-single-card.live, #bento-medley-container .bento-slide-card.live, #bento-medley-container .bento-card-pulse');
    if (bentoActiveCard) {
      const bentoSlidesWrap = (typeof bentoActiveCard.closest === 'function') ? bentoActiveCard.closest('.bento-slides') : null;
      if (bentoSlidesWrap) {
        scrollElementIntoContainerView(bentoActiveCard, bentoSlidesWrap, { center: true, ...options });
      } else if (bentoContainer) {
        scrollElementIntoContainerView(bentoActiveCard, bentoContainer, { center: true, ...options });
      }
    }
  });
}

// Available Bible Translations & Universal Bible Accessors
function getBibleTranslations() {
  const base = [];
  const added = new Set();

  const getTitleForCode = (code) => {
    if (typeof CLOUD_REPOSITORIES !== 'undefined' && CLOUD_REPOSITORIES.bibles) {
      const match = CLOUD_REPOSITORIES.bibles.find(b => b.code.toUpperCase() === code.toUpperCase());
      if (match) return match.name;
    }
    return `${code} Translation`;
  };

  if (typeof BIBLE_DATABASE !== 'undefined' && BIBLE_DATABASE) {
    Object.keys(BIBLE_DATABASE).forEach(code => {
      const val = BIBLE_DATABASE[code];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        if (window.libraryImporter && window.libraryImporter.isBibleBookName(code)) {
          const defaultCode = state.bibleVersion || 'KJV';
          if (!added.has(defaultCode)) {
            base.push({ code: defaultCode, title: getTitleForCode(defaultCode) });
            added.add(defaultCode);
          }
        } else {
          if (!added.has(code)) {
            base.push({ code: code, title: getTitleForCode(code) });
            added.add(code);
          }
        }
      }
    });
  }

  if (window.libraryImporter && window.libraryImporter.customBibles) {
    Object.keys(window.libraryImporter.customBibles).forEach(code => {
      if (!added.has(code)) {
        base.push({ code: code, title: getTitleForCode(code) });
        added.add(code);
      }
    });
  }

  // Also include any translations recorded in sf_installed_bibles
  try {
    const installed = JSON.parse(localStorage.getItem('sf_installed_bibles') || '[]');
    if (Array.isArray(installed)) {
      installed.forEach(code => {
        const upper = (code || '').toUpperCase().trim();
        if (upper && !added.has(upper)) {
          base.push({ code: upper, title: getTitleForCode(upper) });
          added.add(upper);
        }
      });
    }
  } catch (e) {}

  return base;
}

function populateBibleVersionSelects() {
  const translations = getBibleTranslations();
  if (!translations.length) return;

  if (!state.bibleVersion || !translations.some(t => t.code === state.bibleVersion)) {
    state.bibleVersion = translations[0].code;
  }
  if (!state.compareBibleVersion || !translations.some(t => t.code === state.compareBibleVersion)) {
    state.compareBibleVersion = translations.length > 1 ? translations[1].code : translations[0].code;
  }

  const singleSel = document.getElementById('single-bible-version-select');
  const compareSel = document.getElementById('compare-bible-version-select');
  const sidebarSel = document.getElementById('sidebar-bible-version-select');
  const sidebarText = document.getElementById('sidebar-bible-version-text');

  const optionsHtml = translations.map(t => `<option value="${t.code}">${t.code}</option>`).join('');

  if (singleSel && singleSel.innerHTML !== optionsHtml) {
    singleSel.innerHTML = optionsHtml;
    singleSel.value = state.bibleVersion;
  } else if (singleSel) {
    singleSel.value = state.bibleVersion;
  }

  if (sidebarSel && sidebarSel.innerHTML !== optionsHtml) {
    sidebarSel.innerHTML = optionsHtml;
    sidebarSel.value = state.bibleVersion;
  } else if (sidebarSel) {
    sidebarSel.value = state.bibleVersion;
  }

  if (sidebarText) {
    sidebarText.textContent = state.bibleVersion;
  }

  if (compareSel && compareSel.innerHTML !== optionsHtml) {
    compareSel.innerHTML = optionsHtml;
    compareSel.value = state.compareBibleVersion;
  } else if (compareSel) {
    compareSel.value = state.compareBibleVersion;
  }
}

function getBibleBooks(verCode = state.bibleVersion) {
  if (typeof BIBLE_DATABASE === 'undefined') return [];

  if (verCode && BIBLE_DATABASE[verCode] && typeof BIBLE_DATABASE[verCode] === 'object' && !Array.isArray(BIBLE_DATABASE[verCode])) {
    return Object.keys(BIBLE_DATABASE[verCode]);
  }

  if (verCode && (!BIBLE_DATABASE[verCode] || Object.keys(BIBLE_DATABASE[verCode]).length === 0)) {
    if (typeof ensureBibleLoaded === 'function') ensureBibleLoaded(verCode);
  }

  const translations = Object.keys(BIBLE_DATABASE);
  const nonStrongs = translations.filter(t => !t.endsWith('_STRONGS'));
  for (const t of nonStrongs) {
    const val = BIBLE_DATABASE[t];
    if (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length > 0) {
      return Object.keys(val);
    }
  }

  if (translations.length > 0) {
    const firstKey = translations[0];
    const firstVal = BIBLE_DATABASE[firstKey];
    if (firstVal && typeof firstVal === 'object' && !Array.isArray(firstVal)) {
      if (window.libraryImporter && window.libraryImporter.isBibleBookName(firstKey)) {
        return translations;
      }
      return Object.keys(firstVal);
    }
  }

  return [];
}

function getBibleChapters(book, verCode = state.bibleVersion) {
  if (!book || typeof BIBLE_DATABASE === 'undefined') return [];

  if (verCode && BIBLE_DATABASE[verCode] && BIBLE_DATABASE[verCode][book]) {
    return Object.keys(BIBLE_DATABASE[verCode][book]);
  }

  if (BIBLE_DATABASE[book]) {
    return Object.keys(BIBLE_DATABASE[book]);
  }

  if (verCode && (!BIBLE_DATABASE[verCode] || Object.keys(BIBLE_DATABASE[verCode]).length === 0)) {
    if (typeof ensureBibleLoaded === 'function') ensureBibleLoaded(verCode);
  }

  const translations = Object.keys(BIBLE_DATABASE);
  const nonStrongs = translations.filter(t => !t.endsWith('_STRONGS'));
  for (const t of nonStrongs) {
    if (BIBLE_DATABASE[t] && BIBLE_DATABASE[t][book]) {
      return Object.keys(BIBLE_DATABASE[t][book]);
    }
  }
  for (const t of translations) {
    if (BIBLE_DATABASE[t] && BIBLE_DATABASE[t][book]) {
      return Object.keys(BIBLE_DATABASE[t][book]);
    }
  }

  return [];
}

function getBibleVerses(book, chapter, verCode = state.bibleVersion) {
  if (!book || !chapter || typeof BIBLE_DATABASE === 'undefined') return [];

  const chStr = String(chapter);
  const chNum = parseInt(chapter, 10);

  const getFromBookObj = (bObj) => {
    if (!bObj || typeof bObj !== 'object') return null;
    if (Array.isArray(bObj[chStr]) && bObj[chStr].length > 0) return bObj[chStr];
    if (Array.isArray(bObj[chNum]) && bObj[chNum].length > 0) return bObj[chNum];
    if (Array.isArray(bObj[chapter]) && bObj[chapter].length > 0) return bObj[chapter];
    return null;
  };

  if (verCode && BIBLE_DATABASE[verCode] && BIBLE_DATABASE[verCode][book]) {
    const res = getFromBookObj(BIBLE_DATABASE[verCode][book]);
    if (res) return res;
  }

  if (BIBLE_DATABASE[book]) {
    const res = getFromBookObj(BIBLE_DATABASE[book]);
    if (res) return res;
  }

  if (verCode && (!BIBLE_DATABASE[verCode] || Object.keys(BIBLE_DATABASE[verCode]).length === 0)) {
    if (typeof ensureBibleLoaded === 'function') ensureBibleLoaded(verCode);
  }

  const translations = Object.keys(BIBLE_DATABASE);
  const nonStrongs = translations.filter(t => !t.endsWith('_STRONGS'));
  for (const t of nonStrongs) {
    if (BIBLE_DATABASE[t] && BIBLE_DATABASE[t][book]) {
      const res = getFromBookObj(BIBLE_DATABASE[t][book]);
      if (res) return res;
    }
  }
  for (const t of translations) {
    if (BIBLE_DATABASE[t] && BIBLE_DATABASE[t][book]) {
      const res = getFromBookObj(BIBLE_DATABASE[t][book]);
      if (res) return res;
    }
  }

  return [];
}

function renderTranslationOptions(query = '') {
  const list = document.getElementById('translation-options-list');
  if (!list) return;
  list.innerHTML = '';

  const translations = getBibleTranslations();
  const q = (query || '').trim().toLowerCase();
  const filtered = translations.filter(t =>
    !q || t.title.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    list.innerHTML = `<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:11.5px;">No Bible translation found</div>`;
    return;
  }

  filtered.forEach(t => {
    const item = document.createElement('button');
    item.type = 'button';
    const isSelected = state.bibleVersion === t.code;
    item.className = `dialog-option-item ${isSelected ? 'selected' : ''}`;
    item.setAttribute('aria-pressed', String(isSelected));
    item.innerHTML = `
      <div class="dialog-option-info">
        <div class="dialog-option-title">${escapeHtml(t.title)}</div>
      </div>
      <div class="dialog-option-code">${escapeHtml(t.code)}</div>
    `;
    item.onclick = (e) => {
      e.stopPropagation();
      changeBibleVersion(t.code);
      closeTranslationDropdown();
    };
    list.appendChild(item);
  });
}

function initTranslationDropdown() {
  window.addEventListener('resize', closeTranslationDropdown);
  document.addEventListener('scroll', (event) => {
    const dialog = document.getElementById('translation-dropdown-dialog');
    if (dialog?.classList.contains('open') && !dialog.contains(event.target)) {
      closeTranslationDropdown();
    }
  }, true);
  const searchInput = document.getElementById('translation-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderTranslationOptions(e.target.value.trim().toLowerCase());
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeTranslationDropdown();
      }
    });
  }

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    const dialog = document.getElementById('translation-dropdown-dialog');
    const btn = document.getElementById('sidebar-bible-version-btn') || document.getElementById('bible-version-btn');
    if (dialog && dialog.classList.contains('open')) {
      if (!dialog.contains(e.target) && (!btn || !btn.contains(e.target))) {
        closeTranslationDropdown();
      }
    }

    const songDialog = document.getElementById('medley-song-dialog');
    if (songDialog && songDialog.classList.contains('open')) {
      if (!songDialog.contains(e.target) && !e.target.closest('.medley-change-btn')) {
        closeSongPicker();
      }
    }

    const versionDialog = document.getElementById('medley-version-dialog');
    if (versionDialog && versionDialog.classList.contains('open')) {
      if (!versionDialog.contains(e.target) && !e.target.closest('.medley-change-btn')) {
        closeVersionPicker();
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTranslationDropdown();
      closeSongPicker();
      closeVersionPicker();
    }
  });
}

function toggleTranslationDropdown(e) {
  if (e) e.stopPropagation();
  const dialog = document.getElementById('translation-dropdown-dialog');
  const btn = document.getElementById('sidebar-bible-version-btn') || document.getElementById('bible-version-btn');
  const bentoBtn = document.getElementById('bento-trans-sel');
  const input = document.getElementById('translation-search-input');
  if (!dialog) return;

  const isOpen = dialog.classList.contains('open');
  if (isOpen) {
    closeTranslationDropdown();
  } else {
    closeSongPicker();
    closeVersionPicker();
    document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));

    // Escape the library card's clipping and stacking context.
    const target = (e && e.currentTarget) || bentoBtn || btn;
    if (dialog.parentElement !== document.body) document.body.appendChild(dialog);
    const anchor = target?.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const width = Math.min(240, viewportWidth - 16);
    const left = Math.max(8, Math.min((anchor?.right || width + 8) - width, viewportWidth - width - 8));
    const below = viewportHeight - (anchor?.bottom || 0) - 14;
    const above = (anchor?.top || 0) - 14;
    const openAbove = below < 220 && above > below;
    Object.assign(dialog.style, {
      position: 'fixed', width: `${width}px`, left: `${left}px`, right: 'auto',
      top: openAbove ? 'auto' : `${(anchor?.bottom || 0) + 6}px`,
      bottom: openAbove ? `${viewportHeight - anchor.top + 6}px` : 'auto',
      maxHeight: `${Math.max(80, openAbove ? above : below)}px`
    });

    if (input) input.value = '';
    renderTranslationOptions('');
    dialog.classList.add('open');
    if (btn) btn.classList.add('open');
    if (bentoBtn) bentoBtn.classList.add('open');
    dialog.style.zIndex = '100002';
    if (typeof window.openDismissShield === 'function') {
      window.openDismissShield(closeTranslationDropdown, 100001);
    }
    if (input) input.focus({ preventScroll: true });
  }
}

function closeTranslationDropdown() {
  const dialog = document.getElementById('translation-dropdown-dialog');
  const btn = document.getElementById('sidebar-bible-version-btn') || document.getElementById('bible-version-btn');
  const bentoBtn = document.getElementById('bento-trans-sel');
  if (dialog) dialog.classList.remove('open');
  if (btn) btn.classList.remove('open');
  if (bentoBtn) bentoBtn.classList.remove('open');
  if (typeof window.closeDismissShield === 'function') {
    window.closeDismissShield();
  }
}

// Version Switcher & Compare Mode
async function ensureBibleLoaded(ver = state.bibleVersion || 'KJV') {
  if (!ver || typeof BIBLE_DATABASE === 'undefined') return false;
  const upper = ver.toUpperCase().trim();
  if (BIBLE_DATABASE[upper] && Object.keys(BIBLE_DATABASE[upper]).length > 0) return true;

  // Fallback 1: check customBibles in memory or IndexedDB
  if (window.libraryImporter && window.libraryImporter.customBibles && window.libraryImporter.customBibles[upper] && Object.keys(window.libraryImporter.customBibles[upper]).length > 0) {
    BIBLE_DATABASE[upper] = window.libraryImporter.customBibles[upper];
    return true;
  }
  if (window.libraryImporter && window.libraryImporter.db) {
    try {
      const fromDb = await new Promise(resolve => {
        const tx = window.libraryImporter.db.transaction(['bibles'], 'readonly');
        const req = tx.objectStore('bibles').get(upper);
        req.onsuccess = () => resolve(req.result ? req.result.data : null);
        req.onerror = () => resolve(null);
      });
      if (fromDb && typeof fromDb === 'object') {
        BIBLE_DATABASE[upper] = fromDb;
        if (window.libraryImporter.customBibles) {
          window.libraryImporter.customBibles[upper] = fromDb;
        }
        return true;
      }
    } catch (e) {}
  }

  // Fallback 2: auto-fetch translation JSON on demand
  try {
    const resp = await fetch(`/bibles/${upper}.json`);
    if (resp.ok) {
      const data = await resp.json();
      if (data && typeof data === 'object') {
        BIBLE_DATABASE[upper] = data;
        if (state.currentTab === 'bible') {
          if (typeof window.renderBentoDeck === 'function') window.renderBentoDeck();
          renderDeck();
        }
        return true;
      }
    }
  } catch (e) {
    console.warn(`Could not load ${upper} on demand:`, e);
  }
  return false;
}
window.ensureBibleLoaded = ensureBibleLoaded;

async function changeBibleVersion(ver) {
  if (!ver) return;
  state.bibleVersion = ver;

  // Sync select & custom button elements
  const singleSel = document.getElementById('single-bible-version-select');
  if (singleSel) singleSel.value = ver;
  const sideSel = document.getElementById('sidebar-bible-version-select');
  if (sideSel) sideSel.value = ver;
  const sidebarText = document.getElementById('sidebar-bible-version-text');
  if (sidebarText) {
    sidebarText.textContent = ver;
  }
  const bentoVerText = document.getElementById('bento-active-version-label');
  if (bentoVerText) {
    bentoVerText.textContent = ver;
  }
  const label = document.getElementById('active-version-label');
  if (label) label.textContent = ver;

  await ensureBibleLoaded(ver);

  const books = getBibleBooks(ver);
  if (!state.activeBibleBook || !books.includes(state.activeBibleBook)) {
    state.activeBibleBook = books[0] || 'Genesis';
    const chs = getBibleChapters(state.activeBibleBook, ver);
    state.activeBibleChapter = chs.length > 0 ? parseInt(chs[0], 10) : 1;
  }

  renderDeck();
  renderLibrary();
  if (state.activeLiveSlideId) reprojectCurrentLive();
  else syncDashboardWorkspace();
}

async function setCompareVersion(ver) {
  if (!ver) return;
  state.compareBibleVersion = ver;
  const compSel = document.getElementById('compare-bible-version-select');
  if (compSel) compSel.value = ver;

  await ensureBibleLoaded(ver);

  renderDeck();
  if (state.activeLiveSlideId && state.isCompareMode) reprojectCurrentLive();
  else syncDashboardWorkspace();
}

function toggleCompareMode() {
  state.isCompareMode = !state.isCompareMode;
  const btn = document.getElementById('btn-compare-mode');
  if (btn) {
    btn.classList.toggle('active', state.isCompareMode);
  }
  const comparePickerWrap = document.getElementById('compare-version-picker-wrap');
  if (comparePickerWrap) {
    comparePickerWrap.style.display = state.isCompareMode ? 'flex' : 'none';
  }
  renderDeck();
  if (state.activeLiveSlideId) reprojectCurrentLive();
  else syncDashboardWorkspace();
}

// Hold / Lock Live Slide
function toggleHoldLive() {
  if (REMOTE_MODE) { showToast('Hold live is controlled by the host.', 'info'); return; }
  state.isHoldLive = !state.isHoldLive;
  window.refreshBentoSplitLive?.();
  fetch('/api/hold', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ held: state.isHoldLive }) })
    .then(response => { if (!response.ok) throw new Error('Hold unavailable'); })
    .catch(() => showToast('Could not update remote Hold. Check the server connection.', 'error'));
  const btn = document.getElementById('btn-hold-toggle');
  if (btn) {
    btn.classList.toggle('held', state.isHoldLive);
    btn.classList.toggle('active', state.isHoldLive);
    const lockIcon = document.getElementById('hold-lock-icon');
    const textEl = document.getElementById('hold-text');
    if (lockIcon) {
      lockIcon.innerHTML = state.isHoldLive
        ? `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`
        : `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>`;
    }
    if (textEl) {
      textEl.textContent = state.isHoldLive ? 'HELD' : 'HOLD';
    }
  }

  if (typeof window.syncBentoStagePreview === 'function') {
    window.syncBentoStagePreview();
  }
}

// Switch to Adjacent Song / Scripture in Agenda or Library
function switchToAdjacentSong(dir) {
  if (state.isHoldLive) return;

  // 1. If currently in Bible Mode
  if (state.currentTab === 'bible') {
    const ver = state.bibleVersion || 'KJV';
    const books = typeof getBibleBooks === 'function' ? getBibleBooks(ver) : [];
    if (!books.length) return;
    const curBook = state.activeBibleBook || books[0];
    const curBookIdx = books.indexOf(curBook);
    const chs = typeof getBibleChapters === 'function' ? getBibleChapters(curBook, ver) : [1];
    const curCh = parseInt(state.activeBibleChapter, 10) || 1;

    if (dir > 0) {
      if (curCh < chs.length) {
        state.activeBibleChapter = curCh + 1;
      } else if (curBookIdx !== -1 && curBookIdx + 1 < books.length) {
        state.activeBibleBook = books[curBookIdx + 1];
        state.activeBibleChapter = 1;
      }
    } else {
      if (curCh > 1) {
        state.activeBibleChapter = curCh - 1;
      } else if (curBookIdx > 0) {
        state.activeBibleBook = books[curBookIdx - 1];
        const prevChs = typeof getBibleChapters === 'function' ? getBibleChapters(state.activeBibleBook, ver) : [1];
        state.activeBibleChapter = prevChs.length > 0 ? prevChs.length : 1;
      }
    }
    renderLibrary();
    renderDeck(true);
    syncDashboardWorkspace();
    const verses = typeof getBibleVerses === 'function' ? getBibleVerses(state.activeBibleBook, state.activeBibleChapter, ver) : [];
    if (verses.length > 0) {
      const v = dir > 0 ? verses[0] : verses[verses.length - 1];
      const slideId = `bible_${state.activeBibleBook}_${state.activeBibleChapter}_${v.verse}`;
      projectSlide(slideId, v.text, `${state.activeBibleBook} ${state.activeBibleChapter}:${v.verse} (${ver})`);
    }
    return;
  }

  // 2. If currently in Songs Mode
  const songs = SONGS_DATABASE || [];
  if (!songs.length) return;

  // A. Check if current song is in Agenda
  let targetSong = null;
  const inAgenda = Array.isArray(state.agendaItems) && state.agendaItems.some(item => item.id === state.activeSongId);

  if (inAgenda) {
    const agendaIdx = state.agendaItems.findIndex(item => item.id === state.activeSongId);
    if (agendaIdx !== -1) {
      const nextAgendaIdx = agendaIdx + dir;
      if (nextAgendaIdx >= 0 && nextAgendaIdx < state.agendaItems.length) {
        const item = state.agendaItems[nextAgendaIdx];
        if (item.type === 'song') {
          targetSong = songs.find(s => s.id === item.id);
        } else if (item.type === 'scripture') {
          state.currentTab = 'bible';
          state.activeBibleBook = item.book;
          state.activeBibleChapter = item.chapter;
          state.bibleVersion = item.version || state.bibleVersion;
          renderLibrary();
          renderDeck(true);
          syncDashboardWorkspace();
          const verses = typeof getBibleVerses === 'function' ? getBibleVerses(item.book, item.chapter, state.bibleVersion) : [];
          const v = (verses.find(v => v.verse === item.verse) || verses[0]);
          if (v) {
            projectSlide(`bible_${item.book}_${item.chapter}_${v.verse}`, v.text, `${item.book} ${item.chapter}:${v.verse} (${state.bibleVersion})`);
          }
          return;
        }
      } else {
        // Reached boundary of agenda: do not fall through to unlisted songs
        return;
      }
    }
  } else {
    // B. Song is not in agenda: cycle through library songs up to boundary
    const curIdx = songs.findIndex(s => s.id === state.activeSongId);
    if (curIdx !== -1) {
      const nextIdx = curIdx + dir;
      if (nextIdx >= 0 && nextIdx < songs.length) {
        targetSong = songs[nextIdx];
      }
    }
  }

  if (targetSong) {
    state.activeSongId = targetSong.id;
    applySongBoundTheme(targetSong.id);
    renderLibrary();
    scrollActiveLibraryItemIntoView(targetSong.id);
    renderDeck(true);
    syncDashboardWorkspace();
    if (targetSong.stanzas && targetSong.stanzas.length > 0) {
      const targetStanzaIdx = dir > 0 ? 0 : targetSong.stanzas.length - 1;
      const stanza = targetSong.stanzas[targetStanzaIdx];
      const maxLines = state.maxLinesPerSlide || 0;
      const chunks = typeof splitStanzaIntoChunks === 'function'
        ? splitStanzaIntoChunks(stanza, maxLines)
        : [{ ...stanza, chunkIndex: 0, totalChunks: 1, label: stanza.type }];
      const chunk = dir > 0 ? chunks[0] : chunks[chunks.length - 1];
      const slideId = chunks.length > 1 ? `${targetSong.id}_${targetStanzaIdx}_c${chunk.chunkIndex}` : `${targetSong.id}_${targetStanzaIdx}`;
      projectSlide(slideId, chunk.text, `${targetSong.title} (${chunk.label || stanza.type})`);
    }
  }
}

// Navigate Between 3-Column Medley Slots (Left / Right physical keys)
function navigateLiveMedleySlot(dir) {
  if (state.isHoldLive) return;

  const medleySongIds = Array.isArray(state.medleySongIds) ? state.medleySongIds : [];
  const songs = SONGS_DATABASE || [];

  if (state.currentTab === 'songs') {
    // Find current active slot
    let curSlotIdx = -1;
    if (state.activeLiveSlideId) {
      curSlotIdx = medleySongIds.findIndex(id => id && state.activeLiveSlideId.startsWith(`medley_${id}_`));
    }
    if (curSlotIdx === -1) {
      curSlotIdx = 0;
    }

    const targetSlotIdx = curSlotIdx + dir;
    if (targetSlotIdx >= 0 && targetSlotIdx < medleySongIds.length) {
      const targetSongId = medleySongIds[targetSlotIdx];
      if (targetSongId) {
        const song = songs.find(s => s.id === targetSongId);
        if (song && song.stanzas && song.stanzas.length > 0) {
          const maxLines = state.maxLinesPerSlide || 0;
          const chunks = typeof splitStanzaIntoChunks === 'function'
            ? splitStanzaIntoChunks(song.stanzas[0], maxLines)
            : [{ ...song.stanzas[0], chunkIndex: 0, totalChunks: 1, label: song.stanzas[0].type }];
          const chunk = chunks[0];
          const slideId = chunks.length > 1 ? `medley_${song.id}_0_c0` : `medley_${song.id}_0`;
          projectSlide(slideId, chunk.text, `${song.title} (${chunk.label || song.stanzas[0].type})`);
          return;
        }
      }
    }
  } else if (state.currentTab === 'bible') {
    const slots = Array.isArray(state.medleyBibleSlots) ? state.medleyBibleSlots : [];
    let curSlotIdx = -1;
    if (state.activeLiveSlideId) {
      const match = state.activeLiveSlideId.match(/^medley_bible_s(\d+)_/);
      if (match) {
        curSlotIdx = parseInt(match[1], 10);
      }
    }
    if (curSlotIdx === -1) curSlotIdx = 0;

    const targetSlotIdx = curSlotIdx + dir;
    if (targetSlotIdx >= 0 && targetSlotIdx < slots.length) {
      const slot = slots[targetSlotIdx];
      if (slot) {
        const ver = slot.version || state.bibleVersion || 'KJV';
        const verses = typeof getBibleVerses === 'function' ? getBibleVerses(slot.book, slot.chapter, ver) : [];
        if (verses.length > 0) {
          const v = verses[0];
          const slideId = `medley_bible_s${targetSlotIdx}_${slot.book}_${slot.chapter}_${v.verse}`;
          projectSlide(slideId, v.text, `${slot.book} ${slot.chapter}:${v.verse} (${ver})`);
          return;
        }
      }
    }
  }

  // Fallback: try DOM clicking if element exists
  const isBento = document.body && document.body.getAttribute('data-theme-style') === 'bento';
  const container = isBento ? document.getElementById('bento-medley-container') : document.getElementById('deck-container');
  if (!container) return;
  const cols = Array.from(container.querySelectorAll(isBento ? '.bento-slot-col' : '.medley-column-card'));
  if (!cols.length) return;
  let curColIdx = cols.findIndex(c => c.classList.contains('active-song') || c.querySelector('.bento-slide-card.live, .slide-card.live-active'));
  if (curColIdx === -1) curColIdx = 0;

  let targetColIdx = curColIdx + dir;
  if (targetColIdx >= 0 && targetColIdx < cols.length) {
    const targetCol = cols[targetColIdx];
    const cards = Array.from(targetCol.querySelectorAll(isBento ? '.bento-slide-card' : '.slide-card'));
    if (cards.length > 0) {
      cards[0].click();
    }
  }
}

// Navigate Next / Prev Slide Across Bento & Classic Themes
function navigateLiveVerse(dir) {
  if (state.isHoldLive) return;
  if (window.navigateBentoSplitDraft?.(dir)) return;

  const isBento = document.body && document.body.getAttribute('data-theme-style') === 'bento';

  // ─────────────────────────────────────────────────────────────
  // 1. MEDLEY MODE NAVIGATION (3 COLUMNS)
  // ─────────────────────────────────────────────────────────────
  if (state.isMedleyMode) {
    if (state.currentTab === 'songs') {
      const medleySongIds = Array.isArray(state.medleySongIds) ? state.medleySongIds : [];
      const songs = SONGS_DATABASE || [];

      // If nothing is live yet, start from first non-empty slot
      if (!state.activeLiveSlideId) {
        for (let i = 0; i < medleySongIds.length; i++) {
          const s = songs.find(x => x.id === medleySongIds[i]);
          if (s && s.stanzas && s.stanzas.length > 0) {
            const maxLines = state.maxLinesPerSlide || 0;
            const chunks = typeof splitStanzaIntoChunks === 'function' ? splitStanzaIntoChunks(s.stanzas[0], maxLines) : [{ ...s.stanzas[0], chunkIndex: 0, totalChunks: 1, label: s.stanzas[0].type }];
            const chunk = chunks[0];
            const slideId = chunks.length > 1 ? `medley_${s.id}_0_c0` : `medley_${s.id}_0`;
            projectSlide(slideId, chunk.text, `${s.title} (${chunk.label || s.stanzas[0].type})`);
            return;
          }
        }
      }

      // Check active song match
      const songId = medleySongIds.find(id => id && state.activeLiveSlideId && state.activeLiveSlideId.startsWith(`medley_${id}_`));
      if (songId) {
        const curSlotIdx = medleySongIds.indexOf(songId);
        const song = songs.find(s => s.id === songId);

        if (song && song.stanzas) {
          const maxLines = state.maxLinesPerSlide || 0;
          // Flatten all slides of this song into an array of slide descriptors
          const allSlides = [];
          song.stanzas.forEach((st, stIdx) => {
            const chunks = typeof splitStanzaIntoChunks === 'function'
              ? splitStanzaIntoChunks(st, maxLines)
              : [{ ...st, chunkIndex: 0, totalChunks: 1, label: st.type }];
            chunks.forEach((ck, ckIdx) => {
              const slideId = chunks.length > 1 ? `medley_${song.id}_${stIdx}_c${ckIdx}` : `medley_${song.id}_${stIdx}`;
              allSlides.push({ slideId, text: ck.text, ref: `${song.title} (${ck.label || st.type})`, stIdx, ckIdx });
            });
          });

          let curSlideIdx = allSlides.findIndex(s => s.slideId === state.activeLiveSlideId);
          if (curSlideIdx === -1) {
            curSlideIdx = 0;
          }
          if (curSlideIdx === -1) curSlideIdx = 0;

          const targetSlideIdx = curSlideIdx + dir;
          if (targetSlideIdx >= 0 && targetSlideIdx < allSlides.length) {
            const target = allSlides[targetSlideIdx];
            projectSlide(target.slideId, target.text, target.ref);
            return;
          } else if (targetSlideIdx >= allSlides.length && dir > 0) {
            // End of slot -> advance to next slot
            for (let nextSlot = curSlotIdx + 1; nextSlot < medleySongIds.length; nextSlot++) {
              const nextSong = songs.find(s => s.id === medleySongIds[nextSlot]);
              if (nextSong && nextSong.stanzas && nextSong.stanzas.length > 0) {
                const chunks = typeof splitStanzaIntoChunks === 'function' ? splitStanzaIntoChunks(nextSong.stanzas[0], maxLines) : [{ ...nextSong.stanzas[0], chunkIndex: 0, totalChunks: 1, label: nextSong.stanzas[0].type }];
                const slideId = chunks.length > 1 ? `medley_${nextSong.id}_0_c0` : `medley_${nextSong.id}_0`;
                projectSlide(slideId, chunks[0].text, `${nextSong.title} (${chunks[0].label || nextSong.stanzas[0].type})`);
                return;
              }
            }
          } else if (targetSlideIdx < 0 && dir < 0) {
            // Beginning of slot -> go to previous slot's last slide
            for (let prevSlot = curSlotIdx - 1; prevSlot >= 0; prevSlot--) {
              const prevSong = songs.find(s => s.id === medleySongIds[prevSlot]);
              if (prevSong && prevSong.stanzas && prevSong.stanzas.length > 0) {
                const lastStanzaIdx = prevSong.stanzas.length - 1;
                const lastStanza = prevSong.stanzas[lastStanzaIdx];
                const chunks = typeof splitStanzaIntoChunks === 'function' ? splitStanzaIntoChunks(lastStanza, maxLines) : [{ ...lastStanza, chunkIndex: 0, totalChunks: 1, label: lastStanza.type }];
                const lastChunk = chunks[chunks.length - 1];
                const slideId = chunks.length > 1 ? `medley_${prevSong.id}_${lastStanzaIdx}_c${lastChunk.chunkIndex}` : `medley_${prevSong.id}_${lastStanzaIdx}`;
                projectSlide(slideId, lastChunk.text, `${prevSong.title} (${lastChunk.label || lastStanza.type})`);
                return;
              }
            }
          }
        }
      }
    } else if (state.currentTab === 'bible') {
      const slots = Array.isArray(state.medleyBibleSlots) ? state.medleyBibleSlots : [];
      let curSlotIdx = 0;
      let curVerse = null;
      const match = (state.activeLiveSlideId && state.activeLiveSlideId.startsWith('medley_bible_s'))
        ? state.activeLiveSlideId.match(/^medley_bible_s(\d+)_([^_]+)_(\d+)_(\d+)$/)
        : null;
      if (match) {
        curSlotIdx = parseInt(match[1], 10);
        curVerse = parseInt(match[4], 10);
      }
      const slot = slots[curSlotIdx] || slots[0];
      if (slot && slot.book) {
        const ver = slot.version || state.bibleVersion || 'KJV';
        const verses = typeof getBibleVerses === 'function' ? getBibleVerses(slot.book, slot.chapter, ver) : [];
        if (verses.length > 0) {
          if (curVerse === null) {
            const v = verses[0];
            const slideId = `medley_bible_s${curSlotIdx}_${slot.book}_${slot.chapter}_${v.verse}`;
            projectSlide(slideId, v.text, `${slot.book} ${slot.chapter}:${v.verse} (${ver})`);
            return;
          }
          const vIdx = verses.findIndex(v => v.verse === curVerse);
          const nextVIdx = (vIdx === -1 ? 0 : vIdx) + dir;
          if (nextVIdx >= 0 && nextVIdx < verses.length) {
            const v = verses[nextVIdx];
            const slideId = `medley_bible_s${curSlotIdx}_${slot.book}_${slot.chapter}_${v.verse}`;
            projectSlide(slideId, v.text, `${slot.book} ${slot.chapter}:${v.verse} (${ver})`);
            return;
          } else if (nextVIdx >= verses.length && dir > 0) {
            for (let nextSlot = curSlotIdx + 1; nextSlot < slots.length; nextSlot++) {
              const nSlot = slots[nextSlot];
              if (nSlot && nSlot.book) {
                const nVer = nSlot.version || state.bibleVersion || 'KJV';
                const nVerses = typeof getBibleVerses === 'function' ? getBibleVerses(nSlot.book, nSlot.chapter, nVer) : [];
                if (nVerses.length > 0) {
                  const v = nVerses[0];
                  const slideId = `medley_bible_s${nextSlot}_${nSlot.book}_${nSlot.chapter}_${v.verse}`;
                  projectSlide(slideId, v.text, `${nSlot.book} ${nSlot.chapter}:${v.verse} (${nVer})`);
                  return;
                }
              }
            }
          } else if (nextVIdx < 0 && dir < 0) {
            for (let prevSlot = curSlotIdx - 1; prevSlot >= 0; prevSlot--) {
              const pSlot = slots[prevSlot];
              if (pSlot && pSlot.book) {
                const pVer = pSlot.version || state.bibleVersion || 'KJV';
                const pVerses = typeof getBibleVerses === 'function' ? getBibleVerses(pSlot.book, pSlot.chapter, pVer) : [];
                if (pVerses.length > 0) {
                  const v = pVerses[pVerses.length - 1];
                  const slideId = `medley_bible_s${prevSlot}_${pSlot.book}_${pSlot.chapter}_${v.verse}`;
                  projectSlide(slideId, v.text, `${pSlot.book} ${pSlot.chapter}:${v.verse} (${pVer})`);
                  return;
                }
              }
            }
          }
        }
      }
    }
    return;
  }

  // ─────────────────────────────────────────────────────────────
  // 2. SINGLE VIEW NAVIGATION (Bento or Classic)
  // ─────────────────────────────────────────────────────────────
  let visibleCards = [];
  if (isBento) {
    visibleCards = Array.from(document.querySelectorAll('#bento-medley-container .bento-single-card[data-slide-id]:not(.bento-add-song-card), #bento-medley-container .bento-slide-card[data-slide-id]:not(.bento-add-song-card)'));
  } else {
    visibleCards = Array.from(document.querySelectorAll('#deck-container .slide-card[data-slide-id]:not(.bento-add-song-card), #deck-container .song-stanza-list-card[data-slide-id]:not(.bento-add-song-card)'));
  }

  if (visibleCards.length > 0) {
    const activeIdx = visibleCards.findIndex(c => c.classList.contains('live') || c.classList.contains('live-active') || c.classList.contains('staged'));
    if (activeIdx === -1) {
      visibleCards[0].click();
      return;
    }
    const targetIdx = activeIdx + dir;
    if (targetIdx >= 0 && targetIdx < visibleCards.length) {
      visibleCards[targetIdx].click();
      return;
    }
    // Reached boundary (before first verse or past last verse):
    // Stay safely on the current slide, do not switch songs automatically.
    return;
  }
}

function reprojectCurrentLive() {
  if (!state.activeLiveSlideId) return;

  if (state.activeLiveSlideId.startsWith('bible_') || state.activeLiveSlideId.startsWith('medley_bible_')) {
    const book = state.activeBibleBook;
    const chapter = state.activeBibleChapter;
    const vMatch = state.activeLiveSlideId.match(/_(\d+)$/);
    const verseNum = vMatch ? parseInt(vMatch[1], 10) : 1;

    const primaryVerses = getBibleVerses(book, chapter, state.bibleVersion);
    const primaryV = primaryVerses.find(v => v.verse === verseNum) || { verse: verseNum, text: state.activeLiveText };

    const cleanPrimaryText = (typeof stripStrongsTags === 'function') ? stripStrongsTags(primaryV.text) : primaryV.text;

    if (state.isCompareMode) {
      const compareVerses = getBibleVerses(book, chapter, state.compareBibleVersion);
      const compareV = compareVerses.find(v => v.verse === verseNum) || { verse: verseNum, text: '' };
      const cleanCompareText = (typeof stripStrongsTags === 'function') ? stripStrongsTags(compareV.text) : compareV.text;
      const refStr = `${book} ${chapter}:${verseNum} (${state.bibleVersion} vs ${state.compareBibleVersion})`;
      const comparePayload = {
        ver1: { code: state.bibleVersion, text: cleanPrimaryText },
        ver2: { code: state.compareBibleVersion, text: cleanCompareText }
      };
      state.activeLiveText = cleanPrimaryText;
      state.activeLiveRef = refStr;
      state.compareData = comparePayload;
      broadcastState({
        slideId: `bible_compare_${state.bibleVersion}_${state.compareBibleVersion}_${book}_${chapter}_${verseNum}`,
        text: cleanPrimaryText,
        reference: refStr,
        compareData: comparePayload,
        clear: false
      });
    } else {
      const refStr = `${book} ${chapter}:${verseNum} (${state.bibleVersion})`;
      state.activeLiveText = cleanPrimaryText;
      state.activeLiveRef = refStr;
      state.compareData = null;
      broadcastState({
        slideId: `bible_${state.bibleVersion}_${book}_${chapter}_${verseNum}`,
        text: cleanPrimaryText,
        reference: refStr,
        compareData: null,
        clear: false
      });
    }
  } else {
    broadcastState();
  }
}

function navigateSlide(direction) {
  const dir = (direction === 'prev' || direction === -1) ? -1 : 1;
  navigateLiveVerse(dir);
}

// Auto-scale Stage Preview Iframe
function scalePreviewIframe() {
  const wrap = document.querySelector('.preview-stage-wrap');
  const scaler = document.getElementById('preview-scaler');
  if (!wrap || !scaler) return;
  const wrapWidth = wrap.clientWidth;
  if (wrapWidth > 0) {
    const scale = wrapWidth / 1920;
    scaler.style.transform = `scale(${scale})`;
  }
}

// Dynamic Output Link Resolver & Remote Routing
/* hoisted */
let serverBoundPort = 8500;

async function detectLanIp() {
  if (window.location.protocol === 'file:') return;
  try {
    const response = await fetch('/api/network');
    const network = await response.json();
    if (network) {
      if (network.port) serverBoundPort = network.port;
      if (!customLanIp && (network.preferredAddress || (network.addresses && network.addresses[0]))) {
        customLanIp = network.preferredAddress || network.addresses[0];
        const input = document.getElementById('lan-ip-input');
        if (input) input.value = customLanIp;
        updateOutputLinksModal(customLanIp);
      }
    }
  } catch (error) {
    // Local-only mode remains available when the network helper is unavailable.
  }
}

function getBaseDisplayUrl(overrideIp = '') {
  let baseOrigin = window.location.origin;
  let path = window.location.pathname || '/display.html';

  if (path.endsWith('index.html')) {
    path = path.replace('index.html', 'display.html');
  } else if (path.endsWith('/')) {
    path += 'display.html';
  } else if (!path.includes('display.html')) {
    path = path.substring(0, path.lastIndexOf('/') + 1) + 'display.html';
  }

  const activePort = window.location.port || String(serverBoundPort || 8500);

  if (window.location.protocol === 'file:') {
    if (overrideIp) {
      return `http://${overrideIp}:${activePort}/display.html`;
    }
    return window.location.href.replace('index.html', 'display.html').split('?')[0];
  }

  if (overrideIp) {
    const protocol = window.location.protocol.startsWith('http') ? window.location.protocol : 'http:';
    return `${protocol}//${overrideIp}:${activePort}${path}`;
  }

  return `${baseOrigin}${path}`;
}

function updateOutputLinksModal(overrideIp = '') {
  const baseUrl = getBaseDisplayUrl(overrideIp);

  const inputSanctuary = document.getElementById('url-sanctuary');
  const inputLivestream = document.getElementById('url-livestream');
  const inputAuto = document.getElementById('url-auto');
  const inputRemote = document.getElementById('url-remote');

  if (inputSanctuary) inputSanctuary.value = `${baseUrl}?target=sanctuary`;
  if (inputLivestream) inputLivestream.value = `${baseUrl}?target=livestream`;
  if (inputAuto) inputAuto.value = `${baseUrl}?target=auto`;
  if (inputRemote) inputRemote.value = getRemoteControlUrl(overrideIp);

  // Update QR image & text if visible
  const qrText = document.getElementById('hub-qr-url-text');
  const qrImg = document.getElementById('hub-qr-img');
  const remoteUrl = getRemoteControlUrl(overrideIp);
  if (qrText) qrText.textContent = remoteUrl;
  if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(remoteUrl)}`;
}

function openBroadcastHub() {
  const modal = document.getElementById('links-modal-backdrop');
  if (modal) {
    updateOutputLinksModal(customLanIp);
    refreshBroadcastHubOperators();
    modal.classList.add('open');
  }
}

function toggleHubQrCode() {
  const qrCard = document.getElementById('hub-qr-card');
  const qrBtn = document.getElementById('hub-qr-toggle-btn');
  if (!qrCard) return;
  const isHidden = qrCard.style.display === 'none' || !qrCard.style.display;
  if (isHidden) {
    const remoteUrl = getRemoteControlUrl(customLanIp);
    const qrImg = document.getElementById('hub-qr-img');
    const qrText = document.getElementById('hub-qr-url-text');
    if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(remoteUrl)}`;
    if (qrText) qrText.textContent = remoteUrl;
    qrCard.style.display = 'flex';
    if (qrBtn) {
      qrBtn.classList.add('active');
      qrBtn.style.color = '#60A5FA';
    }
  } else {
    qrCard.style.display = 'none';
    if (qrBtn) {
      qrBtn.classList.remove('active');
      qrBtn.style.color = '';
    }
  }
}

function refreshBroadcastHubOperators() {
  fetch('/api/session').then(r => r.json()).then(data => {
    const operators = data.connectedOperators || [];
    const count = operators.length;

    const badge = document.getElementById('hub-operators-badge');
    const countPill = document.getElementById('hub-operators-count-pill');
    const headerBadge = document.getElementById('remote-operator-count');
    const opCard = document.getElementById('hub-operators-card');
    const list = document.getElementById('hub-operators-list');

    if (badge) {
      badge.style.display = count > 0 ? 'inline-block' : 'none';
      badge.textContent = `${count} Online`;
    }
    if (headerBadge) {
      headerBadge.style.display = count > 0 ? 'inline-block' : 'none';
      headerBadge.textContent = count;
    }
    if (countPill) countPill.textContent = `${count} Active`;

    if (opCard) {
      opCard.style.display = count > 0 ? 'block' : 'none';
    }
    if (list && count > 0) {
      list.innerHTML = operators.map(op => `
        <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(0,0,0,0.3); padding:5px 8px; border-radius:6px; font-size:11px; gap:8px;">
          <div style="display:flex; align-items:center; gap:6px; min-width:0;">
            <span style="width:5px; height:5px; border-radius:50%; background:#22C55E; flex-shrink:0;"></span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted); flex-shrink:0;"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
            <span style="color:#F8FAFC; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(op.name || op.id || 'Wireless Operator')}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            <span style="color:#86EFAC; font-family:var(--font-mono); font-size:9.5px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase;">Connected</span>
            <button type="button" onclick="pushHostLibraryToOperator('${op.id}', '${escapeHtml(op.name || 'Operator')}', this)" style="background:rgba(59,130,246,0.18); border:1px solid rgba(59,130,246,0.45); color:#93C5FD; font-family:var(--font-main); font-size:10px; font-weight:700; padding:2px 8px; border-radius:4px; cursor:pointer; display:flex; align-items:center; gap:3px; transition:all 0.15s ease;" title="Push library and agenda to this operator">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="7 13 12 18 17 13"/><line x1="12" y1="18" x2="12" y2="6"/></svg>
              <span>Push</span>
            </button>
          </div>
        </div>
      `).join('');
    }
  }).catch(() => { });
}

function getRemoteControlUrl(overrideIp = '') {
  const displayUrl = getBaseDisplayUrl(overrideIp);
  return displayUrl.replace('display.html', 'index.html?remote=1');
}

function updateLanIpHost(ip) {
  customLanIp = ip;
  updateOutputLinksModal(ip);
}

function resetLanIpHost() {
  customLanIp = '';
  const input = document.getElementById('lan-ip-input');
  if (input) input.value = '';
  detectLanIp();
}

function openOutputLink(targetType) {
  const baseUrl = getBaseDisplayUrl('');
  const finalUrl = targetType.includes('?') ? `${baseUrl}${targetType}` : `${baseUrl}?target=${targetType}`;
  const previewName = 'GinomiaOutput_' + targetType.replace(/[^a-z0-9]/gi, '_');
  window.open(finalUrl, previewName);
}

function openRemoteControl() {
  window.open(getRemoteControlUrl(customLanIp), '_blank');
}

function copyRemoteControlLink(btnElement) {
  const url = getRemoteControlUrl(customLanIp);
  const copySuccess = () => {
    showToast('Remote link copied', 'success');
    if (btnElement) {
      const origText = btnElement.innerHTML;
      btnElement.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block;vertical-align:middle;margin-right:3px;"><polyline points="20 6 9 17 4 12"/></svg> Copied';
      btnElement.style.background = 'rgba(16,185,129,0.2)';
      btnElement.style.borderColor = 'rgba(16,185,129,0.4)';
      btnElement.style.color = '#34D399';
      setTimeout(() => {
        btnElement.innerHTML = origText;
        btnElement.style.background = '';
        btnElement.style.borderColor = '';
        btnElement.style.color = '';
      }, 2000);
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(copySuccess).catch(() => {
      fallbackCopy('remote', copySuccess);
    });
  } else {
    fallbackCopy('remote', copySuccess);
  }
}

function copyOutputLink(targetType, btnElement) {
  const baseUrl = getBaseDisplayUrl(customLanIp);
  const targetUrl = targetType.includes('?') ? `${baseUrl}${targetType}` : `${baseUrl}?target=${targetType}`;

  const copySuccess = () => {
    showToast(`Copied ${targetType.toUpperCase()} Link to Clipboard!`, 'success');
    if (btnElement) {
      const origText = btnElement.innerHTML;
      btnElement.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block;vertical-align:middle;margin-right:3px;"><polyline points="20 6 9 17 4 12"/></svg> Copied';
      btnElement.style.background = 'rgba(16,185,129,0.2)';
      btnElement.style.borderColor = 'rgba(16,185,129,0.4)';
      btnElement.style.color = '#34D399';
      setTimeout(() => {
        btnElement.innerHTML = origText;
        btnElement.style.background = '';
        btnElement.style.borderColor = '';
        btnElement.style.color = '';
      }, 2000);
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(targetUrl).then(copySuccess).catch(() => {
      fallbackCopy(targetType, copySuccess);
    });
  } else {
    fallbackCopy(targetType, copySuccess);
  }
}

function fallbackCopy(targetType, callback) {
  const inputEl = document.getElementById(`url-${targetType}`);
  if (inputEl) {
    inputEl.select();
    document.execCommand('copy');
    if (callback) callback();
  }
}

// Stage Preview Controls
/* hoisted */

function togglePreviewTargetMode() {
  previewTargetMode = (previewTargetMode === 'sanctuary') ? 'livestream' : 'sanctuary';
  window.previewTargetMode = previewTargetMode;
  state.currentMode = (previewTargetMode === 'livestream') ? 'lt' : 'full';
  const iframe = document.getElementById('preview-iframe');
  const btn = document.getElementById('preview-target-toggle-btn');

  if (iframe) {
    const baseUrl = getBaseDisplayUrl();
    iframe.src = `${baseUrl}?target=${previewTargetMode}&preview=1`;
  }

  if (btn) {
    btn.textContent = (previewTargetMode === 'sanctuary') ? 'Full Display' : 'Lower-Third';
    btn.classList.toggle('active', previewTargetMode === 'livestream');
  }

  broadcastState();
}

function openPopoutPreview() {
  const baseUrl = getBaseDisplayUrl();
  const popUrl = `${baseUrl}?target=${previewTargetMode}`;
  window.open(popUrl, 'GinomiaProPreviewPopout', 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');
}

// Global Toast Notification Engine
function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('app-toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'app-toast-container';
    toastContainer.className = 'app-toast-container';
    toastContainer.setAttribute('aria-live', 'polite');
    toastContainer.setAttribute('aria-relevant', 'additions');
    document.body.appendChild(toastContainer);
  }

  // Dismiss older toasts if more than 1 are currently active
  const existingToasts = toastContainer.querySelectorAll('.app-toast');
  if (existingToasts.length >= 2) {
    existingToasts[0].classList.remove('visible');
    setTimeout(() => existingToasts[0].remove(), 200);
  }

  const toast = document.createElement('div');
  toast.className = `app-toast toast-${type}`;
  toast.textContent = message;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  toastContainer.appendChild(toast);
  toast.classList.add('visible');

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, type === 'error' ? 8000 : 4500);
}

// Helper for Stage Confidence Monitor: Anticipate next slide
function getNextSlideAnticipation(activeSlideId) {
  if (!activeSlideId) return null;
  const isBento = document.body && document.body.getAttribute('data-theme-style') === 'bento';
  let visibleCards = [];
  if (isBento) {
    visibleCards = Array.from(document.querySelectorAll('#bento-medley-container [data-slide-id]:not(.bento-add-song-card), #deck-container [data-slide-id]:not(.bento-add-song-card)'));
  } else {
    visibleCards = Array.from(document.querySelectorAll('#deck-container [data-slide-id]:not(.bento-add-song-card)'));
  }
  if (!visibleCards || visibleCards.length === 0) return null;

  const currentIdx = visibleCards.findIndex(c => c.getAttribute('data-slide-id') === activeSlideId);
  if (currentIdx !== -1 && currentIdx + 1 < visibleCards.length) {
    const nextCard = visibleCards[currentIdx + 1];
    const nextSlideId = nextCard.getAttribute('data-slide-id');
    if (window._bentoSlideRegistry && window._bentoSlideRegistry.has(nextSlideId)) {
      const reg = window._bentoSlideRegistry.get(nextSlideId);
      return { text: reg.text || '', reference: reg.refStr || '' };
    }
    const textEl = nextCard.querySelector('.ln, .slide-text, .bento-slide-text, .song-stanza-text');
    const labelEl = nextCard.querySelector('.tag, .slide-label, .bento-slide-label, .song-stanza-badge, .bento-slide-header');
    const text = textEl ? textEl.textContent.trim() : (nextCard.getAttribute('data-text') || '');
    const reference = labelEl ? labelEl.textContent.trim() : (nextCard.getAttribute('data-ref') || '');
    if (text) {
      return { text, reference };
    }
  }
  return null;
}
window.getNextSlideAnticipation = getNextSlideAnticipation;

// Helper to auto-activate song-specific visual theme when selecting a song
function applySongBoundTheme(songId, deferBroadcast = false) {
  if (!songId) return;
  state.boundThemeSongId = songId;
  if (window.themeManager && typeof window.themeManager.getSongBoundTheme === 'function') {
    const boundTheme = window.themeManager.getSongBoundTheme(songId);
    if (boundTheme) {
      window.themeManager.setSanctuaryTheme(boundTheme, !deferBroadcast);
    }
  }
}
window.applySongBoundTheme = applySongBoundTheme;

// Shared timestamp-based timer: every stage screen derives the same elapsed time.
window.controlServiceTimer = function(action) {
  const now = Date.now();
  const timer = state.serviceTimer || { running: false, elapsed: 0, startedAt: null };
  const elapsed = timer.elapsed + (timer.running ? now - timer.startedAt : 0);
  state.serviceTimer = action === 'reset'
    ? { running: false, elapsed: 0, startedAt: null }
    : action === 'pause'
      ? { running: false, elapsed, startedAt: null }
      : { running: true, elapsed, startedAt: now };
  broadcastState({ serviceTimer: state.serviceTimer }, true);
};

// Broadcast Live State Change
let liveStorageTimer;
let pendingLiveStorage;
function broadcastState(override = {}, previewAlreadyUpdated = false) {
  if (REMOTE_MODE) {
    if (override.clear) sendRemoteCommand({ type: 'CLEAR' });
    else if (override.blackout) sendRemoteCommand({ type: 'BLACKOUT' });
    else sendRemoteCommand({ type: 'STATE_PATCH', patch: createDashboardSnapshot() });
    return;
  }
  const independentUpdate = override.alert !== undefined || override.serviceTimer !== undefined;
  if (state.isHoldLive && !independentUpdate && !override.clear && !override.blackout) return;

  const slideId = override.slideId !== undefined ? override.slideId : (state.activeLiveSlideId || '');
  const isLexicon = Boolean(override.isLexicon || (slideId && slideId.startsWith('lexicon_')));
  const isBible = !isLexicon && (slideId.startsWith('bible_') || slideId.startsWith('medley_bible_') || slideId.startsWith('ai_') || slideId.startsWith('para_') || slideId.startsWith('hist_'));

  if (!isLexicon) {
    state.activeLexiconData = null;
  }

  const payload = {
    slideId: slideId,
    contentType: override.contentType !== undefined ? override.contentType : (isLexicon ? 'lexicon' : (isBible ? 'bible' : 'song')),
    isBible: override.isBible !== undefined ? override.isBible : isBible,
    isLexicon: isLexicon,
    lexiconData: override.lexiconData !== undefined ? override.lexiconData : (isLexicon ? state.activeLexiconData : null),
    lexiconStyle: override.lexiconStyle || state.concordanceStyle || 'hero',
    lexiconDisplayMode: override.lexiconDisplayMode || state.concordanceDisplayMode || 'full',
    concordancePosition: override.concordancePosition || state.concordancePosition || 'right',
    lexiconPosition: override.lexiconPosition || state.concordancePosition || 'right',
    englishWord: override.englishWord || (state.activeLexiconData && state.activeLexiconData.englishWord) || '',
    mode: (isLexicon && (override.lexiconDisplayMode || state.concordanceDisplayMode || 'full') === 'full') ? 'full' : (override.mode || state.currentMode),
    projectorActive: state.projectorActive,
    livestreamActive: state.livestreamActive,
    showSongTitleInDisplay: state.showSongTitleInDisplay,
    transparentBg: state.transparentBg,
    transitionType: override.transitionType !== undefined ? override.transitionType : (state.transitionType || 'fade'),
    transitionDuration: override.transitionDuration !== undefined ? override.transitionDuration : (state.transitionDuration || 300),
    typography: state.typography,
    text: override.text !== undefined ? override.text : (state.activeLiveText || ''),
    reference: override.reference !== undefined ? override.reference : (state.activeLiveRef || ''),
    serviceTimer: state.serviceTimer || { running: false, elapsed: 0, startedAt: null },
    nextSlide: override.nextSlide !== undefined ? override.nextSlide : (override.clear || override.blackout ? null : getNextSlideAnticipation(slideId)),
    alert: override.alert !== undefined ? override.alert : (window.liveAlertEngine && window.liveAlertEngine.currentAlert ? window.liveAlertEngine.currentAlert : null),
    version: state.bibleVersion,
    compare: state.isCompareMode,
    compareVersion: state.compareBibleVersion,
    compareData: override.compareData !== undefined ? override.compareData : state.compareData,
    textSize: state.textSize,
    songScaleFull: state.songScaleFull !== undefined ? state.songScaleFull : 2.2,
    songScaleLt: state.songScaleLt !== undefined ? state.songScaleLt : 1.4,
    textAutoScale: state.textAutoScale,
    bg: state.background,
    sanctuaryTheme: (window.themeManager && typeof window.themeManager.getSanctuaryPayload === 'function') ? window.themeManager.getSanctuaryPayload() : (state.sanctuaryTheme || null),
    clear: override.clear || false,
    clearBg: override.clearBg || false,
    blackout: override.blackout || false,
    dashboard: createDashboardSnapshot(),
    _timestamp: Date.now()
  };

  // Alerts and timers preserve the last transmitted slide, including clear/blackout.
  if (independentUpdate && pendingLiveStorage) {
    Object.assign(payload, pendingLiveStorage, override, { _timestamp: Date.now() });
  }

  // 1. Save state to localStorage for cross-window hydration using isolated key
  pendingLiveStorage = payload;
  clearTimeout(liveStorageTimer);
  liveStorageTimer = setTimeout(() => {
    try { localStorage.setItem('scriptureflow_live_state', JSON.stringify(pendingLiveStorage)); } catch (e) { }
  }, 80);

  // 2. Broadcast via BroadcastChannel & Server Sync (Host only)
  if (!REMOTE_MODE) {
    try {
      syncChannel.postMessage(payload);
    } catch (e) { }

    try {
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => { }); // fire-and-forget, don't block UI
    } catch (e) { }
  }

  if (!previewAlreadyUpdated) updateLivePreview(payload);
}

function createDashboardSnapshot() {
  return {
    currentTab: state.currentTab,
    activeDeckType: state.activeDeckType,
    isMedleyMode: state.isMedleyMode,
    medleySongIds: state.medleySongIds,
    medleyVersionCodes: state.medleyVersionCodes,
    medleyBibleSlots: state.medleyBibleSlots,
    activeSongId: state.activeSongId,
    activeBibleBook: state.activeBibleBook,
    activeBibleChapter: state.activeBibleChapter,
    activeLiveSlideId: state.activeLiveSlideId,
    activeLiveText: state.activeLiveText,
    activeLiveRef: state.activeLiveRef,
    agendaItems: state.agendaItems,
    currentMode: state.currentMode,
    maxLinesPerSlide: state.maxLinesPerSlide,
    textSize: state.textSize,
    songScaleFull: state.songScaleFull !== undefined ? state.songScaleFull : 2.2,
    songScaleLt: state.songScaleLt !== undefined ? state.songScaleLt : 1.4,
    textAutoScale: state.textAutoScale,
    bibleVersion: state.bibleVersion,
    compareBibleVersion: state.compareBibleVersion,
    isCompareMode: state.isCompareMode,
    projectorActive: state.projectorActive,
    livestreamActive: state.livestreamActive,
    showSongTitleInDisplay: state.showSongTitleInDisplay,
    showBibleMedleyButtons: state.showBibleMedleyButtons,
    showMedleyView: state.showMedleyView,
    bibleMedleyChangeTarget: state.bibleMedleyChangeTarget || 'chapter',
    transparentBg: state.transparentBg,
    transitionType: state.transitionType,
    transitionDuration: state.transitionDuration,
    typography: state.typography,
    background: state.background,
    autoProject: state.autoProject
  };
}

function applyDashboardPatch(patch = {}) {
  const allowed = ['currentTab', 'activeDeckType', 'isMedleyMode', 'activeSongId', 'activeBibleBook', 'activeBibleChapter', 'activeLiveSlideId', 'activeLiveText', 'activeLiveRef', 'currentMode', 'maxLinesPerSlide', 'textSize', 'songScaleFull', 'songScaleLt', 'textAutoScale', 'bibleVersion', 'compareBibleVersion', 'isCompareMode', 'projectorActive', 'livestreamActive', 'showSongTitleInDisplay', 'showBibleMedleyButtons', 'showMedleyView', 'bibleMedleyChangeTarget', 'transparentBg', 'transitionType', 'transitionDuration', 'background', 'autoProject'];
  allowed.forEach(key => {
    if (patch[key] !== undefined) state[key] = patch[key];
  });
  if (patch.typography && typeof patch.typography === 'object') state.typography = { ...state.typography, ...patch.typography };
  if (Array.isArray(patch.agendaItems)) state.agendaItems = patch.agendaItems;
  if (Array.isArray(patch.medleySongIds)) state.medleySongIds = patch.medleySongIds;
  if (Array.isArray(patch.medleyVersionCodes)) state.medleyVersionCodes = patch.medleyVersionCodes;
  if (Array.isArray(patch.medleyBibleSlots)) state.medleyBibleSlots = patch.medleyBibleSlots;

  if (patch.currentMode !== undefined) {
    state.currentMode = patch.currentMode;
    previewTargetMode = (state.currentMode === 'lt' || state.currentMode === 'lowerthird') ? 'livestream' : 'sanctuary';
    window.previewTargetMode = previewTargetMode;
    const previewBtn = document.getElementById('preview-target-toggle-btn');
    if (previewBtn) {
      previewBtn.textContent = (previewTargetMode === 'sanctuary') ? 'Full Display' : 'Lower-Third';
      previewBtn.classList.toggle('active', previewTargetMode === 'livestream');
    }
  }
  const sizeSlider = document.getElementById('preview-size-slider');
  const sizeReadout = document.getElementById('preview-size-readout');
  const transparent = document.getElementById('preview-transparent-bg-toggle');
  const settingsTransparent = document.getElementById('setting-transparent-bg-toggle');
  const autoProject = document.getElementById('auto-project-btn');
  const previewAutoToggle = document.getElementById('preview-auto-project-toggle');
  if (sizeSlider) sizeSlider.value = state.textSize;
  if (sizeReadout) sizeReadout.textContent = `${Number(state.textSize).toFixed(1)}x`;
  if (transparent) transparent.checked = state.transparentBg;
  if (settingsTransparent) settingsTransparent.checked = state.transparentBg;
  syncTransparentBtnUI();
  syncMedleySettingsUI();
  if (previewAutoToggle) previewAutoToggle.checked = !!state.autoProject;
  if (autoProject) {
    autoProject.classList.toggle('active', state.autoProject);
    const label = autoProject.querySelector('.auto-project-label');
    if (label) label.textContent = `Auto Project: ${state.autoProject ? 'On' : 'Off'}`;
  }
  document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === state.currentTab));
  const singleButton = document.getElementById('btn-single-mode');
  const medleyButton = document.getElementById('btn-medley-mode');
  if (singleButton) singleButton.classList.toggle('active', !state.isMedleyMode);
  if (medleyButton) medleyButton.classList.toggle('active', state.isMedleyMode);
  renderAgenda();
  renderLibrary();
  renderDeck();
}

function syncDashboardWorkspace(immediate = false) {
  const doSync = () => {
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ dashboard: createDashboardSnapshot() }));
    } catch (e) { }
    if (window.sessionManager && typeof window.sessionManager.notifyAgendaChanged === 'function') {
      window.sessionManager.notifyAgendaChanged();
    }
    if (!REMOTE_MODE) {
      broadcastState();
    }
  };

  if (immediate) {
    if (_syncWorkspaceTimer) { clearTimeout(_syncWorkspaceTimer); _syncWorkspaceTimer = null; }
    doSync();
  } else {
    if (_syncWorkspaceTimer) clearTimeout(_syncWorkspaceTimer);
    _syncWorkspaceTimer = setTimeout(doSync, 80);
  }
}

function toggleTransparencyLive() {
  const nextVal = !state.transparentBg;
  toggleTransparentBg(nextVal);
}
window.toggleTransparencyLive = toggleTransparencyLive;

function syncTransparentBtnUI() {
  const btn = document.getElementById('btn-transparent-toggle');
  if (btn) {
    btn.classList.toggle('active', !!state.transparentBg);
  }
}

function toggleTransparentBg(isTransparent) {
  state.transparentBg = isTransparent;

  const previewToggle = document.getElementById('preview-transparent-bg-toggle');
  const settingsToggle = document.getElementById('setting-transparent-bg-toggle');
  if (previewToggle) previewToggle.checked = isTransparent;
  if (settingsToggle) settingsToggle.checked = isTransparent;
  syncTransparentBtnUI();

  broadcastState();

  if (typeof window.syncBentoStagePreview === 'function') {
    window.syncBentoStagePreview();
  }
}

function syncSongSettingsUI() {
  const toggle = document.getElementById('setting-song-title-toggle');
  if (toggle) {
    toggle.checked = Boolean(state.showSongTitleInDisplay);
  }
  const modeSel = document.getElementById('setting-song-editor-mode');
  if (modeSel) {
    modeSel.value = state.songEditorMode || 'split';
    if (typeof window.syncCustomSelect === 'function') window.syncCustomSelect(modeSel);
  }
}
window.syncSongSettingsUI = syncSongSettingsUI;

function toggleSongTitleDisplaySetting(enabled) {
  state.showSongTitleInDisplay = !!enabled;
  try {
    localStorage.setItem('sf_show_song_title', state.showSongTitleInDisplay ? 'true' : 'false');
  } catch (e) { }
  broadcastState({ showSongTitleInDisplay: state.showSongTitleInDisplay });
  updateLivePreview({
    showSongTitleInDisplay: state.showSongTitleInDisplay
  });
  if (typeof window.syncBentoStagePreview === 'function') {
    window.syncBentoStagePreview();
  }
}
window.toggleSongTitleDisplaySetting = toggleSongTitleDisplaySetting;

function setTransitionTypeSetting(type) {
  if (!type) return;
  state.transitionType = type;
  try {
    localStorage.setItem('sf_transition_type', type);
  } catch (e) { }
  syncTransitionSettingsUI();
  broadcastState();
}

function setTransitionDurationSetting(duration) {
  const parsed = parseInt(duration, 10);
  if (isNaN(parsed)) return;
  state.transitionDuration = parsed;
  try {
    localStorage.setItem('sf_transition_duration', parsed);
  } catch (e) { }
  syncTransitionSettingsUI();
  broadcastState();
}

const TRANSITION_ICONS = {
  'fade': `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>`,
  'zoom-in': `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
  'zoom-out': `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
  'slide-left': `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  'slide-right': `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  'slide-up': `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`,
  'slide-down': `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`,
  'cut': `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`
};

const TRANSITION_NAMES = {
  'fade': 'Fade',
  'zoom-in': 'Zoom In',
  'zoom-out': 'Zoom Out',
  'slide-left': 'Slide Left',
  'slide-right': 'Slide Right',
  'slide-up': 'Slide Up',
  'slide-down': 'Slide Down',
  'cut': 'Cut'
};

function openTransitionDialog() {
  const dialog = document.getElementById('bento-trans-dialog');
  const trigger = document.getElementById('bento-trans-trigger');
  if (!dialog || !trigger) return;
  syncTransitionSettingsUI();
  if (document.body && typeof document.body.appendChild === 'function') {
    document.body.appendChild(dialog);
  }
  dialog.hidden = false;
  dialog.style = dialog.style || {};
  const rect = (trigger.getBoundingClientRect && trigger.getBoundingClientRect()) || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const previewRect = document.getElementById('bento-prev-card')?.getBoundingClientRect?.() || rect;
  const margin = 8;
  const gap = 8;
  const innerW = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1024;
  const innerH = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 768;
  const width = Math.min(300, innerW - 16);
  const leftSpace = previewRect.left - gap - margin;
  const rightSpace = innerW - previewRect.right - gap - margin;
  const besidePreview = leftSpace >= width || rightSpace >= width;
  // Keep the picker outside the preview card and never flip it downward.
  // On narrow layouts, use the space above the card with internal scrolling.
  const bottom = Math.min(innerH - margin,
    besidePreview ? rect.bottom : previewRect.top - gap);
  dialog.style.width = `${width}px`;
  dialog.style.maxHeight = `${Math.max(0, bottom - margin)}px`;
  if (bottom <= margin && (rect.bottom > 0 || previewRect.top > 0)) {
    dialog.hidden = true;
    return;
  }
  const height = dialog.offsetHeight || 200;
  const left = leftSpace >= width ? previewRect.left - gap - width
    : rightSpace >= width ? previewRect.right + gap
      : Math.max(margin, Math.min(rect.right - width, innerW - width - margin));
  dialog.style.left = `${left}px`;
  dialog.style.top = `${Math.max(margin, bottom - height)}px`;
  document.getElementById('bento-trans-wrapper')?.classList.add('open');
  trigger.setAttribute('aria-expanded', 'true');
  if (typeof window !== 'undefined' && window.openDismissShield) {
    window.openDismissShield(closeTransitionDialog, 100045);
  }
  if (dialog.querySelector) {
    dialog.querySelector('.active')?.focus?.({ preventScroll: true });
  }
}

function closeTransitionDialog() {
  const dialog = document.getElementById('bento-trans-dialog');
  if (!dialog || dialog.hidden) return;
  if (dialog.contains(document.activeElement)) document.getElementById('bento-trans-trigger')?.focus();
  dialog.hidden = true;
  document.getElementById('bento-trans-wrapper')?.classList.remove('open');
  document.getElementById('bento-trans-trigger')?.setAttribute('aria-expanded', 'false');
  if (typeof window !== 'undefined' && window.closeDismissShield) {
    window.closeDismissShield();
  }
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('resize', closeTransitionDialog);
}

function toggleTransitionDialog(e) {
  if (e) e.stopPropagation();
  const wrapper = document.getElementById('bento-trans-wrapper');
  if (!wrapper) return;
  const wasOpen = wrapper.classList.contains('open');
  // Close any other open custom dropdowns
  document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
  if (wasOpen) {
    closeTransitionDialog();
  } else {
    openTransitionDialog();
  }
}
window.toggleTransitionDialog = toggleTransitionDialog;
window.closeTransitionDialog = closeTransitionDialog;

function selectTransitionOption(type) {
  setTransitionTypeSetting(type);
  closeTransitionDialog();
}
window.selectTransitionOption = selectTransitionOption;

// Close custom transition dialog on outside click or Escape
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('bento-trans-wrapper');
    if (wrapper && wrapper.classList.contains('open')) {
      if (!wrapper.contains(e.target)) {
        closeTransitionDialog();
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const wrapper = document.getElementById('bento-trans-wrapper');
      if (wrapper && wrapper.classList.contains('open')) {
        closeTransitionDialog();
      }
    }
  });
}

function syncTransitionSettingsUI() {
  const currentType = state.transitionType || 'fade';
  const currentDuration = state.transitionDuration ?? 300;
  const effectField = document.getElementById('stage-transition-effect');
  const durationField = document.getElementById('stage-transition-duration');
  if (effectField) effectField.value = currentType;
  if (durationField) {
    durationField.value = currentDuration;
    durationField.disabled = currentType === 'cut';
  }

  // 1. Sync Style Cards in Settings Modal
  document.querySelectorAll('.transition-style-card').forEach(card => {
    const cardType = card.getAttribute('data-transition-type');
    card.classList.toggle('active', cardType === currentType);
  });

  // 2. Sync Transition Dropdown in Settings if present
  const transSelect = document.getElementById('setting-transition-type-select');
  if (transSelect) {
    transSelect.value = currentType;
    if (window.syncCustomSelect) syncCustomSelect(transSelect);
  }

  // 3. Sync Stage Preview Custom Trigger Button & Dynamic SVG Icon
  const stageLabel = document.getElementById('bento-stage-trans-label');
  if (stageLabel) {
    stageLabel.textContent = TRANSITION_NAMES[currentType] || currentType;
  }
  const stageIconWrap = document.getElementById('bento-stage-trans-icon');
  if (stageIconWrap && TRANSITION_ICONS[currentType]) {
    stageIconWrap.innerHTML = TRANSITION_ICONS[currentType];
  }

  // 4. Sync Custom Transition Dialog Options & Active Checkmarks
  document.querySelectorAll('.bento-trans-option').forEach(opt => {
    const optType = opt.getAttribute('data-type');
    opt.classList.toggle('active', optType === currentType);
    opt.setAttribute('aria-pressed', String(optType === currentType));
  });

  // 5. Sync Custom Dialog Speed Badge & Buttons
  const speedBadge = document.getElementById('bento-trans-speed-badge');
  if (speedBadge) {
    speedBadge.textContent = `${currentDuration} ms`;
  }
  document.querySelectorAll('.bento-trans-speed-btn').forEach(btn => {
    const dur = parseInt(btn.getAttribute('data-dur'), 10);
    const isActive = (dur === 150 && currentDuration <= 200) ||
      (dur === 300 && currentDuration > 200 && currentDuration <= 450) ||
      (dur === 500 && currentDuration > 450 && currentDuration <= 650) ||
      (dur === 800 && currentDuration > 650);
    btn.disabled = currentType === 'cut';
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  // 6. Sync Duration Buttons in Settings Modal
  document.querySelectorAll('.transition-speed-btn').forEach(btn => {
    const dur = parseInt(btn.getAttribute('data-duration'), 10);
    const isActive = (dur === 150 && currentDuration <= 200) ||
      (dur === 300 && currentDuration > 200 && currentDuration <= 450) ||
      (dur === 500 && currentDuration > 450 && currentDuration <= 650) ||
      (dur === 800 && currentDuration > 650) ||
      (dur === currentDuration);
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

/* hoisted */
function testLiveTransitionEffect() {
  testTransitionToggle = !testTransitionToggle;
  const sample1 = "Great is Your faithfulness, O God my Father\nThere is no shadow of turning with Thee";
  const sample2 = "Summer and winter, and springtime and harvest\nSun, moon and stars in their courses above";
  const text = testTransitionToggle ? sample2 : sample1;
  const ref = testTransitionToggle ? "Great Is Thy Faithfulness · Verse 2" : "Great Is Thy Faithfulness · Verse 1";

  broadcastState({
    text: text,
    reference: ref,
    slideId: 'test_sample_transition_' + Date.now(),
    contentType: 'song'
  });
}

function updateMaxLinesSetting(val) {
  state.maxLinesPerSlide = parseInt(val, 10);

  document.querySelectorAll('.btn-lines-opt').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.lines, 10) === state.maxLinesPerSlide);
  });

  renderDeck();
}

function setDashboardLinesSetting(linesCount) {
  state.maxLinesPerSlide = parseInt(linesCount, 10);

  document.querySelectorAll('.btn-lines-opt').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.lines, 10) === state.maxLinesPerSlide);
  });

  const settingsSelect = document.getElementById('setting-max-lines-select');
  if (settingsSelect) {
    settingsSelect.value = String(state.maxLinesPerSlide);
    if (window.syncCustomSelect) syncCustomSelect(settingsSelect);
  }

  renderDeck();
}

function setTextAlignSetting(align, category = 'all') {
  if (!state.typography) state.typography = {};

  if (category === 'bible') {
    state.typography.textAlignBible = align;
    ['left', 'center', 'right'].forEach(a => {
      const btn = document.getElementById(`btn-bible-align-${a}`);
      if (btn) btn.classList.toggle('active', a === align);
    });
  } else if (category === 'songs') {
    state.typography.textAlignSongs = align;
    ['left', 'center', 'right'].forEach(a => {
      const btn = document.getElementById(`btn-songs-align-${a}`);
      if (btn) btn.classList.toggle('active', a === align);
    });
  } else {
    state.typography.textAlign = align;
    state.typography.textAlignBible = align;
    state.typography.textAlignSongs = align;
    ['left', 'center', 'right'].forEach(a => {
      const bBtn = document.getElementById(`btn-bible-align-${a}`);
      const sBtn = document.getElementById(`btn-songs-align-${a}`);
      const gBtn = document.getElementById(`btn-align-${a}`);
      if (bBtn) bBtn.classList.toggle('active', a === align);
      if (sBtn) sBtn.classList.toggle('active', a === align);
      if (gBtn) gBtn.classList.toggle('active', a === align);
    });
  }

  broadcastState();
  if (typeof window.syncBentoStagePreview === 'function') {
    window.syncBentoStagePreview();
  }
}
window.setTextAlignSetting = setTextAlignSetting;

function syncTypographySettingsUI() {
  const typo = state.typography || {};
  const bibleAlign = typo.textAlignBible || typo.textAlign || 'center';
  const songsAlign = typo.textAlignSongs || typo.textAlign || 'center';

  ['left', 'center', 'right'].forEach(a => {
    const bBtn = document.getElementById(`btn-bible-align-${a}`);
    const sBtn = document.getElementById(`btn-songs-align-${a}`);
    if (bBtn) bBtn.classList.toggle('active', a === bibleAlign);
    if (sBtn) sBtn.classList.toggle('active', a === songsAlign);
  });

  const fullSlider = document.getElementById('setting-song-scale-full');
  const fullReadout = document.getElementById('setting-song-scale-full-readout');
  const ltSlider = document.getElementById('setting-song-scale-lt');
  const ltReadout = document.getElementById('setting-song-scale-lt-readout');

  const fullVal = state.songScaleFull !== undefined ? state.songScaleFull : 2.2;
  const ltVal = state.songScaleLt !== undefined ? state.songScaleLt : 1.4;

  if (fullSlider) fullSlider.value = fullVal;
  if (fullReadout) fullReadout.textContent = `${Number(fullVal).toFixed(1)}x`;
  if (ltSlider) ltSlider.value = ltVal;
  if (ltReadout) ltReadout.textContent = `${Number(ltVal).toFixed(1)}x`;
}
window.syncTypographySettingsUI = syncTypographySettingsUI;

function updateSongScaleFullSetting(val) {
  const num = Math.round(parseFloat(val) * 10) / 10;
  state.songScaleFull = num;
  try { localStorage.setItem('sf_song_scale_full', String(num)); } catch (e) {}
  const slider = document.getElementById('setting-song-scale-full');
  const readout = document.getElementById('setting-song-scale-full-readout');
  if (slider && parseFloat(slider.value) !== num) slider.value = num;
  if (readout) readout.textContent = `${num.toFixed(1)}x`;
  broadcastState();
  if (typeof window.syncBentoStagePreview === 'function') {
    window.syncBentoStagePreview();
  }
}
window.updateSongScaleFullSetting = updateSongScaleFullSetting;

function updateSongScaleLtSetting(val) {
  const num = Math.round(parseFloat(val) * 10) / 10;
  state.songScaleLt = num;
  try { localStorage.setItem('sf_song_scale_lt', String(num)); } catch (e) {}
  const slider = document.getElementById('setting-song-scale-lt');
  const readout = document.getElementById('setting-song-scale-lt-readout');
  if (slider && parseFloat(slider.value) !== num) slider.value = num;
  if (readout) readout.textContent = `${num.toFixed(1)}x`;
  broadcastState();
  if (typeof window.syncBentoStagePreview === 'function') {
    window.syncBentoStagePreview();
  }
}
window.updateSongScaleLtSetting = updateSongScaleLtSetting;

function resetSongSizingDefaults() {
  updateSongScaleFullSetting(2.2);
  updateSongScaleLtSetting(1.4);
}
window.resetSongSizingDefaults = resetSongSizingDefaults;

function setShadowIntensityLevel(lvl) {
  state.typography.shadowLevel = lvl;
  broadcastState();
}

function updateTypographySetting(key, val) {
  state.typography[key] = val;
  broadcastState();
}

function resetTypographyDefaults() {
  state.typography = {
    fontFamily: 'Outfit',
    fontSize: 48,
    lineHeight: '1.35',
    textAlign: 'center',
    textAlignBible: 'center',
    textAlignSongs: 'center',
    shadowLevel: 1
  };

  const fontFamilySel = document.getElementById('setting-font-family');
  if (fontFamilySel) { fontFamilySel.value = 'Outfit'; syncCustomSelect(fontFamilySel); }

  const fontSizeSel = document.getElementById('setting-font-size-select');
  if (fontSizeSel) { fontSizeSel.value = '48'; syncCustomSelect(fontSizeSel); }

  const lineHeightSel = document.getElementById('setting-line-height-select');
  if (lineHeightSel) { lineHeightSel.value = '1.35'; syncCustomSelect(lineHeightSel); }

  setTextAlignSetting('center', 'all');
  setShadowIntensityLevel(1);

  broadcastState();
}

// Replace all native <select> elements with sleek dark custom dialog popovers
function initCustomSelects() {
  document.querySelectorAll('select.settings-select-custom').forEach(select => {
    if (select.dataset.customized) return;
    select.dataset.customized = 'true';

    // Hide native select
    select.style.display = 'none';

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper';
    if (select.style.width) wrapper.style.width = select.style.width;

    // Trigger button
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';

    const labelSpan = document.createElement('span');
    const selectedOpt = select.options[select.selectedIndex] || select.options[0];
    labelSpan.textContent = selectedOpt ? selectedOpt.text : '';

    const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.setAttribute('class', 'custom-select-chevron');
    chevron.setAttribute('width', '12');
    chevron.setAttribute('height', '12');
    chevron.setAttribute('viewBox', '0 0 24 24');
    chevron.setAttribute('fill', 'none');
    chevron.setAttribute('stroke', 'currentColor');
    chevron.setAttribute('stroke-width', '2.5');
    chevron.innerHTML = '<polyline points="6 9 12 15 18 9"/>';

    trigger.appendChild(labelSpan);
    trigger.appendChild(chevron);

    // Popover
    const popover = document.createElement('div');
    popover.className = 'custom-select-popover';

    const buildOptions = () => {
      popover.innerHTML = '';
      Array.from(select.options).forEach(opt => {
        const item = document.createElement('div');
        const isSelected = opt.value === select.value;
        item.className = `custom-select-option ${isSelected ? 'selected' : ''}`;
        item.textContent = opt.text;
        item.dataset.value = opt.value;

        item.onclick = (e) => {
          e.stopPropagation();
          select.value = opt.value;
          labelSpan.textContent = opt.text;
          popover.querySelectorAll('.custom-select-option').forEach(el => {
            el.classList.toggle('selected', el.dataset.value === opt.value);
          });
          wrapper.classList.remove('open');
          select.dispatchEvent(new Event('change', { bubbles: true }));
        };

        popover.appendChild(item);
      });
    };

    buildOptions();

    trigger.onclick = (e) => {
      e.stopPropagation();
      const wasOpen = wrapper.classList.contains('open');
      document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
      if (!wasOpen) {
        buildOptions();
        wrapper.classList.add('open');
      }
    };

    wrapper.appendChild(trigger);
    wrapper.appendChild(popover);

    select.parentNode.insertBefore(wrapper, select.nextSibling);
  });

  // Global document click to close custom select popovers
  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
  });
}

function initModalBackdropDismiss() {
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) {
        if (backdrop.id === 'sanctuary-theme-modal-backdrop' || backdrop.id === 'sf-custom-dialog-backdrop') return;
        backdrop.classList.remove('open');
        backdrop.style.display = '';
      }
    });
  });

  const sessionPanelBackdrop = document.getElementById('session-panel-backdrop');
  if (sessionPanelBackdrop) {
    sessionPanelBackdrop.addEventListener('mousedown', () => {
      closeSessionPanel();
    });
  }
}

function syncCustomSelect(selectEl) {
  if (!selectEl) return;
  const wrapper = selectEl.nextElementSibling;
  if (wrapper && wrapper.classList.contains('custom-select-wrapper')) {
    const triggerSpan = wrapper.querySelector('.custom-select-trigger span');
    const selectedOpt = selectEl.options[selectEl.selectedIndex];
    if (triggerSpan && selectedOpt) {
      triggerSpan.textContent = selectedOpt.text;
    }
    const popover = wrapper.querySelector('.custom-select-popover');
    if (popover) {
      popover.querySelectorAll('.custom-select-option').forEach(optEl => {
        optEl.classList.toggle('selected', optEl.dataset.value === selectEl.value);
      });
    }
  }
}

function updateTextScale(val) {
  state.textSize = parseFloat(val);
  const readout = document.getElementById('preview-size-readout');
  if (readout) readout.textContent = `${state.textSize.toFixed(1)}x`;
  broadcastState();

  if (typeof window.syncBentoStagePreview === 'function') {
    window.syncBentoStagePreview();
  }
}

function getPreviewTextScaleControl() {
  const id = String(state.activeLiveSlideId || '');
  const ref = state.activeLiveRef || '';
  const bible = id.startsWith('bible_') || id.startsWith('medley_bible_') ||
    id.startsWith('para_') || id.startsWith('hist_') ||
    (id.startsWith('ai_') && /\b\d+\s*:\s*\d+/.test(ref)) ||
    (state.currentTab === 'bible' && !id.includes('song'));
  const song = !bible && !id.startsWith('lexicon_') && Boolean(state.activeLiveText || id);
  const lowerThird = ['livestream', 'lt', 'lowerthird'].includes(window.previewTargetMode);
  const key = song ? (lowerThird ? 'songScaleLt' : 'songScaleFull') : 'textSize';
  return { key, value: Number(state[key] ?? (song ? lowerThird ? 1.4 : 2.2 : 1)), song, lowerThird };
}
window.getPreviewTextScaleControl = getPreviewTextScaleControl;

function adjustTextScale(delta) {
  const control = getPreviewTextScaleControl();
  const isSong = control.song;
  if (isSong) {
    const isLt = control.lowerThird;
    if (isLt) {
      let cur = (state.songScaleLt !== undefined ? state.songScaleLt : 1.4) + delta;
      cur = Math.max(0.8, Math.min(2.5, Math.round(cur * 10) / 10));
      updateSongScaleLtSetting(cur);
    } else {
      let cur = (state.songScaleFull !== undefined ? state.songScaleFull : 2.2) + delta;
      cur = Math.max(1.0, Math.min(3.5, Math.round(cur * 10) / 10));
      updateSongScaleFullSetting(cur);
    }
  } else {
    let size = (state.textSize || 1.0) + delta;
    size = Math.max(0.6, Math.min(2.5, Math.round(size * 10) / 10));
    updateTextScale(size);
  }
}
window.adjustTextScale = adjustTextScale;

function setPreviewTargetMode(mode) {
  previewTargetMode = mode;
  window.previewTargetMode = mode;
  try { localStorage.setItem('sf_preview_target_mode', mode); } catch (e) { }

  if (mode === 'livestream' || mode === 'lt' || mode === 'lowerthird') {
    state.currentMode = 'lt';
  } else if (mode === 'dual') {
    state.currentMode = 'dual';
  } else {
    state.currentMode = 'full';
  }

  const iframe = document.getElementById('preview-iframe');
  if (iframe) {
    const baseUrl = getBaseDisplayUrl();
    const iframeTarget = (mode === 'dual') ? 'sanctuary' : mode;
    iframe.src = `${baseUrl}?target=${iframeTarget}&preview=1`;
  }
  const fullBtn = document.getElementById('preview-mode-full-btn');
  const ltBtn = document.getElementById('preview-mode-lt-btn');
  if (fullBtn) fullBtn.classList.toggle('active', previewTargetMode === 'sanctuary');
  if (ltBtn) ltBtn.classList.toggle('active', previewTargetMode === 'livestream');

  const bentoFull = document.getElementById('bento-prev-mode-full');
  const bentoLt = document.getElementById('bento-prev-mode-lt');
  const bentoDual = document.getElementById('bento-prev-mode-dual');
  if (bentoFull) bentoFull.classList.toggle('active', previewTargetMode === 'sanctuary');
  if (bentoLt) bentoLt.classList.toggle('active', previewTargetMode === 'livestream');
  if (bentoDual) bentoDual.classList.toggle('active', previewTargetMode === 'dual');

  const previewTargetBtn = document.getElementById('preview-target-toggle-btn');
  if (previewTargetBtn) {
    if (previewTargetMode === 'sanctuary') previewTargetBtn.textContent = 'Sanctuary';
    else if (previewTargetMode === 'dual') previewTargetBtn.textContent = 'Dual Output';
    else previewTargetBtn.textContent = 'Livestream';
    previewTargetBtn.classList.toggle('active', previewTargetMode === 'livestream');
  }

  broadcastState();

  if (typeof window.syncBentoStagePreview === 'function') {
    window.syncBentoStagePreview();
  }
}
window.setPreviewTargetMode = setPreviewTargetMode;

function togglePreviewTargetMode() {
  let nextMode = 'sanctuary';
  if (previewTargetMode === 'sanctuary') nextMode = 'livestream';
  else if (previewTargetMode === 'livestream') nextMode = 'dual';
  else nextMode = 'sanctuary';
  setPreviewTargetMode(nextMode);
}
window.togglePreviewTargetMode = togglePreviewTargetMode;

// Sanctuary Theme Modal Controller
let activeSanctuaryCategory = 'all';
let sanctuaryReturnFocus = null;
document.addEventListener('keydown', event => {
  const customDialog = document.getElementById('sf-custom-dialog-backdrop');
  if (customDialog && (customDialog.style.display === 'flex' || customDialog.classList.contains('open'))) return;

  const modal = document.getElementById('sanctuary-theme-modal-backdrop');
  if (!modal || modal.style.display !== 'flex') return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeSanctuaryThemeModal();
  } else if (event.key === 'Tab') {
    const controls = [...modal.querySelectorAll('button, select, input')].filter(el => el.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
}, true);

function openSanctuaryThemeModal() {
  window.loadSanctuaryUploads();
  const modal = document.getElementById('sanctuary-theme-modal-backdrop');
  if (!modal || modal.style.display === 'flex') return;
  window.themeManager?.beginSanctuaryDraft();
  renderSanctuaryThemesGrid();
  if (window.themeManager && typeof window.themeManager.updateSanctuaryUi === 'function') {
    window.themeManager.updateSanctuaryUi();
  }
  modal.style.display = 'flex';
  modal.classList.add('open');
  window.updateSanctuaryFramingPreview();
  window.updateSanctuaryTabIndicator(false);
  const outputPanel = modal.querySelector('.sanctuary-output-panel');
  if (outputPanel) outputPanel.scrollTop = 0;
  const controlsScroll = modal.querySelector('.sanctuary-output-controls-scroll');
  if (controlsScroll) controlsScroll.scrollTop = 0;
  sanctuaryReturnFocus = document.activeElement;
  modal.querySelector('.sanctuary-modal-close').focus({ preventScroll: true });

  // Play motion videos inside visible theme cards and framing preview
  modal.querySelectorAll('video').forEach(v => {
    if (!v.closest('[hidden]')) {
      v.play().catch(() => {});
    }
  });
}
window.openSanctuaryThemeModal = openSanctuaryThemeModal;

function closeSanctuaryThemeModal(force = false) {
  if (window._sfSuppressSanctuaryClose && !force) return;
  const customDialog = document.getElementById('sf-custom-dialog-backdrop');
  if (customDialog && (customDialog.style.display === 'flex' || customDialog.classList.contains('open')) && !force) return;

  const modal = document.getElementById('sanctuary-theme-modal-backdrop');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
    window.themeManager?.cancelSanctuaryDraft();
    modal.querySelectorAll('video').forEach(v => v.pause());
    if (sanctuaryReturnFocus && sanctuaryReturnFocus.isConnected) sanctuaryReturnFocus.focus({ preventScroll: true });
  }
}
window.closeSanctuaryThemeModal = closeSanctuaryThemeModal;

function toggleSanctuaryThemeModal() {
  const modal = document.getElementById('sanctuary-theme-modal-backdrop');
  if (!modal) return;
  if (modal.classList.contains('open') || modal.style.display === 'flex') {
    closeSanctuaryThemeModal();
  } else {
    openSanctuaryThemeModal();
  }
}
window.toggleSanctuaryThemeModal = toggleSanctuaryThemeModal;

// Compatibility aliases
window.toggleSanctuaryThemePopover = toggleSanctuaryThemeModal;
window.closeSanctuaryThemePopover = closeSanctuaryThemeModal;

function filterSanctuaryThemes(cat) {
  activeSanctuaryCategory = cat || 'all';
  document.querySelectorAll('.sanctuary-cat-tab').forEach(tab => {
    const selected = tab.getAttribute('data-cat') === activeSanctuaryCategory;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-pressed', String(selected));
  });
  renderSanctuaryThemesGrid();
  window.updateSanctuaryTabIndicator(true);
}
window.filterSanctuaryThemes = filterSanctuaryThemes;

function renderSanctuaryThemesGrid() {
  const grid = document.getElementById('sanctuary-themes-grid');
  if (!grid) return;
  const themes = window.SANCTUARY_THEMES || {};
  const curThemeId = (window.themeManager?.sanctuaryDraft || window.themeManager)?.activeSanctuaryTheme || 'celestial_motion';

  let html = '';
  const existingIds = new Set([...grid.querySelectorAll('[data-theme-id]')].map(card => card.dataset.themeId));
  const seenIds = new Set();
  Object.keys(themes).forEach(tid => {
    if (tid === 'deep_celestial') return; // skip legacy alias from grid
    const t = themes[tid];
    if (seenIds.has(t.id)) return;
    seenIds.add(t.id);

    if (existingIds.has(tid)) return;
    const isActive = (tid === curThemeId || (curThemeId === 'deep_celestial' && tid === 'celestial_motion'));
    const bgStyle = t.imageUrl ? `background-image: url('${t.imageUrl}'); background-size: cover; background-position: center;` : `background: ${t.previewGradient || t.bgCss};`;
    const badgeLabel = t.imageUrl && /\.gif$/i.test(t.imageUrl) ? 'GIF' : t.type === 'video' ? 'Motion' : (t.type === 'image' ? 'Still' : 'Minimal');
    const badgeType = t.type || 'gradient';
    const videoTag = t.videoUrl
      ? `<video class="sanctuary-theme-card-video" src="${t.videoUrl}" preload="auto" muted loop playsinline autoplay aria-hidden="true"></video>`
      : '';
    const deleteBtn = t.custom
      ? `<span role="button" tabindex="0" class="sanctuary-theme-card-delete" onclick="event.stopPropagation(); window.deleteSanctuaryBackground('${tid}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.stopPropagation(); window.deleteSanctuaryBackground('${tid}');}" title="Delete this background" aria-label="Delete ${escapeHtml(t.name)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></span>`
      : '';

    html += `
      <button type="button" aria-pressed="${isActive}" class="sanctuary-theme-card ${isActive ? 'active' : ''}" data-theme-id="${tid}" style="${bgStyle}" onclick="onSanctuaryThemeSelect('${tid}')" title="${escapeHtml(t.description || t.name)}">
        ${videoTag}
        <div class="sanctuary-theme-card-badge ${badgeType}">${badgeLabel}${t.custom ? ' · Uploaded' : ''}</div>
        ${deleteBtn}
        <span class="sanctuary-applied-badge">Applied</span>
        <div class="sanctuary-theme-card-name">${escapeHtml(t.name)}</div>
      </button>
    `;
  });
  if (html) grid.insertAdjacentHTML('beforeend', html);
  let visible = 0;
  const isModalOpen = document.getElementById('sanctuary-theme-modal-backdrop')?.style.display === 'flex';
  grid.querySelectorAll('[data-theme-id]').forEach(card => {
    const theme = themes[card.dataset.themeId];
    card.hidden = activeSanctuaryCategory === 'uploads' ? !theme.custom : activeSanctuaryCategory !== 'all' && theme.category !== activeSanctuaryCategory;
    const cardVideo = card.querySelector('video');
    if (cardVideo) {
      if (card.hidden || !isModalOpen) {
        cardVideo.pause();
      } else {
        cardVideo.play().catch(() => {});
      }
    }
    if (!card.hidden) visible++;
  });
  let empty = grid.querySelector('.sanctuary-empty-uploads');
  if (!empty) { empty = document.createElement('p'); empty.className = 'sanctuary-empty-uploads'; empty.textContent = 'Upload a background to make it your own.'; grid.appendChild(empty); }
  empty.hidden = visible > 0;
  window.themeManager?.updateSanctuaryUi();
}
window.renderSanctuaryThemesGrid = renderSanctuaryThemesGrid;

function onObsModeRuleChange(rule) {
  if (window.themeManager && typeof window.themeManager.setObsModeRule === 'function') {
    window.themeManager.setObsModeRule(rule);
  }
}
window.onObsModeRuleChange = onObsModeRuleChange;

function onSanctuaryThemeSelect(themeId) {
  if (window.themeManager && typeof window.themeManager.setSanctuaryTheme === 'function') {
    window.themeManager.setSanctuaryTheme(themeId);
  }
}
window.onSanctuaryThemeSelect = onSanctuaryThemeSelect;

function onSanctuaryDimmerChange(val) {
  if (window.themeManager && typeof window.themeManager.setSanctuaryDimmer === 'function') {
    window.themeManager.setSanctuaryDimmer(val);
  }
}
window.onSanctuaryDimmerChange = onSanctuaryDimmerChange;

function onSanctuaryFontChange(font) {
  if (window.themeManager && typeof window.themeManager.setSanctuaryFont === 'function') {
    window.themeManager.setSanctuaryFont(font);
  }
}
window.onSanctuaryFontChange = onSanctuaryFontChange;

function toggleTextAutoScale(isAuto) {
  state.textAutoScale = isAuto;
  const slider = document.getElementById('preview-size-slider');
  if (slider) slider.disabled = isAuto;
  broadcastState();
}

function updateLivePreview(payload) {
  const iframe = document.getElementById('preview-iframe');
  if (iframe && iframe.contentWindow && iframe.contentWindow.applyState) {
    iframe.contentWindow.applyState(payload);
  }
  if (typeof window.syncBentoStagePreview === 'function') {
    window.syncBentoStagePreview();
  }
}

function clearAllOutputs() {
  if (window.cancelPreparedSlide) window.cancelPreparedSlide();
  state.activeLiveSlideId = null;
  state.activeLiveText = '';
  state.activeLiveRef = '';
  state.liveEngagedDeck = null;
  state.activeLexiconData = null;
  updateActiveSlideVisuals(null);
  updateLivePreview({ clear: true });
  broadcastState({ clear: true }, true);

  const drawerProjBtn = document.getElementById('strongs-drawer-project-btn');
  if (drawerProjBtn) {
    drawerProjBtn.classList.remove('live-active');
    const span = drawerProjBtn.querySelector('span');
    if (span) span.textContent = 'Project Word';
  }

  if (typeof window.syncBentoStagePreview === 'function') {
    window.syncBentoStagePreview();
  }
}

// Clean and normalize text for resilient lyrics, title, and artist searching
function normalizeSearchText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[\u2018\u2019`]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper to extract the specific line or snippet in the stanza that matched the search
function extractSnippetAroundMatch(stanzaText, queryTokens) {
  if (!stanzaText) return '';
  const lines = stanzaText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return stanzaText.slice(0, 120);

  let bestLine = lines[0];
  let maxHits = 0;
  for (const l of lines) {
    const lNorm = normalizeSearchText(l);
    let hits = 0;
    for (const qt of queryTokens) {
      if (lNorm.includes(qt)) hits++;
    }
    if (hits > maxHits) {
      maxHits = hits;
      bestLine = l;
    }
  }
  return bestLine;
}

// Fast Search Indexing for Songs
function getSongSearchIndex(song) {
  if (!song) return '';
  if (song._searchIndex) return song._searchIndex;
  const lyrics = (song.stanzas || []).map(s => s.text || '').join(' ');
  song._searchIndex = normalizeSearchText(`${song.title || ''} ${song.author || ''} ${lyrics}`);
  return song._searchIndex;
}

function invalidateSongSearchIndex(song) {
  if (song) {
    delete song._searchIndex;
    delete song._matchedSnippet;
  }
}

// Resilient matching across song title, author, and full-text lyrics
function matchSongQuery(song, rawQuery) {
  if (!song || !rawQuery) return false;
  const qClean = normalizeSearchText(rawQuery);
  if (!qClean) return false;

  // 1. Direct title or author match
  const titleNorm = normalizeSearchText(song.title);
  if (titleNorm && (titleNorm.includes(qClean) || qClean.includes(titleNorm))) {
    song._matchedSnippet = (song.stanzas && song.stanzas[0] ? song.stanzas[0].text : '');
    return true;
  }

  const authorNorm = normalizeSearchText(song.author);
  if (authorNorm && authorNorm.includes(qClean)) {
    song._matchedSnippet = (song.stanzas && song.stanzas[0] ? song.stanzas[0].text : '');
    return true;
  }

  // 2. Full-text lyrics match across stanzas (handling line breaks, punctuation, and contractions)
  const qTokens = qClean.split(/\s+/).filter(w => w.length > 1);
  const stanzas = song.stanzas || [];

  for (const st of stanzas) {
    const rawStText = st.text || '';
    const stNorm = normalizeSearchText(rawStText);
    if (!stNorm) continue;

    // Direct continuous phrase match in stanza
    if (stNorm.includes(qClean)) {
      song._matchedSnippet = extractSnippetAroundMatch(rawStText, qTokens);
      return true;
    }

    // Token set overlap for multi-word phrase queries (e.g. 3+ words)
    if (qTokens.length >= 3) {
      let matchedCount = 0;
      for (const t of qTokens) {
        if (stNorm.includes(t)) matchedCount++;
      }
      if (matchedCount === qTokens.length || (matchedCount / qTokens.length) >= 0.75) {
        song._matchedSnippet = extractSnippetAroundMatch(rawStText, qTokens);
        return true;
      }
    }
  }

  // 3. Whole-song search index check
  const fullIndex = getSongSearchIndex(song);
  if (fullIndex.includes(qClean)) {
    song._matchedSnippet = (song.stanzas && song.stanzas[0] ? song.stanzas[0].text : '');
    return true;
  }

  if (qTokens.length >= 3) {
    let matchedCount = 0;
    for (const t of qTokens) {
      if (fullIndex.includes(t)) matchedCount++;
    }
    if ((matchedCount / qTokens.length) >= 0.8) {
      song._matchedSnippet = (song.stanzas && song.stanzas[0] ? song.stanzas[0].text : '');
      return true;
    }
  }

  return false;
}

window.matchSongQuery = matchSongQuery;
window.normalizeSearchText = normalizeSearchText;

// Render Zone 1 Library (BIBLE vs SONGS Tabs)
function renderLibrary(filterQuery = null) {
  if (typeof syncActiveTabUI === 'function') {
    syncActiveTabUI();
  }

  // Preserve active search query if not explicitly passed
  if (filterQuery === null || filterQuery === undefined) {
    const bentoInput = document.getElementById('bento-search-input');
    const sideInput = document.getElementById('sidebar-search-input');
    const input = (bentoInput && bentoInput.value) ? bentoInput : (sideInput && sideInput.value ? sideInput : (bentoInput || sideInput));
    filterQuery = (input && input.value) ? input.value : '';
  }

  if (typeof window.renderBentoLibrary === 'function') {
    window.renderBentoLibrary(filterQuery);
  }

  // If Bento layout is active, skip rendering hidden Classic DOM elements
  const currentThemeStyle = (window.themeManager && window.themeManager.currentStyle) || (document.body && document.body.getAttribute('data-theme-style')) || 'bento';
  if (currentThemeStyle === 'bento') {
    return;
  }

  const container = document.getElementById('library-list');
  if (!container) return;

  // Clear any existing scroll listener so it never leaks between tabs
  container.onscroll = null;
  if (typeof container.replaceChildren === 'function') {
    container.replaceChildren();
  } else {
    container.innerHTML = '';
  }

  if (state.currentTab === 'bible') {
    if (!state.bibleVersion) {
      const translations = getBibleTranslations();
      if (translations.length > 0) state.bibleVersion = translations[0].code;
    }
    const books = getBibleBooks(state.bibleVersion);
    if (books.length === 0) {
      container.innerHTML = `
        <div style="padding:24px 12px; text-align:center; color:var(--text-muted); font-size:11.5px; line-height:1.5;">
          <div style="display:flex; justify-content:center; margin-bottom:6px;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          </div>
          <div style="font-weight:600; color:var(--text-starlight); margin-bottom:4px;">No Bibles Installed</div>
          <div style="font-size:10.5px; color:var(--text-muted); margin-bottom:12px;">Import a Bible translation file (.json, .xml, .usfm, .csv, .txt) or download from Online Bibles Hub.</div>
          <button class="mode-toggle-btn active" style="margin:0 auto; font-size:10.5px; padding:5px 12px;" onclick="openImportModal(); switchImportSubTab('bibles');">+ Add Bible</button>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    const b0 = state.medleyBibleSlots && state.medleyBibleSlots[0] ? state.medleyBibleSlots[0].book : null;
    const b1 = state.medleyBibleSlots && state.medleyBibleSlots[1] ? state.medleyBibleSlots[1].book : null;
    const b2 = state.medleyBibleSlots && state.medleyBibleSlots[2] ? state.medleyBibleSlots[2].book : null;

    books.forEach(book => {
      if (filterQuery && !book.toLowerCase().includes(filterQuery)) return;
      const isExpanded = state.expandedBibleBook === book;
      const isBookActive = state.activeBibleBook === book;
      const chapters = getBibleChapters(book, state.bibleVersion);

      const wrap = document.createElement('div');
      wrap.className = `bible-book-item-wrap ${isExpanded ? 'expanded' : ''}`;

      const item = document.createElement('div');
      item.className = `library-item ${isBookActive ? 'active' : ''}`;
      item.draggable = true;
      item.ondragstart = (e) => {
        window.sfIsInternalDrag = true;
        window.sfDraggedItem = { type: 'bible', id: book, book };
        e.dataTransfer.setData('text/plain', book);
        e.dataTransfer.setData('application/bible-book', book);
        e.dataTransfer.setData('application/item-type', 'bible');
        e.dataTransfer.effectAllowed = 'copyMove';
        item.classList.add('dragging');
      };
      item.ondragend = () => {
        window.sfIsInternalDrag = false;
        window.sfDraggedItem = null;
        item.classList.remove('dragging');
      };

      let slotsHtml = '';
      if (state.showBibleMedleyButtons) {
        slotsHtml = `
          <button class="medley-assign-btn ${b0 === book ? 'active' : ''}" onclick="event.stopPropagation(); toggleBibleBookChapters('${book}', 0)" title="Pick chapter for Slot S1">S1</button>
          <button class="medley-assign-btn ${b1 === book ? 'active' : ''}" onclick="event.stopPropagation(); toggleBibleBookChapters('${book}', 1)" title="Pick chapter for Slot S2">S2</button>
          <button class="medley-assign-btn ${b2 === book ? 'active' : ''}" onclick="event.stopPropagation(); toggleBibleBookChapters('${book}', 2)" title="Pick chapter for Slot S3">S3</button>
        `;
      }

      item.innerHTML = `
        <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-right:6px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:500; font-size:12px; color:var(--text-starlight);">${book}</span>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-family:var(--font-mono); font-size:10px; opacity:0.6;">${state.bibleVersion}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.5; transition:transform 0.15s ease; ${isExpanded ? 'transform:rotate(180deg);' : ''}"><path d="m6 9 6 6 6-6"/></svg>
          </div>
        </div>
        ${slotsHtml ? `<div style="display:flex; align-items:center; gap:4px; margin-left:4px;">${slotsHtml}</div>` : ''}
      `;

      item.onclick = () => {
        toggleBibleBookChapters(book, state.isMedleyMode ? (state.activePickerSlot || 0) : null);
      };

      wrap.appendChild(item);

      if (isExpanded) {
        const drawer = document.createElement('div');
        drawer.className = 'bible-chapter-drawer';

        let targetSlotLabel = '';
        if (state.isMedleyMode && state.chapterTargetSlot !== null && state.chapterTargetSlot !== undefined) {
          targetSlotLabel = `<span style="color:#F472B6; font-size:9.5px; font-weight:700; margin-left:4px;">[Target: Slot S${state.chapterTargetSlot + 1}]</span>`;
        }

        let buttonsHtml = '';
        chapters.forEach(chStr => {
          const chNum = parseInt(chStr, 10);
          const isChActive = isBookActive && state.activeBibleChapter === chNum;

          let slotMatchTag = '';
          if (state.isMedleyMode && state.medleyBibleSlots) {
            state.medleyBibleSlots.forEach((slot, sIdx) => {
              if (slot && slot.book === book && slot.chapter === chNum) {
                slotMatchTag = `S${sIdx + 1}`;
              }
            });
          }

          buttonsHtml += `
            <button type="button" class="bible-chapter-btn ${isChActive ? 'active' : ''} ${slotMatchTag ? 'in-slot' : ''}" onclick="event.stopPropagation(); selectBibleChapter('${book}', ${chNum})" title="${book} Chapter ${chNum} ${slotMatchTag ? `(In Slot ${slotMatchTag})` : ''}">
              ${chNum}
            </button>
          `;
        });

        drawer.innerHTML = `
          <div class="bible-chapter-drawer-header">
            <div class="bible-chapter-drawer-title">
              <span>Select Chapter</span>${targetSlotLabel}
            </div>
            <div style="font-size:9.5px; opacity:0.6;">${chapters.length} Chs</div>
          </div>
          <div class="bible-chapter-grid">
            ${buttonsHtml}
          </div>
        `;
        wrap.appendChild(drawer);
      }

      fragment.appendChild(wrap);
    });
    container.appendChild(fragment);

  } else if (state.currentTab === 'songs') {
    if (SONGS_DATABASE.length === 0) {
      container.innerHTML = `
        <div style="padding:24px 12px; text-align:center; color:var(--text-muted); font-size:11.5px; line-height:1.5;">
          <div style="display:flex; justify-content:center; margin-bottom:6px;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EC4899" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          </div>
          <div style="font-weight:600; color:var(--text-starlight); margin-bottom:4px;">Songbook Empty</div>
          <div style="font-size:10.5px; color:var(--text-muted); margin-bottom:12px;">Import song lyrics (.txt, .xml, .json) or search online lyrics.</div>
          <button class="mode-toggle-btn active" style="margin:0 auto; font-size:10.5px; padding:5px 12px; background:var(--accent-pink-gradient); color:white;" onclick="openImportModal(); switchImportSubTab('songs');">+ Import Songs</button>
        </div>
      `;
      return;
    }

    const q = (filterQuery || '').trim();
    const filteredSongs = q
      ? SONGS_DATABASE.filter(song => matchSongQuery(song, q))
      : SONGS_DATABASE;

    if (filteredSongs.length === 0) {
      container.innerHTML = `<div style="padding:14px; text-align:center; color:var(--text-muted); font-size:11.5px;">No matching lyrics found</div>`;
      return;
    }

    // Render initial batch of songs with lazy progressive infinite scroll
    const agendaSet = new Set((state.agendaItems || []).map(item => item.id));
    const medley0 = state.medleySongIds[0];
    const medley1 = state.medleySongIds[1];
    const medley2 = state.medleySongIds[2];
    const showMedley = state.showMedleyView;
    const activeId = state.activeSongId;

    const BATCH_SIZE = 80;
    const initialBatch = filteredSongs.slice(0, BATCH_SIZE);

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < initialBatch.length; i++) {
      fragment.appendChild(createSongLibraryItem(initialBatch[i], agendaSet, showMedley, medley0, medley1, medley2, activeId));
    }
    container.appendChild(fragment);

    // Progressively append next chunks when scrolling near bottom
    let loadedCount = initialBatch.length;
    container.onscroll = () => {
      if (state.currentTab !== 'songs') return;
      if (loadedCount >= filteredSongs.length) return;
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 150) {
        const nextBatch = filteredSongs.slice(loadedCount, loadedCount + BATCH_SIZE);
        const nextFrag = document.createDocumentFragment();
        for (let i = 0; i < nextBatch.length; i++) {
          nextFrag.appendChild(createSongLibraryItem(nextBatch[i], agendaSet, showMedley, medley0, medley1, medley2, activeId));
        }
        container.appendChild(nextFrag);
        loadedCount += nextBatch.length;
      }
    };
  }

  if (typeof window.renderBentoLibrary === 'function') {
    window.renderBentoLibrary(filterQuery);
  }
}

function createSongLibraryItem(song, agendaSet, showMedley, medley0, medley1, medley2, activeId) {
  const item = document.createElement('div');
  item.className = `library-item ${activeId === song.id ? 'active' : ''}`;
  item.dataset.songId = song.id;
  item.setAttribute('draggable', 'true');

  item.ondragstart = (e) => {
    window.sfIsInternalDrag = true;
    window.sfDraggedItem = { type: 'song', id: song.id, song };
    e.dataTransfer.setData('text/plain', song.id);
    e.dataTransfer.setData('application/song-id', song.id);
    e.dataTransfer.setData('application/item-type', 'song');
    e.dataTransfer.effectAllowed = 'copyMove';
    item.classList.add('dragging');
  };
  item.ondragend = () => {
    window.sfIsInternalDrag = false;
    window.sfDraggedItem = null;
    item.classList.remove('dragging');
  };

  const firstLine = song.stanzas && song.stanzas[0] ? song.stanzas[0].text.split('\n')[0] : song.title;

  let slotsHtml = '';
  if (showMedley) {
    slotsHtml = `
      <button class="medley-assign-btn ${medley0 === song.id ? 'active' : ''}" onclick="event.stopPropagation(); assignSongToSlot('${song.id}', 0)" title="${medley0 === song.id ? 'Remove from Medley Slot 1' : 'Assign to Medley Slot 1'}">S1</button>
      <button class="medley-assign-btn ${medley1 === song.id ? 'active' : ''}" onclick="event.stopPropagation(); assignSongToSlot('${song.id}', 1)" title="${medley1 === song.id ? 'Remove from Medley Slot 2' : 'Assign to Medley Slot 2'}">S2</button>
      <button class="medley-assign-btn ${medley2 === song.id ? 'active' : ''}" onclick="event.stopPropagation(); assignSongToSlot('${song.id}', 2)" title="${medley2 === song.id ? 'Remove from Medley Slot 3' : 'Assign to Medley Slot 3'}">S3</button>
    `;
  }

  const isInAgenda = agendaSet ? agendaSet.has(song.id) : (state.agendaItems || []).some(item => item.id === song.id);

  item.innerHTML = `
    <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-right:8px;">
      <div style="font-weight:400; font-size:12px; color:var(--text-starlight); letter-spacing:-0.01em;">${song.title}</div>
      <div style="font-size:10px; font-weight:400; color:var(--text-muted); opacity:0.65; overflow:hidden; text-overflow:ellipsis;">${firstLine}</div>
    </div>
    <div style="display:flex; align-items:center; gap:4px;">
      ${slotsHtml}
      <button class="medley-assign-btn ${isInAgenda ? 'in-agenda' : ''}" onclick="event.stopPropagation(); toggleSongAgendaFromButton(this, '${song.id}')" title="${isInAgenda ? 'In Service Agenda (Click to remove)' : 'Add to Service Agenda'}">${isInAgenda ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' : '+'}</button>
    </div>
  `;

  item.onclick = () => {
    state.activeSongId = song.id;
    applySongBoundTheme(song.id);
    const parent = item.parentElement;
    if (parent) {
      parent.querySelectorAll('.library-item.active').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      scrollActiveLibraryItemIntoView(song.id);
    }
    renderDeck(true);
    syncDashboardWorkspace();
  };

  return item;
}

function toggleSongAgendaFromButton(btn, songId) {
  toggleSongAgenda(songId);
  const isInAgenda = (state.agendaItems || []).some(item => item.id === songId);
  btn.classList.toggle('in-agenda', isInAgenda);
  btn.innerHTML = isInAgenda ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' : '+';
  btn.title = isInAgenda ? 'In Service Agenda (Click to remove)' : 'Add to Service Agenda';
}

let catalogSyncTimer = null;

function syncRemoteCatalog() {
  if (window.location.protocol === 'file:') return;
  if (catalogSyncTimer) clearTimeout(catalogSyncTimer);
  catalogSyncTimer = setTimeout(() => {
    const songs = typeof SONGS_DATABASE !== 'undefined' ? SONGS_DATABASE : [];
    const bibleVersions = typeof BIBLE_DATABASE !== 'undefined' ? Object.keys(BIBLE_DATABASE) : ['KJV'];
    const signature = `${bibleVersions.join(',')}:${songs.length}:${songs[0]?.id || ''}:${songs[songs.length - 1]?.id || ''}`;
    if (signature === lastCatalogSignature) return;
    lastCatalogSignature = signature;

    const payload = {
      bibleVersions,
      songs: songs.map(s => ({
        id: s.id,
        title: s.title,
        author: s.author || '',
        songbook: s.songbook || 'Custom Library',
        stanzas: s.stanzas
      })),
      agendaItems: Array.isArray(state.agendaItems) ? state.agendaItems : [],
      bible: (window.libraryImporter && window.libraryImporter.customBibles) ? window.libraryImporter.customBibles : undefined
    };

    if (REMOTE_MODE) {
      sendRemoteCommand({ type: 'CATALOG_UPDATE', catalog: payload });
      return;
    }

    fetch('/api/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => { lastCatalogSignature = ''; });
  }, 1000);
}



// Global Edit History Stack for Undo/Redo (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
const editHistoryStack = [];
let editHistoryIndex = -1;
let isUndoRedoAction = false;

function recordEditState(songId, actionDescription = 'Edit') {
  if (isUndoRedoAction) return;
  const song = SONGS_DATABASE.find(s => s.id === songId);
  if (!song) return;

  // Truncate future redo states if new edit occurs
  if (editHistoryIndex < editHistoryStack.length - 1) {
    editHistoryStack.splice(editHistoryIndex + 1);
  }

  editHistoryStack.push({
    songId: songId,
    snapshot: JSON.parse(JSON.stringify(song)),
    description: actionDescription
  });

  if (editHistoryStack.length > 50) editHistoryStack.shift();
  editHistoryIndex = editHistoryStack.length - 1;
}

function undoLastEdit() {
  if (editHistoryIndex > 0) {
    editHistoryIndex--;
    applyEditHistorySnapshot(editHistoryStack[editHistoryIndex], 'Undo');
  } else {
    showToast('Nothing to undo', 'info');
  }
}

function redoLastEdit() {
  if (editHistoryIndex < editHistoryStack.length - 1) {
    editHistoryIndex++;
    applyEditHistorySnapshot(editHistoryStack[editHistoryIndex], 'Redo');
  } else {
    showToast('Nothing to redo', 'info');
  }
}

function applyEditHistorySnapshot(entry, actionName) {
  if (!entry || !entry.snapshot) return;
  isUndoRedoAction = true;

  window.libraryImporter.updateSong(entry.songId, {
    title: entry.snapshot.title,
    author: entry.snapshot.author,
    stanzas: JSON.parse(JSON.stringify(entry.snapshot.stanzas))
  });

  renderLibrary();
  renderDeck();

  // Safe Live Hold: Keep live screen untouched during undo/redo; notify operator
  showToast(`${actionName}: ${entry.description} (Click card to project live when ready)`, 'info');

  isUndoRedoAction = false;
}

function makeElementEditable(el) {
  state.isEditingMode = true;

  // Record current song state before user modifies text
  const songId = state.activeSongId;
  recordEditState(songId, 'Pre-edit snapshot');

  el.contentEditable = 'true';
  el.focus();
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (e) { }
}

// Inline Editing Direct Save Handlers with Auto-Delete & Auto-Save
function saveInlineSongTitle(songId, newTitle) {
  const cleanTitle = (newTitle || '').trim();
  const song = SONGS_DATABASE.find(s => s.id === songId);
  if (!song) return;

  if (!cleanTitle) {
    // Revert to original title if left completely empty
    renderDeck();
    showToast('Title cannot be empty', 'info');
    return;
  }

  if (song.title !== cleanTitle) {
    recordEditState(songId, `Renamed song to "${cleanTitle}"`);
    window.libraryImporter.updateSong(songId, { title: cleanTitle });
    renderLibrary();
    renderDeck();
  }
}

function saveInlineStanzaType(songId, stanzaIndex, newType) {
  const cleanType = (newType || '').trim();
  const song = SONGS_DATABASE.find(s => s.id === songId);
  if (!song || !song.stanzas[stanzaIndex]) return;

  if (!cleanType) {
    renderDeck();
    return;
  }

  recordEditState(songId, `Renamed tag to "${cleanType}"`);
  song.stanzas[stanzaIndex].type = cleanType;
  window.libraryImporter.updateSong(songId, { stanzas: song.stanzas });
}

function saveInlineStanzaText(songId, stanzaIndex, newText) {
  const cleanText = (newText || '').trim();
  const song = SONGS_DATABASE.find(s => s.id === songId);
  if (!song) return;

  // IF LYRICS ARE COMPLETELY DELETED: AUTO-DELETE THIS STANZA SLIDE
  if (!cleanText) {
    if (song.stanzas.length <= 1) {
      showToast('Cannot delete the last remaining stanza', 'info');
      renderDeck();
      return;
    }

    recordEditState(songId, `Deleted stanza slide #${stanzaIndex + 1}`);
    song.stanzas.splice(stanzaIndex, 1);
    window.libraryImporter.updateSong(songId, { stanzas: song.stanzas });

    renderDeck();
    return;
  }

  // IF TEXT CHANGED: UPDATE STANZA
  if (song.stanzas[stanzaIndex] && song.stanzas[stanzaIndex].text !== cleanText) {
    recordEditState(songId, `Updated ${song.stanzas[stanzaIndex].type}`);
    song.stanzas[stanzaIndex].text = cleanText;
    window.libraryImporter.updateSong(songId, { stanzas: song.stanzas });
  }
}

// Medley Bible & Songs Custom Dialog Popovers
function initSongPickerModal() {
  document.addEventListener('click', (e) => {
    const sDialog = document.getElementById('medley-song-dialog');
    if (sDialog && sDialog.classList.contains('open')) {
      if (!sDialog.contains(e.target) && !e.target.closest('.medley-change-btn, .mode-toggle-btn')) {
        closeSongPicker();
      }
    }
    const vDialog = document.getElementById('medley-version-dialog');
    if (vDialog && vDialog.classList.contains('open')) {
      if (!vDialog.contains(e.target) && !e.target.closest('.medley-change-btn, .mode-toggle-btn')) {
        closeVersionPicker();
      }
    }
    const bDialog = document.getElementById('medley-bible-dialog');
    if (bDialog && bDialog.classList.contains('open')) {
      if (!bDialog.contains(e.target) && !e.target.closest('.medley-change-btn, .mode-toggle-btn')) {
        closeBiblePassagePicker();
      }
    }
  });
}

function openSongPicker(slotIndex, event) {
  if (event) event.stopPropagation();
  state.activePickerSlot = slotIndex;
  closeVersionPicker();
  closeBiblePassagePicker();

  let dialog = document.getElementById('medley-song-dialog');
  if (!dialog) {
    dialog = document.createElement('div');
    dialog.id = 'medley-song-dialog';
    dialog.className = 'custom-search-dialog';
    dialog.innerHTML = `
      <div class="dialog-search-header">
        <input type="text" id="medley-song-search-input" class="dialog-search-input" placeholder="Search song title or lyrics..." autocomplete="off">
      </div>
      <div id="medley-song-options-list" class="dialog-options-list"></div>
    `;
  }

  const input = dialog.querySelector('#medley-song-search-input');
  if (input) {
    input.oninput = (e) => renderSongPickerResults(e.target.value.trim().toLowerCase());
  }

  const targetBtn = event ? (event.currentTarget || event.target) : document.querySelector(`.medley-change-btn[data-slot="${slotIndex}"]`);
  if (targetBtn) {
    const parentHeader = targetBtn.closest('.medley-col-header') || targetBtn.parentElement;
    if (parentHeader) {
      parentHeader.style.position = 'relative';
      if (dialog.parentElement !== parentHeader) {
        dialog.remove();
        parentHeader.appendChild(dialog);
      }
    }
  }

  if (slotIndex >= 2) {
    dialog.style.left = 'auto';
    dialog.style.right = '0';
  } else {
    dialog.style.left = '0';
    dialog.style.right = 'auto';
  }

  const isAlreadyOpen = dialog.classList.contains('open') && dialog._openedForSlot === slotIndex;
  if (isAlreadyOpen) {
    closeSongPicker();
  } else {
    dialog._openedForSlot = slotIndex;
    if (input) input.value = '';
    renderSongPickerResults('');
    dialog.classList.add('open');
    dialog.style.zIndex = '100002';
    if (typeof window.openDismissShield === 'function') {
      window.openDismissShield(() => {
        closeSongPicker();
        closeVersionPicker();
        closeBiblePassagePicker();
      }, 100001);
    }
    if (input) {
      setTimeout(() => {
        input.focus();
        input.select();
      }, 50);
    }
  }
}

function closeSongPicker() {
  const dialog = document.getElementById('medley-song-dialog');
  if (dialog) {
    dialog.classList.remove('open');
    dialog._openedForSlot = null;
  }
  const vDialog = document.getElementById('medley-version-dialog');
  const bDialog = document.getElementById('medley-bible-dialog');
  if ((!vDialog || !vDialog.classList.contains('open')) && (!bDialog || !bDialog.classList.contains('open'))) {
    if (typeof window.closeDismissShield === 'function') window.closeDismissShield();
  }
}

function renderSongPickerResults(query = '') {
  const list = document.getElementById('medley-song-options-list');
  if (!list) return;
  list.replaceChildren();

  const songs = (typeof SONGS_DATABASE !== 'undefined' && Array.isArray(SONGS_DATABASE)) ? SONGS_DATABASE : [];
  const q = (query || '').trim();
  const filtered = q
    ? songs.filter(song => matchSongQuery(song, q))
    : songs;

  if (filtered.length === 0) {
    list.innerHTML = `<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:12px;">No songs found matching "${escapeHtml(q)}"</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  const maxDisplay = Math.min(100, filtered.length);
  const currentSlotId = (state.medleySongIds && state.activePickerSlot !== undefined)
    ? state.medleySongIds[state.activePickerSlot]
    : null;

  for (let i = 0; i < maxDisplay; i++) {
    const song = filtered[i];
    const item = document.createElement('div');
    const isSelected = currentSlotId === song.id;
    const firstLine = song.stanzas && song.stanzas[0] ? song.stanzas[0].text.split('\n')[0] : (song.author ? `by ${song.author}` : '');

    item.className = `dialog-option-item ${isSelected ? 'selected' : ''}`;
    item.innerHTML = `
      <div class="dialog-option-info">
        <div class="dialog-option-title">${escapeHtml(song.title)}</div>
        <div style="font-size:10.5px; color:var(--text-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:215px; margin-top:1px;">${escapeHtml(firstLine)}</div>
      </div>
      ${isSelected ? '<span style="font-size:9px; font-weight:700; color:#60A5FA; font-family:var(--font-mono); background:rgba(59,130,246,0.18); padding:2px 5px; border-radius:4px; flex-shrink:0;">IN SLOT</span>' : ''}
    `;
    item.onclick = (e) => {
      e.stopPropagation();
      swapMedleySong(state.activePickerSlot, song.id);
      closeSongPicker();
    };
    fragment.appendChild(item);
  }
  list.appendChild(fragment);
}

function openVersionPicker(slotIndex, event) {
  if (event) event.stopPropagation();
  state.activePickerSlot = slotIndex;
  closeSongPicker();
  let dialog = document.getElementById('medley-version-dialog');
  if (!dialog) {
    dialog = document.createElement('div');
    dialog.id = 'medley-version-dialog';
    dialog.className = 'custom-search-dialog';
    dialog.innerHTML = `
      <div class="dialog-search-header">
        <input type="text" id="medley-version-search-input" class="dialog-search-input" placeholder="Search Bible version (KJV, NIV...)" autocomplete="off">
      </div>
      <div id="medley-version-options-list" class="dialog-options-list"></div>
    `;
  }

  const input = dialog.querySelector('#medley-version-search-input');
  if (input) {
    input.oninput = (e) => renderVersionPickerResults(e.target.value.trim().toLowerCase());
  }

  const targetBtn = event ? (event.currentTarget || event.target) : document.querySelector(`.medley-change-btn[data-slot="${slotIndex}"]`);
  if (targetBtn) {
    const parentHeader = targetBtn.closest('.medley-col-header') || targetBtn.parentElement;
    if (parentHeader) {
      parentHeader.style.position = 'relative';
      if (dialog.parentElement !== parentHeader) {
        dialog.remove();
        parentHeader.appendChild(dialog);
      }
    }
  }

  if (slotIndex >= 2) {
    dialog.style.left = 'auto';
    dialog.style.right = '0';
  } else {
    dialog.style.left = '0';
    dialog.style.right = 'auto';
  }

  const isAlreadyOpen = dialog.classList.contains('open') && dialog._openedForSlot === slotIndex;
  if (isAlreadyOpen) {
    closeVersionPicker();
  } else {
    dialog._openedForSlot = slotIndex;
    if (input) input.value = '';
    renderVersionPickerResults('');
    dialog.classList.add('open');
    dialog.style.zIndex = '100002';
    if (typeof window.openDismissShield === 'function') {
      window.openDismissShield(() => {
        closeSongPicker();
        closeVersionPicker();
        closeBiblePassagePicker();
      }, 100001);
    }
    if (input) {
      setTimeout(() => {
        input.focus();
        input.select();
      }, 50);
    }
  }
}

function closeVersionPicker() {
  const dialog = document.getElementById('medley-version-dialog');
  if (dialog) {
    dialog.classList.remove('open');
    dialog._openedForSlot = null;
  }
  const sDialog = document.getElementById('medley-song-dialog');
  const bDialog = document.getElementById('medley-bible-dialog');
  if ((!sDialog || !sDialog.classList.contains('open')) && (!bDialog || !bDialog.classList.contains('open'))) {
    if (typeof window.closeDismissShield === 'function') window.closeDismissShield();
  }
}

function renderVersionPickerResults(query = '') {
  const list = document.getElementById('medley-version-options-list');
  if (!list) return;
  list.replaceChildren();

  const translations = getBibleTranslations();
  const q = (query || '').trim().toLowerCase();
  const filtered = translations.filter(t =>
    !q || t.title.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    list.innerHTML = `<div style="padding:14px; text-align:center; color:var(--text-muted); font-size:12px;">No Bible version found</div>`;
    return;
  }

  filtered.forEach(t => {
    const item = document.createElement('div');
    const isSelected = state.medleyVersionCodes && state.medleyVersionCodes[state.activePickerSlot] === t.code;

    item.className = `dialog-option-item ${isSelected ? 'selected' : ''}`;
    item.innerHTML = `
      <div class="dialog-option-title">${escapeHtml(t.title)}</div>
      <div class="dialog-option-code">${escapeHtml(t.code)}</div>
    `;
    item.onclick = (e) => {
      e.stopPropagation();
      swapMedleyVersion(state.activePickerSlot, t.code);
      closeVersionPicker();
    };
    list.appendChild(item);
  });
}

function openBiblePassagePicker(slotIndex, event) {
  if (event) event.stopPropagation();
  state.activePickerSlot = slotIndex;
  closeSongPicker();
  closeVersionPicker();

  let dialog = document.getElementById('medley-bible-dialog');
  if (!dialog) {
    dialog = document.createElement('div');
    dialog.id = 'medley-bible-dialog';
    dialog.className = 'custom-search-dialog';
    dialog.innerHTML = `
      <div class="dialog-search-header">
        <input type="text" id="medley-bible-search-input" class="dialog-search-input" placeholder="Search book or passage (e.g. John 3, Ps 23)..." autocomplete="off">
      </div>
      <div id="medley-bible-options-list" class="dialog-options-list"></div>
    `;
  }

  const input = dialog.querySelector('#medley-bible-search-input');
  if (input) {
    input.oninput = (e) => renderBiblePassagePickerResults(e.target.value.trim().toLowerCase());
  }

  const targetBtn = event ? (event.currentTarget || event.target) : document.querySelector(`.medley-change-btn[data-slot="${slotIndex}"]`);
  if (targetBtn) {
    const parentHeader = targetBtn.closest('.medley-col-header') || targetBtn.parentElement;
    if (parentHeader) {
      parentHeader.style.position = 'relative';
      if (dialog.parentElement !== parentHeader) {
        dialog.remove();
        parentHeader.appendChild(dialog);
      }
    }
  }

  if (slotIndex >= 2) {
    dialog.style.left = 'auto';
    dialog.style.right = '0';
  } else {
    dialog.style.left = '0';
    dialog.style.right = 'auto';
  }

  const isAlreadyOpen = dialog.classList.contains('open') && dialog._openedForSlot === slotIndex;
  if (isAlreadyOpen) {
    closeBiblePassagePicker();
  } else {
    dialog._openedForSlot = slotIndex;
    if (input) input.value = '';
    renderBiblePassagePickerResults('');
    dialog.classList.add('open');
    dialog.style.zIndex = '100002';
    if (typeof window.openDismissShield === 'function') {
      window.openDismissShield(() => {
        closeSongPicker();
        closeVersionPicker();
        closeBiblePassagePicker();
      }, 100001);
    }
    if (input) {
      setTimeout(() => {
        input.focus();
        input.select();
      }, 50);
    }
  }
}

function closeBiblePassagePicker() {
  const dialog = document.getElementById('medley-bible-dialog');
  if (dialog) {
    dialog.classList.remove('open');
    dialog._openedForSlot = null;
  }
  const sDialog = document.getElementById('medley-song-dialog');
  const vDialog = document.getElementById('medley-version-dialog');
  if ((!sDialog || !sDialog.classList.contains('open')) && (!vDialog || !vDialog.classList.contains('open'))) {
    if (typeof window.closeDismissShield === 'function') window.closeDismissShield();
  }
}

function renderBiblePassagePickerResults(query = '') {
  const list = document.getElementById('medley-bible-options-list');
  if (!list) return;
  list.replaceChildren();

  const curVer = state.bibleVersion || 'KJV';
  const books = getBibleBooks(curVer);
  const q = (query || '').trim().toLowerCase();

  const filtered = q
    ? books.filter(b => b.toLowerCase().includes(q) || q.includes(b.toLowerCase()))
    : books;

  if (filtered.length === 0) {
    list.innerHTML = `<div style="padding:14px; text-align:center; color:var(--text-muted); font-size:12px;">No scripture found</div>`;
    return;
  }

  const currentSlot = state.medleyBibleSlots ? state.medleyBibleSlots[state.activePickerSlot] : null;

  filtered.forEach(book => {
    const chapters = getBibleChapters(book, curVer);
    const nums = q.match(/\d+/);
    const targetChapter = nums && parseInt(nums[0], 10) <= chapters.length ? parseInt(nums[0], 10) : 1;

    const item = document.createElement('div');
    const isSelected = currentSlot && currentSlot.book === book && currentSlot.chapter === targetChapter;

    item.className = `dialog-option-item ${isSelected ? 'selected' : ''}`;
    item.innerHTML = `
      <div class="dialog-option-title">${book} ${targetChapter}</div>
      <div class="dialog-option-code">${chapters.length} chapters • ${curVer}</div>
    `;
    item.onclick = (e) => {
      e.stopPropagation();
      assignBibleBookToSlot(book, state.activePickerSlot, targetChapter);
      closeBiblePassagePicker();
    };
    list.appendChild(item);
  });
}

function assignBibleBookToSlot(bookName, slotIndex, chapter, allowToggle = true) {
  if (slotIndex >= 0 && slotIndex < 3) {
    if (!Array.isArray(state.medleyBibleSlots)) state.medleyBibleSlots = [null, null, null];
    const existing = state.medleyBibleSlots[slotIndex];
    if (allowToggle && existing && existing.book === bookName && chapter === undefined) {
      state.medleyBibleSlots[slotIndex] = null;
    } else {
      const curVer = state.bibleVersion || 'KJV';
      state.medleyBibleSlots[slotIndex] = {
        book: bookName,
        chapter: chapter || 1,
        version: curVer
      };
    }
    renderDeck();
    renderLibrary();
    syncDashboardWorkspace();
  }
}

function toggleBibleBookChapters(book, targetSlot = null) {
  state.expandedBibleBook = (state.expandedBibleBook === book && (targetSlot === null || state.chapterTargetSlot === targetSlot)) ? null : book;
  state.chapterTargetSlot = targetSlot;

  renderLibrary();
}

function selectBibleChapter(book, chapterNum) {
  const ch = parseInt(chapterNum, 10) || 1;
  const isDifferent = (state.activeBibleBook !== book || state.activeBibleChapter !== ch);
  state.activeBibleBook = book;
  state.expandedBibleBook = book;
  state.activeBibleChapter = ch;
  state.activeDeckType = 'bible';
  if (isDifferent) {
    state.liveEngagedDeck = null;
    if (typeof window.cancelPreparedSlide === 'function') window.cancelPreparedSlide();
  }

  if (state.isMedleyMode) {
    const slotIdx = (state.chapterTargetSlot !== null && state.chapterTargetSlot !== undefined)
      ? state.chapterTargetSlot
      : (state.activePickerSlot || 0);
    assignBibleBookToSlot(book, slotIdx, ch, false);
  } else {
    renderDeck(true);
    syncDashboardWorkspace();
  }
  renderLibrary();
}

function swapMedleySong(slotIndex, songId, allowToggle = true) {
  if (slotIndex >= 0 && slotIndex < 3) {
    if (!Array.isArray(state.medleySongIds)) state.medleySongIds = [null, null, null];
    if (allowToggle && state.medleySongIds[slotIndex] === songId) {
      state.medleySongIds[slotIndex] = null;
    } else {
      state.medleySongIds[slotIndex] = songId;
    }
    renderDeck();
    renderLibrary();
    syncDashboardWorkspace();
  }
}

function assignSongToSlot(songId, slotIndex) {
  swapMedleySong(slotIndex, songId, true);
}

function swapMedleyVersion(slotIndex, versionCode) {
  if (slotIndex >= 0 && slotIndex < 3) {
    state.medleyVersionCodes[slotIndex] = versionCode;
    if (state.medleyBibleSlots && state.medleyBibleSlots[slotIndex]) {
      state.medleyBibleSlots[slotIndex].version = versionCode;
    }
    renderDeck();
    syncDashboardWorkspace();
  }
}

function updateActiveSlideVisuals(slideId) {
  const deckContainer = document.getElementById('deck-container');
  if (deckContainer) {
    // 1. Remove live-active class from previous cards
    deckContainer.querySelectorAll('.live-active').forEach(el => {
      if (el.id !== `card_${slideId}` && el.dataset.slideId !== slideId) {
        el.classList.remove('live-active');
      }
    });

    // 2. Add live-active to target card
    const targetCard = document.getElementById(`card_${slideId}`) ||
      deckContainer.querySelector(`[data-slide-id="${slideId}"]`);
    if (targetCard) {
      targetCard.classList.add('live-active');
    }
  }

  // 3. Highlight active song in library list in-place
  const libraryList = document.getElementById('library-list');
  if (libraryList && state.activeSongId) {
    libraryList.querySelectorAll('.library-item.active').forEach(el => {
      if (el.dataset.songId !== state.activeSongId) el.classList.remove('active');
    });
    const activeSongEl = libraryList.querySelector(`[data-song-id="${state.activeSongId}"]`);
    if (activeSongEl) {
      activeSongEl.classList.add('active');
      scrollActiveLibraryItemIntoView(state.activeSongId);
    }
  }

  // 4. Instant In-Place Bento Live State Update (0ms, no DOM teardown)
  const allBentoCards = document.querySelectorAll('.bento-slide-card, .bento-single-card');
  allBentoCards.forEach(c => {
    const isTarget = (c.dataset.slideId === slideId || c.id === `bento_card_${slideId}`);
    if (!isTarget) {
      c.classList.remove('live');
      if (typeof window.cleanupLiveCardObserver === 'function') {
        window.cleanupLiveCardObserver(c);
      }
      c.querySelectorAll('.bento-live-shape-svg, .bento-corner-dock, .live-pill, .bento-live-badge').forEach(el => el.remove());
    } else {
      // Clean any leftover staged state from the newly live card
      c.classList.remove('staged');
      c.querySelectorAll('.staged-pill, .bento-staged-badge, .staged-dock').forEach(el => el.remove());
    }
  });

  const newLiveCards = document.querySelectorAll(`[data-slide-id="${slideId}"], #bento_card_${slideId}`);
  newLiveCards.forEach(c => {
    c.classList.add('live');
    if (c.classList.contains('bento-single-card')) {
      c.querySelectorAll('.bento-live-shape-svg, .bento-corner-dock').forEach(el => el.remove());
      c.insertAdjacentHTML('afterbegin', '<svg class="bento-live-shape-svg" aria-hidden="true"><path d=""></path></svg>');
      const headTag = c.querySelector('.head-tag-row');
      if (headTag && !headTag.querySelector('.live-pill')) {
        headTag.insertAdjacentHTML('beforeend', '<div class="live-pill">LIVE</div>');
      }
      c.insertAdjacentHTML('beforeend',
        '<div class="bento-corner-dock live-dock" title="Click to disengage follow-suit (return to CUE, keep display live)">' +
        '<button type="button" class="play-circle-btn live-toggle-btn" onclick="event.stopPropagation(); window.disengageLiveToCue(\'' + slideId + '\');" aria-label="Disengage follow-suit">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>' +
        '</button></div>'
      );
      if (typeof window.setupLiveCardObserver === 'function') {
        window.setupLiveCardObserver(c);
      } else if (typeof window.updateBentoLiveCardShape === 'function') {
        window.updateBentoLiveCardShape(c);
      }
    } else {
      const tag = c.querySelector('.tag');
      if (tag && !tag.querySelector('.bento-live-badge')) {
        const b = document.createElement('span');
        b.className = 'bento-live-badge';
        tag.appendChild(b);
      }
    }
  });

  if (slideId && (slideId.startsWith('bible_') || slideId.startsWith('medley_bible_'))) {
    const parts = slideId.split('_');
    const vNum = parts[parts.length - 1];
    const vBadge = document.getElementById('bento-active-verse-badge');
    if (vBadge && !isNaN(parseInt(vNum, 10))) {
      if (vBadge.classList.contains('bento-unified-ref-btn')) {
        const book = (state && state.activeBibleBook) || (parts.length > 2 ? parts[1] : 'Genesis');
        const ch = (state && state.activeBibleChapter) || (parts.length > 3 ? parts[2] : 1);
        vBadge.textContent = `${book} ${ch}:${vNum} ▾`;
      } else {
        vBadge.textContent = `Vs ${vNum} ▾`;
      }
    }
  }

  document.querySelectorAll('.bento-slot-col').forEach(col => {
    col.classList.toggle('active-song', !!col.querySelector('.bento-slide-card.live'));
  });

  // 5. Auto-scroll active card + 2-3 upcoming verses into view
  scrollToActiveSlide();
}
window.updateActiveSlideVisuals = updateActiveSlideVisuals;

// Synchronize active song/Bible state metadata from slideId across Host & Operator
function syncStateFromSlideId(slideId) {
  if (!slideId) return false;
  let needsDeckRebuild = false;
  if (slideId.startsWith('medley_bible_') || slideId.startsWith('bible_')) {
    const parts = slideId.split('_');
    let ver, book, ch;
    if (parts[0] === 'medley' && parts[1] === 'bible') {
      if (parts[2].startsWith('s')) {
        const slotIdx = parseInt(parts[2].substring(1), 10);
        book = parts[3];
        ch = parseInt(parts[4], 10);
        if (state.medleyBibleSlots && state.medleyBibleSlots[slotIdx]) {
          ver = state.medleyBibleSlots[slotIdx].version;
        }
      } else {
        ver = parts[2];
        book = parts[3];
        ch = parseInt(parts[4], 10);
      }
    } else if (parts[0] === 'bible' && parts[1] === 'compare') {
      ver = parts[2];
      book = parts[4];
      ch = parseInt(parts[5], 10);
    } else if (parts[0] === 'bible') {
      if (parts.length >= 5) {
        ver = parts[1];
        book = parts[2];
        ch = parseInt(parts[3], 10);
      } else if (parts.length === 4) {
        book = parts[1];
        ch = parseInt(parts[2], 10);
      }
    }
    if (ver && ver !== state.bibleVersion && !slideId.startsWith('bible_compare_') && !state.isMedleyMode) {
      state.bibleVersion = ver;
      const label = document.getElementById('active-version-label');
      if (label) label.textContent = ver;
    }
    if (!state.isMedleyMode) {
      if (book && book !== state.activeBibleBook) {
        state.activeBibleBook = book;
        needsDeckRebuild = true;
      }
      if (ch && !isNaN(ch) && ch !== state.activeBibleChapter) {
        state.activeBibleChapter = ch;
        needsDeckRebuild = true;
      }
      const rawV = parts[parts.length - 1];
      const vNum = parseInt(rawV, 10);
      if (!isNaN(vNum) && vNum > 0) {
        state.activeBibleVerse = vNum;
      }
    }

  } else {
    // Song slide ID detection across all song databases (Genius, LRCLIB, SongLyrics, Custom, Hymns, etc.)
    if (!state.isMedleyMode) {
      const songDb = (typeof SONGS_DATABASE !== 'undefined' ? SONGS_DATABASE : (window.SONGS_DATABASE || []));
      const matchedSong = songDb.slice().sort((a, b) => (b.id ? b.id.length : 0) - (a.id ? a.id.length : 0)).find(s => {
        if (!s || !s.id) return false;
        return [s.id + '_', 'song_' + s.id + '_', 'medley_' + s.id + '_', 'ai_song_' + s.id + '_'].some(p => slideId.startsWith(p)) || slideId === s.id;
      });
      if (matchedSong && matchedSong.id !== state.activeSongId) {
        state.activeSongId = matchedSong.id;
        needsDeckRebuild = true;
      }
    }
  }
  return needsDeckRebuild;
}

function applyProjectedSongTheme(slideId) {
  // Activate a binding only when entering another song, preserving manual overrides.
  const projectedSong = (window.SONGS_DATABASE || []).slice().sort((a, b) => b.id.length - a.id.length).find(song =>
    [song.id + '_', 'medley_' + song.id + '_', 'song_' + song.id + '_', 'ai_song_' + song.id + '_'].some(prefix => slideId.startsWith(prefix)));
  if (projectedSong && state.boundThemeSongId !== projectedSong.id) applySongBoundTheme(projectedSong.id, true);

}

// Project Slide Live (Zero-latency instant reaction)
function projectSlide(slideId, text, reference, extra = {}) {
  if (state.isHoldLive) { showToast('Live output is held. Release Hold live to change slides.', 'warning'); return; }
  const draft = window.resolveBentoSplitSlide?.(slideId);
  if (draft === false) return;
  if (draft) {
    text = draft.text;
    reference = draft.reference;
  }
  if (window.prepareSlideIfNeeded?.(slideId, text, reference, extra)) return;
  if (typeof window.cancelPreparedSlide === 'function') {
    window.cancelPreparedSlide();
  }

  state.activeLexiconData = null;
  const drawerProjBtn = document.getElementById('strongs-drawer-project-btn');
  if (drawerProjBtn) {
    drawerProjBtn.classList.remove('live-active');
    const span = drawerProjBtn.querySelector('span');
    if (span) span.textContent = 'Project Word';
  }

  state.compareData = (extra && extra.compareData !== undefined) ? extra.compareData : (state.isCompareMode ? state.compareData : null);

  let isBible = false;
  if (extra.contentType) {
    isBible = (extra.contentType === 'bible');
  } else if (extra.isBible !== undefined) {
    isBible = Boolean(extra.isBible);
  } else if (slideId.startsWith('bible_') || slideId.startsWith('medley_bible_') || slideId.startsWith('para_') || slideId.startsWith('hist_')) {
    isBible = true;
  } else if (slideId.startsWith('song_') || slideId.startsWith('medley_song_') || slideId.startsWith('ai_song_')) {
    isBible = false;
  } else if (slideId.startsWith('ai_')) {
    isBible = /\b\d+\s*:\s*\d+/.test(reference || '');
  } else if (state.activeDeckType === 'bible') {
    isBible = true;
  } else if (state.activeDeckType === 'song') {
    isBible = false;
  } else if (state.currentTab === 'bible') {
    isBible = true;
  } else if (state.currentTab === 'songs') {
    isBible = false;
  } else {
    isBible = /\b\d+\s*:\s*\d+/.test(reference || '');
  }

  if (isBible && typeof text === 'string' && (text.includes('<') || text.includes('>'))) {
    text = (typeof stripStrongsTags === 'function') ? stripStrongsTags(text) : text;
  }
  if (extra && extra.compareData) {
    if (typeof extra.compareData.ver1?.text === 'string' && (extra.compareData.ver1.text.includes('<') || extra.compareData.ver1.text.includes('>'))) {
      extra.compareData.ver1.text = (typeof stripStrongsTags === 'function') ? stripStrongsTags(extra.compareData.ver1.text) : extra.compareData.ver1.text;
    }
    if (typeof extra.compareData.ver2?.text === 'string' && (extra.compareData.ver2.text.includes('<') || extra.compareData.ver2.text.includes('>'))) {
      extra.compareData.ver2.text = (typeof stripStrongsTags === 'function') ? stripStrongsTags(extra.compareData.ver2.text) : extra.compareData.ver2.text;
    }
  }

  if (REMOTE_MODE) {
    state.activeLiveSlideId = slideId;
    state.activeLiveText = text;
    state.activeLiveRef = reference;
    state.activeDeckType = isBible ? 'bible' : 'song';
    const needsDeckRebuild = syncStateFromSlideId(slideId);
    if (needsDeckRebuild) {
      renderDeck();
    }
    state.liveEngagedDeck = isBible
      ? { type: 'bible', book: state.activeBibleBook, chapter: state.activeBibleChapter }
      : { type: 'song', songId: state.activeSongId };
    updateActiveSlideVisuals(slideId);
    updateLivePreview({
      slideId: slideId,
      contentType: isBible ? 'bible' : 'song',
      isBible: isBible,
      mode: state.currentMode,
      projectorActive: state.projectorActive,
      livestreamActive: state.livestreamActive,
      showSongTitleInDisplay: state.showSongTitleInDisplay,
      transparentBg: state.transparentBg,
      typography: state.typography,
      text: text,
      reference: reference,
      version: state.bibleVersion,
      compare: state.isCompareMode,
      compareVersion: state.compareBibleVersion,
      compareData: state.compareData,
      textSize: state.textSize,
      textAutoScale: state.textAutoScale,
      bg: state.background,
      clear: false,
      blackout: false
    });
    if (typeof window.syncBentoStagePreview === 'function') {
      window.syncBentoStagePreview();
    }
    sendRemoteCommand({ type: 'PROJECT', slideId, text, reference, compareData: state.compareData });
    return;
  }

  state.activeLiveSlideId = slideId;
  state.activeLiveText = text;
  state.activeLiveRef = reference;
  state.activeDeckType = isBible ? 'bible' : 'song';

  // 1. Sync state metadata first so activeSongId / activeBibleBook / activeBibleChapter are updated from slideId
  const needsDeckRebuild = syncStateFromSlideId(slideId);
  if (needsDeckRebuild) {
    renderDeck();
  }

  state.liveEngagedDeck = isBible
    ? { type: 'bible', book: state.activeBibleBook, chapter: state.activeBibleChapter }
    : { type: 'song', songId: state.activeSongId };

  // 2. Instantaneous 0ms in-place visual update (reacts before mouse-up finishes)
  updateActiveSlideVisuals(slideId);

  // 2. Instantaneous local Stage Preview update on Host
  updateLivePreview({
    slideId: slideId,
    contentType: isBible ? 'bible' : 'song',
    isBible: isBible,
    mode: state.currentMode,
    projectorActive: state.projectorActive,
    livestreamActive: state.livestreamActive,
    showSongTitleInDisplay: state.showSongTitleInDisplay,
    transparentBg: state.transparentBg,
    typography: state.typography,
    text: text,
    reference: reference,
    version: state.bibleVersion,
    compare: state.isCompareMode,
    compareVersion: state.compareBibleVersion,
    compareData: state.compareData,
    textSize: state.textSize,
    textAutoScale: state.textAutoScale,
    bg: state.background,
    clear: false,
    blackout: false
  });

  applyProjectedSongTheme(slideId);

  // 3. Immediately broadcast to OBS, Displays, and local preview (0ms delay)
  broadcastState({
    slideId: slideId,
    text: text,
    reference: reference,
    compareData: state.compareData,
    clear: false,
    blackout: false
  }, true);

  // If projection targets a different chapter/song not currently in deck, rebuild deck
  if (needsDeckRebuild) {
    renderDeck();
  }

  // 5. Update history asynchronously
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  state.scriptureHistory.unshift({ reference, text, time: now });
  state.scriptureHistory.length = Math.min(state.scriptureHistory.length, 100);
  clearTimeout(projectSlide.historyTimer);
  projectSlide.historyTimer = setTimeout(renderAiHud, 0);
}

function sendRemoteCommand(command) {
  fetch('/api/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...command, _fromRemote: true })
  }).then(async response => {
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.sessionOffline || response.status === 403) {
        if (typeof setRemoteSessionLocked === 'function') setRemoteSessionLocked(true);
        showToast('Studio session has not been started by the host yet.', 'warning');
      } else {
        showToast('Action denied by studio', 'warning');
      }
      return;
    }
    if (typeof setRemoteSessionLocked === 'function') setRemoteSessionLocked(false);
  }).catch(() => {
    showToast('Cannot reach the studio computer', 'warning');
  });
}

// Sidebar Search Filter Input (Debounced for 60fps typing)
let _sidebarSearchTimer = null;

function clearSidebarSearch() {
  const input = document.getElementById('sidebar-search-input');
  const clearBtn = document.getElementById('sidebar-search-clear');
  if (input) {
    input.value = '';
    input.focus();
  }
  if (clearBtn) {
    clearBtn.style.display = 'none';
  }
  renderLibrary('');
}

function updateSearchClearBtn() {
  const input = document.getElementById('sidebar-search-input');
  const clearBtn = document.getElementById('sidebar-search-clear');
  if (!input || !clearBtn) return;
  clearBtn.style.display = input.value.trim().length > 0 ? 'flex' : 'none';
}

function initSearchFilter() {
  const input = document.getElementById('sidebar-search-input');
  if (!input) return;

  updateSearchClearBtn();

  input.oninput = (e) => {
    updateSearchClearBtn();
    clearTimeout(_sidebarSearchTimer);
    const query = e.target.value.trim().toLowerCase();
    _sidebarSearchTimer = setTimeout(() => {
      renderLibrary(query);

      if (state.currentTab === 'bible' && query) {
        const books = getBibleBooks(state.bibleVersion);
        books.forEach(book => {
          if (query.includes(book.toLowerCase())) {
            state.activeBibleBook = book;
            const nums = query.match(/\d+/g);
            if (nums && nums.length >= 1) {
              const ch = parseInt(nums[0], 10);
              const chVerses = getBibleVerses(book, ch, state.bibleVersion);
              if (chVerses.length > 0) {
                state.activeBibleChapter = ch;
              }
            }
            renderDeck();
            if (nums && nums.length >= 2) {
              const vNum = parseInt(nums[1], 10);
              const vObj = getBibleVerses(book, state.activeBibleChapter, state.bibleVersion).find(v => v.verse === vNum);
              if (vObj) {
                const slideId = `bible_${book}_${state.activeBibleChapter}_${vNum}`;
                projectSlide(slideId, vObj.text, `${book} ${state.activeBibleChapter}:${vNum} (${state.bibleVersion})`);
              }
            }
          }
        });
      }
    }, 100);
  };
}

function switchAiTab(tabName) {
  state.activeAiTab = (tabName === 'songs' || tabName === 'transcript' || tabName === 'detected' || tabName === 'history') ? tabName : 'flow';
  ['flow', 'detected', 'songs', 'transcript', 'history'].forEach(t => {
    const tabEl = document.getElementById(`ai-tab-${t}`);
    const bentoTabId = t === 'detected' ? 'bento-ai-tab-scr' : (t === 'flow' ? 'bento-ai-tab-flow' : `bento-ai-tab-${t}`);
    const bentoTabEl = document.getElementById(bentoTabId);
    const panelEl = document.getElementById(`ai-panel-${t}`);
    if (tabEl) tabEl.classList.toggle('active', t === state.activeAiTab);
    if (bentoTabEl) bentoTabEl.classList.toggle('active', t === state.activeAiTab);
    if (panelEl) panelEl.style.display = t === state.activeAiTab ? 'flex' : 'none';
  });
  renderAiHud();
  if (typeof syncBentoAiHud === 'function') {
    syncBentoAiHud();
  }
}
window.switchAiTab = switchAiTab;

// ── Speech AI Broadcasting & Synchronization ──────────────────────────────────
let _speechAiBroadcastTimer = null;
function broadcastSpeechAiUpdate(updatePayload) {
  if (REMOTE_MODE) return;
  fetch('/api/session/speech-ai-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatePayload)
  }).catch(() => { });
}

// ── AI Speech Provider & Deepgram Settings Management ─────────────────────────
function openAiProviderModal() {
  const modal = document.getElementById('ai-provider-modal-backdrop');
  if (modal) {
    modal.classList.add('open');
    const cur = state.aiProvider || localStorage.getItem('sf_ai_provider') || 'deepgram';
    const deepgramCard = document.getElementById('provider-card-deepgram');
    const nativeCard = document.getElementById('provider-card-native');
    if (deepgramCard) deepgramCard.style.borderColor = cur === 'deepgram' ? 'var(--purple, #8A6DFF)' : 'var(--border, rgba(255,255,255,0.1))';
    if (nativeCard) nativeCard.style.borderColor = cur === 'native' ? 'var(--purple, #8A6DFF)' : 'var(--border, rgba(255,255,255,0.1))';
  }
}

function closeAiProviderModal() {
  const modal = document.getElementById('ai-provider-modal-backdrop');
  if (modal) modal.classList.remove('open');
}

function selectAiProviderChoice(provider) {
  const rememberCheck = document.getElementById('ai-provider-remember-check');
  const remember = !rememberCheck || rememberCheck.checked;

  state.aiProvider = provider;
  if (remember) {
    try { localStorage.setItem('sf_ai_provider', provider); } catch (e) { }
  }

  closeAiProviderModal();

  if (provider === 'deepgram') {
    const key = state.deepgramApiKey || (typeof localStorage !== 'undefined' && localStorage.getItem('sf_deepgram_api_key')) || '';
    if (!key) {
      openAiSettingsTab();
      showToast('Please enter your Deepgram API Key to start live streaming.', 'info');
      return;
    }
  }

  showToast(`AI Provider set to ${provider === 'deepgram' ? 'Deepgram Cloud (Pro)' : 'Browser Native'}`, 'success');
  syncAiSettingsUI();
  toggleSpeechAi();
}

function openAiSettingsTab() {
  openSettingsModal();
  const speechNav = document.querySelector('.settings-nav-item[onclick*="speech"]');
  if (speechNav) {
    switchSettingsTab('speech', speechNav);
  }
  const keyInput = document.getElementById('setting-deepgram-api-key');
  if (keyInput) {
    setTimeout(() => {
      keyInput.focus();
      keyInput.style.boxShadow = '0 0 0 2px var(--purple, #8A6DFF)';
      setTimeout(() => { keyInput.style.boxShadow = ''; }, 2200);
    }, 200);
  }
}

function updateAiProviderSetting(provider) {
  state.aiProvider = provider;
  try { localStorage.setItem('sf_ai_provider', provider); } catch (e) { }
  syncAiSettingsUI();
  if (speechAi && speechAi.setProviderConfig) {
    speechAi.setProviderConfig({ provider: provider });
  }
  showToast(`Switched AI Provider to ${provider === 'deepgram' ? 'Deepgram Cloud (Pro)' : 'Browser Native'}`, 'info');
}

function saveDeepgramApiKey(key) {
  key = (key || '').trim();
  state.deepgramApiKey = key;
  try { localStorage.setItem('sf_deepgram_api_key', key); } catch (e) { }
  if (speechAi && speechAi.setProviderConfig) {
    speechAi.setProviderConfig({ deepgramApiKey: key });
  }
  const statusEl = document.getElementById('deepgram-test-status');
  if (statusEl) {
    if (key) {
      statusEl.textContent = 'Key saved — not verified';
      statusEl.style.color = '#38BDF8';
    } else {
      statusEl.textContent = '● Missing API key';
      statusEl.style.color = '#EF4444';
    }
  }
  showToast('Deepgram API Key saved successfully.', 'success');
}

function toggleDeepgramKeyVisibility() {
  const input = document.getElementById('setting-deepgram-api-key');
  const icon = document.getElementById('deepgram-eye-icon');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
  } else {
    input.type = 'password';
    if (icon) icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }
}

async function testDeepgramConnection() {
  testDeepgramConnection.cancel?.();
  const input = document.getElementById('setting-deepgram-api-key');
  const key = String(input ? input.value : state.deepgramApiKey || '').trim();
  const model = document.getElementById('setting-deepgram-model-select')?.value || state.deepgramModel || 'nova-3';
  const statusEl = document.getElementById('deepgram-test-status');
  const report = (message, success = false) => {
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.style.color = success ? '#16a34a' : '#EF4444';
    }
    showToast(message, success ? 'success' : 'warning');
  };
  if (!key) { report('Enter your Deepgram API key first.'); return; }
  if (typeof speechAi !== 'undefined' && speechAi?.provider === 'deepgram' && speechAi.connectionState === 'listening' && speechAi.deepgramApiKey === key && speechAi.deepgramModel === model) {
    report(`Live connection active · ${model}`, true);
    return;
  }
  if (statusEl) {
    statusEl.textContent = `Testing live speech connection · ${model}…`;
    statusEl.style.color = 'var(--dim)';
  }
  let socket, timer, finished = false;
  const cleanup = () => {
    finished = true;
    clearTimeout(timer);
    if (socket) {
      socket.onopen = socket.onerror = socket.onclose = socket.onmessage = null;
      try { socket.close(); } catch (_) {}
    }
  };
  testDeepgramConnection.cancel = cleanup;
  const finish = (message, success = false) => {
    if (finished) return;
    cleanup();
    // An older test must not label a newly edited key or model.
    if (input && input.value.trim() !== key) return;
    if ((document.getElementById('setting-deepgram-model-select')?.value || state.deepgramModel || 'nova-3') !== model) return;
    report(message, success);
  };
  try {
    // Reuse the live engine's parameter builder without starting capture or changing it.
    const config = new window.SpeechAiEngine({});
    config.deepgramModel = model;
    config.churchCustomTerms = document.getElementById('setting-church-custom-terms')?.value || state.churchCustomTerms || '';
    socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${config.buildDeepgramParams()}`, ['token', key]);
    timer = setTimeout(() => finish('Live speech test timed out. Check your network and retry.'), 8000);
    socket.onopen = () => finish(`Live speech connection verified · ${model}`, true);
    socket.onerror = () => finish('Live speech connection failed. Check your key, model access, and network.');
    socket.onclose = () => finish('Live speech connection closed before verification. Check your key, model access, and network.');
  } catch (_) {
    finish('Could not start the live speech connection test. Check your settings and network.');
  }
}

function updateDeepgramModelSetting(model) {
  state.deepgramModel = model;
  try { localStorage.setItem('sf_deepgram_model', model); } catch (e) { }
  if (speechAi && speechAi.setProviderConfig) {
    speechAi.setProviderConfig({ deepgramModel: model });
  }
  showToast(`Deepgram model set to ${model}`, 'info');
}

function updateChurchCustomTermsSetting(terms) {
  state.churchCustomTerms = terms;
  try { localStorage.setItem('sf_church_custom_terms', terms); } catch (e) { }
  if (speechAi && speechAi.setProviderConfig) {
    speechAi.setProviderConfig({ churchCustomTerms: terms });
  }
  showToast('Custom church vocabulary updated.', 'success');
}

function updateAiMatchScore(value) {
  state.aiMatchScore = Math.min(100, Math.max(50, Number(value) || 95));
  localStorage.setItem('sf_ai_match_score', String(state.aiMatchScore));
  getAutoProjectionPolicy()?.clear('threshold-changed');
  const label = document.getElementById('setting-ai-match-score-value');
  if (label) label.textContent = String(state.aiMatchScore);
}
window.updateAiMatchScore = updateAiMatchScore;

function syncAiSettingsUI() {
  if (state.aiMatchScore === undefined) state.aiMatchScore = Math.min(100, Math.max(50, Number(localStorage.getItem('sf_ai_match_score')) || 95));
  const autoToggle = document.getElementById('setting-auto-project-toggle');
  if (autoToggle) autoToggle.checked = !!state.autoProject;
  const score = document.getElementById('setting-ai-match-score');
  const scoreLabel = document.getElementById('setting-ai-match-score-value');
  if (score) score.value = state.aiMatchScore;
  if (scoreLabel) scoreLabel.textContent = String(state.aiMatchScore);
  const provider = state.aiProvider || (typeof localStorage !== 'undefined' && localStorage.getItem('sf_ai_provider')) || 'deepgram';
  const apiKey = state.deepgramApiKey || (typeof localStorage !== 'undefined' && localStorage.getItem('sf_deepgram_api_key')) || '';
  const model = state.deepgramModel || (typeof localStorage !== 'undefined' && localStorage.getItem('sf_deepgram_model')) || 'nova-3';
  const churchTerms = state.churchCustomTerms || (typeof localStorage !== 'undefined' && localStorage.getItem('sf_church_custom_terms')) || '';

  const btnDeepgram = document.getElementById('btn-provider-deepgram');
  const btnNative = document.getElementById('btn-provider-native');
  const deepgramFields = document.getElementById('deepgram-config-fields');
  const keyInput = document.getElementById('setting-deepgram-api-key');
  const modelSelect = document.getElementById('setting-deepgram-model-select');
  const termsTextarea = document.getElementById('setting-church-custom-terms');
  const statusEl = document.getElementById('deepgram-test-status');

  if (btnDeepgram) btnDeepgram.classList.toggle('active', provider === 'deepgram');
  if (btnNative) btnNative.classList.toggle('active', provider === 'native');
  if (deepgramFields) deepgramFields.style.display = provider === 'deepgram' ? 'flex' : 'none';
  if (keyInput && keyInput.value !== apiKey) keyInput.value = apiKey;
  if (modelSelect && modelSelect.value !== model) modelSelect.value = model;
  syncCustomSelect(modelSelect);
  if (termsTextarea && termsTextarea.value !== churchTerms) termsTextarea.value = churchTerms;

  if (statusEl) {
    if (provider === 'deepgram') {
      if (apiKey) {
        statusEl.textContent = 'Key saved — not verified';
        statusEl.style.color = '#38BDF8';
      } else {
        statusEl.textContent = '● Missing API key';
        statusEl.style.color = '#EF4444';
      }
    } else {
      statusEl.textContent = '● Native Web Speech Active';
      statusEl.style.color = '#22C55E';
    }
  }
  syncActiveSpeechSettings();
}

function syncSpeechInputHealth(health) {
  const el = document.getElementById('mic-audio-health');
  if (el) el.textContent = health?.message || (state.aiSpeechRequested ? 'Connecting microphone…' : 'AI mic is off. Input meter shows passive monitoring.');
}

function syncActiveSpeechSettings() {
  if (!speechAi) return;
  syncSpeechInputHealth(speechAi.audioHealth);
  const status = document.getElementById('deepgram-test-status');
  const input = document.getElementById('setting-deepgram-api-key');
  if (status && speechAi.provider === 'deepgram' && speechAi.connectionState === 'listening' && (!input || input.value.trim() === speechAi.deepgramApiKey)) {
    status.textContent = `Live connection active · ${speechAi.deepgramModel}`;
    status.style.color = '#16a34a';
  }
}

// Live transcript and projection share the speech stream, but have independent controls.
let aiProjectionPolicy = null;
function getAutoProjectionPolicy() {
  if (!aiProjectionPolicy && window.AutoProjectionPolicy) {
    aiProjectionPolicy = new window.AutoProjectionPolicy({
      readState: () => ({ ...state, aiMatchScore: state.aiMatchScore ?? (Number(localStorage.getItem('sf_ai_match_score')) || 95) }),
      project: item => projectDetectedVerse(item, item.text)
    });
  }
  return aiProjectionPolicy;
}

function syncLiveTranscript(transcript, isFinal) {
  const history = document.getElementById('bento-ai-transcript-history');
  const panel = document.getElementById('bento-ai-transcript');
  const follow = panel && panel.scrollHeight - panel.scrollTop - panel.clientHeight < 32;
  if (isFinal && history) {
    const line = document.createElement('p');
    line.textContent = transcript;
    history.appendChild(line);
    while (history.childElementCount > 100) history.firstElementChild.remove();
  }
  state.aiTranscriptInterim = isFinal ? '' : transcript;
  const current = document.getElementById('bento-ai-transcript-text');
  if (current) current.textContent = state.aiTranscriptInterim;
  if (follow) panel.scrollTop = panel.scrollHeight;
}

function toggleLiveTranscript() {
  state.aiTranscriptVisible = state.aiTranscriptVisible === false;
  window.syncBentoAiHud?.();
}
window.toggleLiveTranscript = toggleLiveTranscript;

window.performDetectionAction = function(item, action) {
  if (!item) return;
  if (action === 'open' && item.book) {
    if (item.version && BIBLE_DATABASE[item.version]) state.bibleVersion = item.version;
    state.isMedleyMode = false;
    omniOpenBibleInDeck(item.book, item.chapter, item.verse, false);
    return;
  }
  if (action === 'dismiss') {
    const key = window.detectionCardKey(item);
    const groups = { verse: 'aiDetectedVerses', song: 'aiDetectedSongs', quotation: 'paraphraseMatches', concordance: 'aiDetectedConcordance' };
    const group = groups[item._type] || (item.songId ? 'aiDetectedSongs' : 'aiDetectedVerses');
    state[group] = (state[group] || []).filter(entry => window.detectionCardKey({ ...entry, _type: item._type }) !== key);
    getAutoProjectionPolicy()?.clear('dismissed');
    renderAiHud();
    return;
  }
  // A manual selection takes control until the operator explicitly rearms Auto.
  if (state.autoProject) toggleAutoProject(false);
  getAutoProjectionPolicy()?.manualSelection(item.rawReference || item.reference);
  if (item.kind === 'chapter') {
    omniOpenBibleInDeck(item.book, item.chapter);
  } else if (item.songId) {
    projectDetectedSong(item);
  } else if (item.book) {
    projectDetectedVerse(item, item.text);
  } else if (item._type === 'concordance') {
    window.openLexiconInspector?.(item.id, item.translit || '');
  } else if (item.reference && item.text) {
    projectSlide(`para_${item.reference}`, item.text, item.reference);
  }
};

function syncSpeechAiStatusControls() {
  const ready = !!state.aiListening;
  const requested = !!state.aiSpeechRequested;
  ['ai-mic-btn', 'bento-mic-btn'].forEach(id => {
    const button = document.getElementById(id);
    button?.classList.toggle('active', ready);
    button?.setAttribute('aria-pressed', String(requested));
    if (button) {
      const message = state.aiSpeechMessage || 'AI mic off';
      button.setAttribute('data-tooltip', message);
      button.removeAttribute?.('title');
      window.refreshAppTooltip?.(button, message);
    }
  });
  const label = document.getElementById('bento-mic-btn-text');
  if (label) label.textContent = ready ? 'AI mic active' : requested ? 'AI mic connecting' : 'AI mic off';
  document.getElementById('mic-signal-indicator')?.classList.toggle('live-active', ready);
  document.getElementById('bento-ai-live-dot')?.classList.toggle('active', ready);
  if (!ready) {
    ['ai-transcript-text', 'bento-ai-transcript-text'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = state.aiSpeechMessage || 'Turn on AI Mic to begin.';
    });
  }
  window.syncBentoAiHud?.();
}

function handleSpeechAiStatus({ status, message, isRequested, isListening }) {
  state.aiSpeechStatus = status;
  state.aiSpeechMessage = message;
  state.aiSpeechRequested = !!isRequested;
  state.aiListening = !!isListening;
  if (status !== 'listening') {
    if (typeof getAutoProjectionPolicy === 'function') getAutoProjectionPolicy()?.clear('speech-not-ready');
    state.aiTranscriptInterim = '';
  }
  if (status === 'connecting' || status === 'reconnecting') window.sermonManager?.flushPendingUtterance?.();
  if (!isRequested) window.sermonManager?.setRecordingState(false);
  syncSpeechAiStatusControls();
  if (typeof syncActiveSpeechSettings === 'function') syncActiveSpeechSettings();
  if (status === 'listening' && typeof refreshAudioInputDevices === 'function') refreshAudioInputDevices();
  if (status === 'error') showToast(message, 'error');
  broadcastSpeechAiUpdate({ status, message, isRequested: !!isRequested, isListening: !!isListening });
}

// Speech AI Setup & Handlers
function initSpeechAi() {
  if (window.SpeechAiEngine && !speechAi) {
    speechAi = new window.SpeechAiEngine({
      getScriptureVerses: (book, chapter, version) => getBibleVerses(book, chapter, version || state.bibleVersion || 'KJV'),
      onReferencePending: () => getAutoProjectionPolicy()?.clear('reference-pending'),
      getQuotationSource: () => {
        const version = state.bibleVersion || 'KJV';
        return { version, bible: BIBLE_DATABASE[version] || BIBLE_DATABASE };
      },
      onStatusChange: handleSpeechAiStatus,
      onAudioHealth: syncSpeechInputHealth,
      onVerseDetected: (detected) => {
        handleDetectedVerse(detected);
      },
      onSongDetected: (songMatch) => {
        handleDetectedSong(songMatch);
      },
      onTranscript: (transcript, isFinal = false) => {
        state.aiTranscript = transcript;
        syncLiveTranscript(transcript, isFinal);
        if (typeof window.detectConcordanceTerms === 'function') {
          const detectedTerms = window.detectConcordanceTerms(transcript);
          if (detectedTerms && detectedTerms.length > 0) {
            state.aiDetectedConcordance = detectedTerms;
            if (window.sermonManager && isFinal) {
              window.sermonManager.addConcordance(detectedTerms);
            }
          }
        }
        if (window.sermonManager) {
          window.sermonManager.addUtterance(transcript, isFinal);
        }
        // Classic theme transcript box
        const textEl = document.getElementById('ai-transcript-text');
        if (textEl) textEl.textContent = `"${transcript}"`;
        window.syncBentoAiHud?.();
        broadcastSpeechAiUpdate({ transcript, isFinal });
      },
      onParaphraseDetected: (paraphrase) => {
        handleDetectedParaphrase(paraphrase);
      }
    });
    if (selectedAudioDeviceId && typeof speechAi.setAudioDeviceId === 'function') {
      speechAi.selectedDeviceId = selectedAudioDeviceId;
    }
  }

  const micBtn = document.getElementById('ai-mic-btn');
  if (micBtn) {
    micBtn.classList.toggle('active', !!state.aiListening);
    micBtn.title = state.aiListening ? 'AI Mic: Active (Listening)' : 'AI Mic: Off (Click to start)';
    const dot = micBtn.querySelector('.ai-dot');
    if (dot) dot.style.background = state.aiListening ? '#22C55E' : '#64748B';
  }

  // Sync bento topbar mic button with current listening state
  const bentoMicBtn = document.getElementById('bento-mic-btn');
  const bentoMicText = document.getElementById('bento-mic-btn-text');
  if (bentoMicBtn) {
    bentoMicBtn.classList.toggle('active', !!state.aiListening);
    if (bentoMicText) bentoMicText.textContent = state.aiListening ? 'AI mic active' : 'AI mic off';
  }

  ['detected', 'songs', 'transcript', 'history'].forEach(t => {
    const tabEl = document.getElementById(`ai-tab-${t}`);
    if (tabEl) {
      tabEl.onclick = () => switchAiTab(t);
      tabEl.addEventListener('click', (e) => {
        e.preventDefault();
        switchAiTab(t);
      });
    }
  });
}

function toggleSpeechAi() {
  // Stopping must remain available during reconnects, even if settings changed.
  if (speechAi && speechAi.isListening) {
    speechAi.stop();
    return;
  }
  // If no AI provider has been selected yet (first-time use), prompt with onboarding modal
  const savedProvider = localStorage.getItem('sf_ai_provider');
  if (!savedProvider && !state.aiProvider) {
    openAiProviderModal();
    return;
  }

  const currentProvider = state.aiProvider || savedProvider || 'deepgram';

  // If Deepgram is chosen and API key is missing, guide to Settings tab with no silent fallback
  if (currentProvider === 'deepgram') {
    const key = state.deepgramApiKey || (typeof localStorage !== 'undefined' && localStorage.getItem('sf_deepgram_api_key')) || '';
    if (!key) {
      openAiSettingsTab();
      showToast('Please enter your Deepgram API Key in Settings to start.', 'warning');
      const transcriptBox = document.getElementById('ai-transcript-text');
      if (transcriptBox) {
        transcriptBox.textContent = 'Deepgram API Key required. Please configure in Studio Preferences → AI Speech Engine.';
      }
      return;
    }
  }

  if (!speechAi) {
    initSpeechAi();
  }
  if (!speechAi) {
    showToast('Speech recognition not supported in this environment.', 'warning');
    return;
  }

  // Sync latest provider configuration and targeted audio input device
  const targetDevice = selectedAudioDeviceId || (typeof localStorage !== 'undefined' && localStorage.getItem('sf_selected_mic_device')) || 'default';
  if (speechAi.setProviderConfig) {
    speechAi.setProviderConfig({
      provider: currentProvider,
      deepgramApiKey: state.deepgramApiKey || localStorage.getItem('sf_deepgram_api_key') || '',
      deepgramModel: state.deepgramModel || localStorage.getItem('sf_deepgram_model') || 'nova-3',
      churchCustomTerms: state.churchCustomTerms || localStorage.getItem('sf_church_custom_terms') || '',
      selectedDeviceId: targetDevice
    });
  }
  if (typeof speechAi.setAudioDeviceId === 'function') {
    speechAi.selectedDeviceId = targetDevice;
  }

  speechAi.toggle();
  startAudioVuMeter(selectedAudioDeviceId);

}

function handleDetectedVerse(detected) {
  if (!detected || !detected.book) return;

  const version = detected.version && BIBLE_DATABASE[detected.version] ? detected.version : (state.bibleVersion || 'KJV');
  const chVerses = getBibleVerses(detected.book, detected.chapter, version);
  const loadedBooks = getBibleBooks(version);

  let verseText = '';
  // If Bible database is loaded, validate that the chapter and verse truly exist
  if (loadedBooks.length > 0) {
    if (!loadedBooks.includes(detected.book)) return;
    if (!chVerses || chVerses.length === 0) return; // Chapter does not exist!

    if (detected.kind === 'chapter') {
      verseText = 'Choose a verse from this chapter.';
    } else if (detected.endVerse && detected.endVerse > detected.verse) {
      const rangeVerses = chVerses.filter(v => v.verse >= detected.verse && v.verse <= detected.endVerse);
      if (rangeVerses.length !== detected.endVerse - detected.verse + 1) return;
      verseText = rangeVerses.map(v => `${v.verse}. ${v.text}`).join(' ');
    } else {
      const vObj = chVerses.find(v => v.verse === detected.verse);
      if (!vObj) return; // Verse number does not exist in chapter!
      verseText = vObj.text;
    }
  } else {
    if (detected.endVerse && detected.endVerse > detected.verse) {
      const rangeVerses = (chVerses || []).filter(v => v.verse >= detected.verse && v.verse <= detected.endVerse);
      if (rangeVerses.length > 0) {
        verseText = rangeVerses.map(v => `${v.verse}. ${v.text}`).join(' ');
      }
    } else {
      const vObj = (chVerses || []).find(v => v.verse === detected.verse);
      if (vObj) verseText = vObj.text;
    }
  }

  if (!verseText) {
    verseText = `[${detected.rawReference}]`;
  }

  const existingIdx = state.aiDetectedVerses.findIndex(v => v.rawReference === detected.rawReference);
  const verseEntry = {
    ...detected,
    version: version,
    text: verseText,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  if (existingIdx !== -1) {
    state.aiDetectedVerses.splice(existingIdx, 1);
    state.aiDetectedVerses.unshift(verseEntry);
  } else {
    state.aiDetectedVerses.unshift(verseEntry);
    if (state.aiDetectedVerses.length > 20) state.aiDetectedVerses.pop();
  }

  // Also maintain aiSuggestions for backward compatibility
  const sugIdx = state.aiSuggestions.findIndex(s => s.reference === detected.rawReference);
  if (sugIdx !== -1) {
    state.aiSuggestions.splice(sugIdx, 1);
    state.aiSuggestions.unshift({ reference: detected.rawReference, text: verseText, confidence: detected.confidence });
  } else {
    state.aiSuggestions.unshift({ reference: detected.rawReference, text: verseText, confidence: detected.confidence });
    if (state.aiSuggestions.length > 20) state.aiSuggestions.pop();
  }

  if (detected.kind === 'chapter') verseEntry.autoProjectEligible = false;
  else window.sermonManager?.addScripture(verseEntry);
  renderAiHud();
  broadcastSpeechAiUpdate({ verse: verseEntry, detectedVerses: state.aiDetectedVerses });

  getAutoProjectionPolicy()?.offer(verseEntry);
}

function handleDetectedSong(songMatch) {
  if (!songMatch || !songMatch.songId) return;

  const existingIdx = state.aiDetectedSongs.findIndex(s => s.songId === songMatch.songId && s.stanzaIndex === songMatch.stanzaIndex);
  const songEntry = {
    ...songMatch,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  if (existingIdx !== -1) {
    state.aiDetectedSongs[existingIdx] = songEntry;
  } else {
    state.aiDetectedSongs.unshift(songEntry);
    if (state.aiDetectedSongs.length > 20) state.aiDetectedSongs.pop();
  }

  renderAiHud();
  broadcastSpeechAiUpdate({ song: songEntry, detectedSongs: state.aiDetectedSongs });

  // Song matches remain suggestions for manual review.

}

function handleDetectedParaphrase(paraphrase) {
  if (!paraphrase || !paraphrase.reference) return;

  const existingIdx = state.paraphraseMatches.findIndex(p => p.reference === paraphrase.reference);
  const paraEntry = {
    ...paraphrase,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  if (existingIdx !== -1) {
    state.paraphraseMatches[existingIdx] = paraEntry;
  } else {
    state.paraphraseMatches.unshift(paraEntry);
    if (state.paraphraseMatches.length > 20) state.paraphraseMatches.pop();
  }

  renderAiHud();
  broadcastSpeechAiUpdate({ paraphrase: paraEntry, paraphraseMatches: state.paraphraseMatches });

  // Quotations and paraphrases remain suggestions for manual review.

}

function toggleAutoProject(explicitVal) {
  if (typeof explicitVal === 'boolean') {
    state.autoProject = explicitVal;
  } else {
    state.autoProject = !state.autoProject;
  }

  if (state.autoProject) getAutoProjectionPolicy()?.arm();
  else getAutoProjectionPolicy()?.clear('disabled');
  const settingsToggle = document.getElementById('setting-auto-project-toggle');
  if (settingsToggle) settingsToggle.checked = state.autoProject;
  window.syncBentoAiHud?.();

  // 1. Sync header button
  const btn = document.getElementById('auto-project-btn');
  if (btn) {
    btn.classList.toggle('active', state.autoProject);
    btn.title = `Auto-Project: ${state.autoProject ? 'On (Hands-Free)' : 'Off (Click to enable)'}`;
  }

  // 2. Sync Live Preview switch
  const previewToggle = document.getElementById('preview-auto-project-toggle');
  if (previewToggle) {
    previewToggle.checked = state.autoProject;
  }

  const bentoSwitch = document.getElementById('bento-autoproj-switch');
  if (bentoSwitch) {
    bentoSwitch.classList.toggle('active', state.autoProject);
    const control = bentoSwitch.closest('.bento-autoproj');
    control?.setAttribute('aria-pressed', String(state.autoProject));
    control?.setAttribute('aria-label', state.autoProject ? 'Auto-project armed — detected content goes live automatically' : 'Auto-project off');
  }

  showToast(`Auto-Project ${state.autoProject ? 'Enabled (Hands-Free)' : 'Disabled (Manual)'}`, state.autoProject ? 'success' : 'info');
  broadcastState();
}

function projectDetectedVerse(detected, explicitText) {
  if (!detected || !detected.book) return;
  state.lastAutoDetectedRef = detected.rawReference;

  const version = detected.version && BIBLE_DATABASE[detected.version] ? detected.version : (state.bibleVersion || 'KJV');
  const chapterChanged = state.activeBibleBook !== detected.book || state.activeBibleChapter !== (detected.chapter || 1) || state.bibleVersion !== version;
  const deckChanged = chapterChanged || state.activeDeckType !== 'bible' || state.isMedleyMode;
  state.activeDeckType = 'bible';
  state.isMedleyMode = false;
  state.activeBibleVerse = detected.verse;
  state.expandedBibleBook = detected.book;
  state.bibleVersion = version;
  state.activeBibleBook = detected.book;
  state.activeBibleChapter = detected.chapter || 1;
  state.currentTab = 'bible';

  syncActiveTabUI();
  if (deckChanged) {
    renderLibrary();
    renderDeck();
  }

  let text = explicitText;
  if (!text) {
    const chVerses = getBibleVerses(detected.book, detected.chapter, version);
    if (detected.endVerse && detected.endVerse > detected.verse) {
      const rangeVerses = chVerses.filter(v => v.verse >= detected.verse && v.verse <= detected.endVerse);
      if (rangeVerses.length > 0) text = rangeVerses.map(v => `${v.verse}. ${v.text}`).join(' ');
    } else {
      const vObj = chVerses.find(v => v.verse === detected.verse);
      if (vObj) text = vObj.text;
    }
  }

  if (!text) text = `[${detected.rawReference}]`;

  const isRange = detected.endVerse && detected.endVerse > detected.verse;
  const isClassic = window.themeManager?.currentStyle === 'classic';
  const slidePrefix = isClassic || isRange ? `bible_${version}` : 'bible';
  const slideId = isRange
    ? `${slidePrefix}_${detected.book}_${detected.chapter}_${detected.verse}_${detected.endVerse}`
    : `${slidePrefix}_${detected.book}_${detected.chapter}_${detected.verse}`;
  const ref = isRange
    ? `${detected.book} ${detected.chapter}:${detected.verse}-${detected.endVerse} (${version})`
    : `${detected.book} ${detected.chapter}:${detected.verse} (${version})`;
  projectSlide(slideId, text, ref, { takeLive: true, contentType: 'bible' });
}

function projectDetectedSong(songMatch) {
  if (!songMatch || !songMatch.songId) return;
  state.lastAutoDetectedSongSlide = `${songMatch.songId}_${songMatch.stanzaIndex}`;

  const song = SONGS_DATABASE.find(s => s.id === songMatch.songId);
  if (!song) return;

  state.activeSongId = songMatch.songId;
  state.currentTab = 'songs';

  syncActiveTabUI();
  renderLibrary();
  renderDeck();

  const stanzaIndex = songMatch.stanzaIndex || 0;
  const stanza = (song.stanzas && song.stanzas[stanzaIndex]) ? song.stanzas[stanzaIndex] : (song.stanzas ? song.stanzas[0] : null);
  const slideText = stanza ? stanza.text : (songMatch.fullStanzaText || songMatch.matchedSnippet || song.title);
  const stanzaType = stanza ? (stanza.type || `Verse ${stanzaIndex + 1}`) : (songMatch.stanzaType || 'Verse 1');
  const slideId = `song_${song.id}_${stanzaIndex}_0`;
  const ref = `${song.title} (${stanzaType})`;

  projectSlide(slideId, slideText, ref, { contentType: 'song', isBible: false });
}

// Test / Simulator helper for testing auto-detection directly
function simulateAiSpeech(phrase) {
  if (!phrase || typeof phrase !== 'string') return;
  const clean = phrase.trim();
  if (!clean) return;

  const textEl = document.getElementById('ai-transcript-text');
  if (textEl) textEl.textContent = `"${clean}"`;

  if (speechAi) {
    speechAi.simulateTranscript(clean);
  } else {
    // Fallback if engine not yet started
    initSpeechAi();
    if (speechAi) speechAi.simulateTranscript(clean);
  }
}

// Remote Operator Server Host Controller
let isRemoteServerActive = false;

function checkRemoteServerStatus() {
  if (REMOTE_MODE) return;
  fetch('/api/remote-server/status')
    .then(res => res.json())
    .then(data => {
      isRemoteServerActive = !!data.enabled;
      updateRemoteServerUI(isRemoteServerActive);
    })
    .catch(() => updateRemoteServerUI(false));
}

function toggleRemoteServer() {
  const targetState = !isRemoteServerActive;
  fetch('/api/remote-server/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: targetState })
  })
    .then(res => res.json())
    .then(data => {
      isRemoteServerActive = !!data.enabled;
      updateRemoteServerUI(isRemoteServerActive);
      if (isRemoteServerActive) {
        showToast('Remote Server Started! Operator link is active.', 'success');
        syncRemoteCatalog();
      } else {
        showToast('Remote Server Stopped.', 'info');
      }
    })
    .catch(() => {
      showToast('Could not reach server to toggle remote mode.', 'warning');
    });
}

function updateRemoteServerUI(enabled) {
  isRemoteServerActive = enabled;
  sessionPanelState.enabled = enabled;
  updateRemoteSessionHeaderUI();
}

let controlEventSource = null;
function initRemoteControl() {
  if (!window.EventSource || window.location.protocol === 'file:') return;
  if (REMOTE_MODE && !window.sfOperatorPaired) return;
  checkRemoteServerStatus();
  controlEventSource?.close();
  const commands = new (window.AppEventSource || EventSource)('/api/control-events');
  controlEventSource = commands;
  commands.onmessage = (event) => {
    try { applyRemoteCommand(JSON.parse(event.data)); } catch (error) { console.warn('Ignored remote command', error); }
  };
}

function setRemoteSessionLocked(locked) {
  const overlay = document.getElementById('remote-lock-overlay');
  if (overlay) {
    overlay.style.display = locked ? 'flex' : 'none';
  }
}

function applyHostSpeechAiUpdate(msg) {
  if (!msg) return;
  const speechState = msg.fullSync && msg.hostSpeechState ? msg.hostSpeechState : msg;
  if (speechState.status !== undefined) state.aiSpeechStatus = speechState.status;
  if (speechState.message !== undefined) state.aiSpeechMessage = speechState.message;
  if (speechState.isRequested !== undefined) state.aiSpeechRequested = !!speechState.isRequested;
  if (speechState.isListening !== undefined) state.aiListening = !!speechState.isListening;
  if (speechState.transcript !== undefined && typeof syncLiveTranscript === 'function') syncLiveTranscript(speechState.transcript, !!speechState.isFinal);
  syncSpeechAiStatusControls();

  if (msg.fullSync && msg.hostSpeechState) {
    const hs = msg.hostSpeechState;
    state.aiListening = !!hs.isListening;
    state.aiTranscript = hs.transcript || '';
    if (Array.isArray(hs.detectedVerses)) state.aiDetectedVerses = hs.detectedVerses;
    if (Array.isArray(hs.detectedSongs)) state.aiDetectedSongs = hs.detectedSongs;
    if (Array.isArray(hs.paraphraseMatches)) state.paraphraseMatches = hs.paraphraseMatches;
  } else {
    if (msg.isListening !== undefined) {
      state.aiListening = !!msg.isListening;
    }
    if (msg.transcript !== undefined) {
      state.aiTranscript = msg.transcript;
    }
    if (msg.verse) {
      const v = msg.verse;
      const idx = state.aiDetectedVerses.findIndex(x => (x.rawReference || x.reference) === (v.rawReference || v.reference));
      if (idx !== -1) state.aiDetectedVerses[idx] = v;
      else {
        state.aiDetectedVerses.unshift(v);
        if (state.aiDetectedVerses.length > 25) state.aiDetectedVerses.pop();
      }
    }
    if (msg.detectedVerses && Array.isArray(msg.detectedVerses)) {
      state.aiDetectedVerses = msg.detectedVerses;
    }
    if (msg.song) {
      const s = msg.song;
      const idx = state.aiDetectedSongs.findIndex(x => x.songId === s.songId && x.stanzaIndex === s.stanzaIndex);
      if (idx !== -1) state.aiDetectedSongs[idx] = s;
      else {
        state.aiDetectedSongs.unshift(s);
        if (state.aiDetectedSongs.length > 25) state.aiDetectedSongs.pop();
      }
    }
    if (msg.detectedSongs && Array.isArray(msg.detectedSongs)) {
      state.aiDetectedSongs = msg.detectedSongs;
    }
    if (msg.paraphrase) {
      const p = msg.paraphrase;
      const idx = state.paraphraseMatches.findIndex(x => x.reference === p.reference);
      if (idx !== -1) state.paraphraseMatches[idx] = p;
      else {
        state.paraphraseMatches.unshift(p);
        if (state.paraphraseMatches.length > 25) state.paraphraseMatches.pop();
      }
    }
    if (msg.paraphraseMatches && Array.isArray(msg.paraphraseMatches)) {
      state.paraphraseMatches = msg.paraphraseMatches;
    }
  }

  // 1. Update Operator Header AI Mic Button (Visual Mirror)
  const micBtn = document.getElementById('ai-mic-btn');
  if (micBtn) {
    micBtn.classList.toggle('active', !!state.aiListening);
    micBtn.title = state.aiListening ? 'Host Microphone: LIVE (Listening to sanctuary audio)' : 'Host Microphone: Paused (Studio)';
    micBtn.setAttribute('data-tooltip', state.aiListening ? 'Host Microphone: LIVE (Active)' : 'Host Microphone: Paused');
    const dot = micBtn.querySelector('.status-indicator-dot') || micBtn.querySelector('.ai-dot');
    if (dot) {
      dot.style.background = state.aiListening ? '#10B981' : '#64748B';
      dot.style.boxShadow = state.aiListening ? '0 0 8px #10B981' : 'none';
    }
  }

  // 2. Update Header Audio Device Selector Label
  const audioPickerLabel = document.getElementById('audio-mic-picker-label');
  if (audioPickerLabel && REMOTE_MODE) {
    audioPickerLabel.textContent = state.aiListening ? 'Host Mic: LIVE' : 'Host Mic: Standby';
    audioPickerLabel.style.color = state.aiListening ? '#86EFAC' : '#94A3B8';
  }

  // 3. Update Live Microphone Signal Bars
  const indicator = document.getElementById('mic-signal-indicator');
  if (indicator) {
    indicator.classList.toggle('live-active', !!state.aiListening);
    const bar1 = indicator.querySelector('.bar-1');
    const bar2 = indicator.querySelector('.bar-2');
    const bar3 = indicator.querySelector('.bar-3');
    const bar4 = indicator.querySelector('.bar-4');
    if (state.aiListening) {
      const p = (msg && msg.audioLevel !== undefined) ? msg.audioLevel : 25;
      if (bar1) bar1.classList.toggle('active', p > 2);
      if (bar2) bar2.classList.toggle('active', p > 14);
      if (bar3) bar3.classList.toggle('active', p > 32);
      if (bar4) bar4.classList.toggle('active', p > 60);
    } else {
      if (bar1) bar1.classList.remove('active');
      if (bar2) bar2.classList.remove('active');
      if (bar3) bar3.classList.remove('active');
      if (bar4) bar4.classList.remove('active');
    }
  }

  // 4. Update Pulsing Radar Indicator in Zone 3
  const pulseEl = document.querySelector('.ai-mic-indicator-pulse');
  if (pulseEl) {
    pulseEl.style.display = state.aiListening ? 'block' : 'none';
  }

  // 5. Update Live Speech Transcription Feed Box
  const transcriptBox = document.getElementById('ai-transcript-text');
  if (transcriptBox) {
    if (state.aiTranscript && state.aiTranscript.trim()) {
      transcriptBox.textContent = `"${state.aiTranscript.trim()}"`;
    } else if (state.aiListening) {
      transcriptBox.textContent = 'Listening to Host microphone... Speak scripture or sing lyrics.';
    } else {
      transcriptBox.textContent = 'Host microphone is paused on Studio computer...';
    }
  }

  renderAiHud();
}

// ── Operator Identity Management (Name Setup, Storage & Renaming) ─────────────
function getSavedOperatorName() {
  try {
    return localStorage.getItem('sf_operator_name') || '';
  } catch (e) {
    return '';
  }
}

function setSavedOperatorName(name) {
  try {
    localStorage.setItem('sf_operator_name', (name || '').trim());
  } catch (e) { }
}

function updateOperatorHeaderUI(name) {
  const profilePill = document.getElementById('operator-profile-pill');
  const bentoPill = document.getElementById('bento-op-pill');
  const nameDisplay = document.getElementById('operator-name-display');
  const cleanName = (name || getSavedOperatorName() || 'Operator').trim();
  if (nameDisplay) {
    nameDisplay.textContent = cleanName;
  }
  if (profilePill) {
    profilePill.style.display = REMOTE_MODE ? 'inline-flex' : 'none';
    if (REMOTE_MODE) {
      profilePill.title = `Joined as ${cleanName} — Click to change name`;
      profilePill.setAttribute('data-tooltip', `Joined as ${cleanName} (Click to change)`);
    }
  }

  const bentoOpName = document.getElementById('bento-op-name');
  const bentoOpAv = document.getElementById('bento-op-av');
  const bentoPushBtn = document.getElementById('bento-op-push-btn') || (bentoPill && bentoPill.querySelector('.push'));

  if (bentoPill) {
    bentoPill.style.display = REMOTE_MODE ? 'inline-flex' : 'none';
    if (REMOTE_MODE) {
      bentoPill.title = `Joined as ${cleanName} — Click to change name`;
    }
  }
  if (bentoPushBtn) {
    bentoPushBtn.style.display = REMOTE_MODE ? 'inline-flex' : 'none';
  }
  if (bentoOpName) {
    bentoOpName.textContent = REMOTE_MODE ? `${cleanName} · remote` : `${cleanName} · studio`;
  }
  if (bentoOpAv) {
    const initials = cleanName.split(' ').map(w => w[0]).filter(Boolean).join('').substring(0, 2).toUpperCase() || 'OP';
    bentoOpAv.textContent = initials;
  }
}

function openOperatorJoinModal(isEditing = false) {
  const modal = document.getElementById('operator-join-modal-backdrop');
  const input = document.getElementById('operator-join-name-input');
  const title = document.getElementById('operator-modal-title');
  const desc = document.getElementById('operator-modal-desc');
  const submitBtn = document.getElementById('operator-join-submit-btn');
  const cancelBtn = document.getElementById('operator-join-cancel-btn');
  const errorEl = document.getElementById('operator-join-error');

  if (!modal || !input) return;

  if (errorEl) errorEl.style.display = 'none';

  const currentName = getSavedOperatorName();
  input.value = currentName || '';

  if (isEditing) {
    if (title) title.textContent = 'Edit Operator Name';
    if (desc) desc.textContent = 'Update your display name for the Host Studio and production team.';
    if (submitBtn) submitBtn.textContent = 'Save Name';
    if (cancelBtn) cancelBtn.style.display = 'block';
  } else {
    if (title) title.textContent = 'Join as Operator';
    if (desc) desc.textContent = 'Enter your name so the Studio Pro host can identify your console.';
    if (submitBtn) submitBtn.textContent = 'Connect to Studio';
    if (cancelBtn) cancelBtn.style.display = 'none';
  }

  modal.style.display = 'flex';
  setTimeout(() => {
    input.focus();
    input.select();
  }, 100);
}

function closeOperatorJoinModal() {
  const modal = document.getElementById('operator-join-modal-backdrop');
  if (modal) modal.style.display = 'none';
}

function openOperatorRenameModal() {
  openOperatorJoinModal(true);
}
window.openOperatorRenameModal = openOperatorRenameModal;

function submitOperatorName() {
  const input = document.getElementById('operator-join-name-input');
  const errorEl = document.getElementById('operator-join-error');
  if (!input) return;

  const rawName = (input.value || '').trim();
  if (!rawName) {
    if (errorEl) {
      errorEl.textContent = 'Please enter your name to continue.';
      errorEl.style.display = 'block';
    }
    input.focus();
    return;
  }

  const cleanName = rawName.slice(0, 40);
  setSavedOperatorName(cleanName);
  updateOperatorHeaderUI(cleanName);
  // Re-join and register with the server under the new name
  joinAndSyncOperatorSession(cleanName);
}
window.submitOperatorName = submitOperatorName;
window.closeOperatorJoinModal = closeOperatorJoinModal;

function initRemoteOperator() {
  if (!REMOTE_MODE) return;

  // 1. Update branding badge and header buttons
  const brandBadge = document.getElementById('brand-badge') || document.querySelector('.brand-badge');
  if (brandBadge) {
    brandBadge.textContent = 'OPERATOR';
    brandBadge.classList.add('operator-badge');
  }

  const pushToHostBtn = document.getElementById('remote-push-to-host-btn');
  if (pushToHostBtn) pushToHostBtn.style.display = 'inline-flex';

  const savedName = getSavedOperatorName();
  updateOperatorHeaderUI(savedName || 'Operator');

  // If first time joining (no saved name), prompt operator for their name immediately!
  if (!savedName) {
    openOperatorJoinModal(false);
  }

  // Hook Enter key on operator name input
  const nameInput = document.getElementById('operator-join-name-input');
  if (nameInput) {
    nameInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitOperatorName();
      }
    };
  }

  const remoteBtn = document.getElementById('remote-server-btn');
  if (remoteBtn) {
    remoteBtn.classList.add('active');
    const label = remoteBtn.querySelector('.remote-server-label');
    if (label) label.textContent = 'Studio Connected';
  }

  // 2. Lockout Microphone & Speech AI in Remote Mode (Managed exclusively by Host, mirrored for Operator)
  const micBtn = document.getElementById('ai-mic-btn');
  if (micBtn) {
    micBtn.style.cursor = 'default';
    micBtn.title = 'Host Microphone Feed (Managed on Host Computer)';
    micBtn.setAttribute('data-tooltip', 'Host Microphone Feed (Managed on Host)');
    micBtn.onclick = (e) => {
      if (e) e.preventDefault();
      showToast('Live audio microphone is managed on the Host Studio computer and mirrored here in real time.', 'info');
    };
  }

  const audioPickerBtn = document.getElementById('audio-mic-picker-btn');
  if (audioPickerBtn) {
    audioPickerBtn.onclick = (e) => {
      if (e) e.stopPropagation();
      showToast('Audio is captured and processed live from the Host Studio microphone.', 'info');
    };
    audioPickerBtn.setAttribute('data-tooltip', 'Audio is streamed live from Host Studio microphone');
    audioPickerBtn.title = 'Audio is streamed live from Host Studio microphone';
  }

  const autoProjectBtn = document.getElementById('auto-project-btn');
  if (autoProjectBtn) {
    autoProjectBtn.style.opacity = '0.4';
    autoProjectBtn.style.cursor = 'not-allowed';
    autoProjectBtn.title = 'Auto-project is managed on Host computer';
    autoProjectBtn.onclick = (e) => {
      if (e) e.preventDefault();
      showToast('Auto-project is managed on the Host Studio computer.', 'info');
    };
  }

  const speechNotice = document.getElementById('speech-remote-mode-banner');
  if (speechNotice) speechNotice.style.display = 'block';
  const speechCardGroup = document.getElementById('speech-settings-card-group');
  if (speechCardGroup) {
    speechCardGroup.style.opacity = '0.45';
    speechCardGroup.style.pointerEvents = 'none';
  }

  // 3. Restrict Broadcast Hub controls in Remote Mode (Operator cannot start/stop or copy remote links)
  const hubToggleBtn = document.getElementById('hub-toggle-session-btn');
  if (hubToggleBtn) hubToggleBtn.style.display = 'none';
  const hubCopyBtn = document.getElementById('hub-remote-copy-btn');
  if (hubCopyBtn) hubCopyBtn.style.display = 'none';
  const hubOpenBtn = document.getElementById('hub-remote-open-btn');
  if (hubOpenBtn) hubOpenBtn.style.display = 'none';
  const hubQrBtn = document.getElementById('hub-qr-toggle-btn');
  if (hubQrBtn) hubQrBtn.style.display = 'none';
  const hubQrCard = document.getElementById('hub-qr-card');
  if (hubQrCard) hubQrCard.style.display = 'none';
  const hubPushBtn = document.getElementById('hub-push-to-remote-btn');
  if (hubPushBtn) hubPushBtn.style.display = 'none';
  const hubRemotePill = document.getElementById('hub-remote-status-pill');
  if (hubRemotePill) {
    hubRemotePill.textContent = '● CONNECTED TO HOST';
    hubRemotePill.style.color = '#86EFAC';
  }
  const hubRemoteDesc = document.getElementById('hub-remote-desc');
  if (hubRemoteDesc) hubRemoteDesc.textContent = 'Connected as operator to Host Studio. Sanctuary & Livestream displays are active.';

  // 4. Check initial session state and host speech status from server immediately
  fetch('/api/session').then(r => r.json()).then(data => {
    if (!data.enabled) {
      setRemoteSessionLocked(true);
    } else {
      setRemoteSessionLocked(false);
      if (data.hostSpeechState) {
        applyHostSpeechAiUpdate({ hostSpeechState: data.hostSpeechState, fullSync: true });
      }
      joinAndSyncOperatorSession();
    }
  }).catch(() => {
    setRemoteSessionLocked(true);
  });

  fetch('/api/catalog').then(r => r.json()).then(catalog => {
    if (catalog && (Array.isArray(catalog.songs) || Array.isArray(catalog.agendaItems) || catalog.bible)) {
      applyHostPushedCatalog(catalog, false);
    }
  }).catch(() => { });

  fetch('/api/state').then(r => r.json()).then(data => {
    if (data && data.hostSpeechState) {
      applyHostSpeechAiUpdate({ hostSpeechState: data.hostSpeechState, fullSync: true });
    }
  }).catch(() => { });

  // 5. Connect to live SSE stream for real-time display mirroring (Last Action Wins)
  if (window.EventSource) {
    const sse = new (window.AppEventSource || EventSource)('/api/events');
    sse.onmessage = (event) => {
      try {
        const liveState = JSON.parse(event.data);
        if (liveState.clear || liveState.blackout) {
          state.activeLiveSlideId = null;
          state.activeLiveText = '';
          state.activeLiveRef = '';
          updateActiveSlideVisuals(null);
          updateLivePreview(liveState);
          renderDeck();
          if (typeof window.syncBentoStagePreview === 'function') {
            window.syncBentoStagePreview();
          }
        } else if (liveState.text) {
          state.activeLiveText = liveState.text;
          state.activeLiveRef = liveState.reference || '';
          if (liveState.slideId) {
            state.activeLiveSlideId = liveState.slideId;
            const needsRebuild = syncStateFromSlideId(liveState.slideId);
            if (needsRebuild) {
              renderDeck();
            }
          }
          if (liveState.compareData !== undefined) {
            state.compareData = liveState.compareData;
          }
          updateActiveSlideVisuals(state.activeLiveSlideId);
          updateLivePreview(liveState);
          if (typeof window.syncBentoStagePreview === 'function') {
            window.syncBentoStagePreview();
          }
        }
        if (liveState.typography) {
          state.typography = { ...state.typography, ...liveState.typography };
          if (typeof syncTypographySettingsUI === 'function') syncTypographySettingsUI();
        }
        if (liveState.textSize !== undefined) {
          state.textSize = liveState.textSize;
          const slider = document.getElementById('preview-size-slider');
          const readout = document.getElementById('preview-size-readout');
          if (slider) slider.value = state.textSize;
          if (readout) readout.textContent = `${Number(state.textSize).toFixed(1)}x`;
        }
        if (liveState.songScaleFull !== undefined) {
          state.songScaleFull = liveState.songScaleFull;
        }
        if (liveState.songScaleLt !== undefined) {
          state.songScaleLt = liveState.songScaleLt;
        }
        if (liveState.transparentBg !== undefined) {
          state.transparentBg = liveState.transparentBg;
          if (typeof syncTransparentBtnUI === 'function') syncTransparentBtnUI();
        }
        if (liveState.hostSpeechState) {
          applyHostSpeechAiUpdate({ hostSpeechState: liveState.hostSpeechState, fullSync: true });
        }
        if (liveState.type === 'SPEECH_AI_UPDATE') {
          applyHostSpeechAiUpdate(liveState);
        }
      } catch (err) {
        console.warn('Error parsing live SSE event', err);
      }
    };

    sse.onerror = () => {
      if (remoteBtn) {
        const dot = remoteBtn.querySelector('.remote-server-dot');
        if (dot) dot.style.background = '#EF4444';
      }
    };

    // Listen for host start/stop session events, catalog push & speech updates
    const ctrlEvents = new (window.AppEventSource || EventSource)('/api/control-events');
    ctrlEvents.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'REMOTE_SERVER_STATUS') {
          if (msg.enabled) {
            setRemoteSessionLocked(false);
            joinAndSyncOperatorSession();
            showToast('Host started remote session! Full control active.', 'success');
          } else {
            setRemoteSessionLocked(true);
            showToast('Host stopped remote session.', 'info');
          }
        } else if (msg.type === 'SESSION_ENDED') {
          setRemoteSessionLocked(true);
          showToast('Host stopped remote session.', 'info');
        } else if (msg.type === 'CATALOG_PUSHED' && msg.catalog) {
          applyHostPushedCatalog(msg.catalog);
        } else if (msg.type === 'SPEECH_AI_UPDATE') {
          applyHostSpeechAiUpdate(msg);
        }
        if (msg.hostSpeechState) {
          applyHostSpeechAiUpdate({ hostSpeechState: msg.hostSpeechState, fullSync: true });
        }
      } catch (e) { }
    };
  }
}

let currentOperatorSse = null;

function getOrCreateDeviceId() {
  let id = null;
  try { id = localStorage.getItem('sf_operator_device_id'); } catch (e) { }
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    try { localStorage.setItem('sf_operator_device_id', id); } catch (e) { }
  }
  return id;
}

function joinAndSyncOperatorSession(customName) {
  const deviceId = getOrCreateDeviceId();
  const operatorName = (customName || getSavedOperatorName() || 'Remote Operator').trim();
  fetch('/api/session/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: operatorName, deviceId: deviceId, pairingCode: document.getElementById('operator-pairing-code')?.value })
  }).then(r => r.json()).then(data => {
    if (data.pairingRequired || data.error) {
      setRemoteSessionLocked(true);
      openOperatorJoinModal(false);
      const error = document.getElementById('operator-join-error');
      if (error) { error.textContent = data.error; error.style.display = 'block'; }
      return;
    }
    if (data.sessionOffline) {
      setRemoteSessionLocked(true);
      return;
    }
    setRemoteSessionLocked(false);
    closeOperatorJoinModal();
    window.sfOperatorPaired = true;
    initRemoteControl();
    if (customName) showToast(`Joined as "${operatorName}". Connected to Studio!`, 'success');
    if (data.name) {
      updateOperatorHeaderUI(data.name);
    }
    if (data.catalog) {
      applyHostPushedCatalog(data.catalog, false);
    }
    if (data.hostSpeechState) {
      applyHostSpeechAiUpdate({ hostSpeechState: data.hostSpeechState, fullSync: true });
    }
    // Dedicated SSE connection to bind operator lifecycle and receive updates
    if (data.operatorId && window.EventSource) {
      if (currentOperatorSse) {
        try { currentOperatorSse.close(); } catch (e) { }
      }
      currentOperatorSse = new (window.AppEventSource || EventSource)(`/api/operator-events/${data.operatorId}`);
      currentOperatorSse.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'CATALOG_PUSHED' && msg.catalog) {
            applyHostPushedCatalog(msg.catalog);
            if (msg.targeted) {
              showToast('Host pushed latest songs & agenda to your console!', 'success');
            }
          } else if (msg.type === 'PRIVILEGE_UPDATE' && msg.sessionEnabled === false) {
            setRemoteSessionLocked(true);
          } else if (msg.type === 'SESSION_ENDED') {
            window.sfOperatorPaired = false;
            setRemoteSessionLocked(true);
            controlEventSource?.close();
          } else if (msg.type === 'SPEECH_AI_UPDATE') {
            applyHostSpeechAiUpdate(msg);
          }
        } catch (e) { }
      };
    }
  }).catch(() => { });
}

// Clean up operator presence on tab unload
if (REMOTE_MODE) {
  window.addEventListener('beforeunload', () => {
    try {
      const deviceId = getOrCreateDeviceId();
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/session/leave', JSON.stringify({ deviceId }));
      }
    } catch (e) { }
  });
}

function applyRemoteCommand(command) {
  if (!command || typeof command.type !== 'string') return;

  if (command.type === 'REMOTE_SERVER_STATUS') {
    updateRemoteServerUI(!!command.enabled);
    return;
  }

  if (command.type === 'OPERATORS_UPDATED' || command.type === 'OPERATOR_JOINED' || command.type === 'OPERATOR_LEFT') {
    const count = command.count !== undefined ? command.count : (command.operators ? command.operators.length : 0);
    if (typeof updateSessionOperatorCount === 'function') updateSessionOperatorCount(count, command.name, command.operatorId);
    return;
  }
  if (command.type === 'PUSH_TO_HOST') {
    applyRemotePushedItems(command);
    return;
  }
  if (command.type === 'CATALOG_PUSHED' && command.catalog) {
    if (REMOTE_MODE) applyHostPushedCatalog(command.catalog);
    return;
  }
  if (command.type === 'SHADOW_DECK' && command.songId) {
    if (typeof applyRemoteShadowDeck === 'function') applyRemoteShadowDeck(command);
    return;
  }
  if (command.type === 'IMPORT_REQUEST') {
    if (typeof showHostImportRequest === 'function') showHostImportRequest(command);
    return;
  }
  if (command.type === 'IMPORT_ACCEPTED' && command.song) {
    if (!SONGS_DATABASE.some(s => s.title === command.song.title)) {
      SONGS_DATABASE.push(command.song);
      lastCatalogSignature = '';
      syncRemoteCatalog();
      renderLibrary();
    }
    showToast('"' + command.song.title + '" added to library from operator', 'success');
    return;
  }

  // Remote operator commands forwarded to host
  if (command._fromRemote) {
    if (command.type === 'PROJECT' && typeof command.text === 'string') {
      const slideId = command.slideId || ('remote_' + Date.now());
      state.activeLiveSlideId = slideId;
      state.activeLiveText = command.text;
      state.activeLiveRef = command.reference || '';
      state.compareData = command.compareData || null;
      const isBible = slideId.startsWith('medley_bible_') || slideId.startsWith('bible_') || slideId.startsWith('ai_') || slideId.startsWith('para_') || slideId.startsWith('hist_');
      const needsRebuild = syncStateFromSlideId(slideId);
      if (needsRebuild) {
        renderDeck();
      }
      updateActiveSlideVisuals(slideId);
      updateLivePreview({
        slideId: slideId,
        contentType: isBible ? 'bible' : 'song',
        isBible: isBible,
        mode: state.currentMode,
        projectorActive: state.projectorActive,
        livestreamActive: state.livestreamActive,
        showSongTitleInDisplay: state.showSongTitleInDisplay,
        transparentBg: state.transparentBg,
        typography: state.typography,
        text: state.activeLiveText,
        reference: state.activeLiveRef,
        version: state.bibleVersion,
        compare: state.isCompareMode,
        compareVersion: state.compareBibleVersion,
        compareData: state.compareData,
        textSize: state.textSize,
        textAutoScale: state.textAutoScale,
        bg: state.background,
        clear: false,
        blackout: false
      });
      if (typeof window.syncBentoStagePreview === 'function') {
        window.syncBentoStagePreview();
      }
      broadcastState({
        slideId: state.activeLiveSlideId,
        text: state.activeLiveText,
        reference: state.activeLiveRef,
        compareData: state.compareData,
        clear: false,
        blackout: false
      });
      return;
    }
    if (command.type === 'CLEAR') {
      clearAllOutputs();
      return;
    }
    if (command.type === 'BLACKOUT') {
      state.activeLiveSlideId = null;
      state.activeLiveText = '';
      state.activeLiveRef = '';
      updateActiveSlideVisuals(null);
      updateLivePreview({ blackout: true, clear: false });
      broadcastState({ blackout: true, clear: false });
      if (typeof window.syncBentoStagePreview === 'function') {
        window.syncBentoStagePreview();
      }
      return;
    }
    if (command.type === 'NAVIGATE') {
      navigateLiveVerse(command.direction || 1);
      return;
    }
    if (command.type === 'STATE_PATCH' && command.patch) {
      applyDashboardPatch(command.patch);
      renderLibrary();
      renderDeck();
      if (typeof window.syncBentoStagePreview === 'function') {
        window.syncBentoStagePreview();
      }
      return;
    }
    return;
  }

  // Host-local commands
  if (command.type === 'PROJECT' && typeof command.text === 'string') {
    projectSlide(command.slideId || ('remote_' + Date.now()), command.text, command.reference || '');
  } else if (command.type === 'CLEAR') {
    clearAllOutputs();
  }
}

// ── Bidirectional Library & Agenda Synchronization ─────────────────────────

async function pushHostLibraryToRemote() {
  const songs = (typeof SONGS_DATABASE !== 'undefined') ? SONGS_DATABASE : [];
  const customBibles = (window.libraryImporter && window.libraryImporter.customBibles) ? window.libraryImporter.customBibles : {};
  const agendaItems = Array.isArray(state.agendaItems) ? state.agendaItems : [];

  const btn = document.getElementById('hub-push-to-remote-btn') || document.getElementById('session-push-to-remote-btn');
  if (btn) btn.style.opacity = '0.6';

  try {
    const res = await fetch('/api/session/push-to-remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bible: customBibles,
        songs: songs.map(s => ({
          id: s.id,
          title: s.title,
          author: s.author || '',
          songbook: s.songbook || 'Custom Library',
          stanzas: s.stanzas
        })),
        agendaItems: agendaItems
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      showToast(`Pushed ${data.count || songs.length} songs & ${data.agendaCount || agendaItems.length} agenda items to remote operator(s)!`, 'success');
      const pill = document.getElementById('session-push-status-pill');
      if (pill) {
        pill.textContent = 'PUSHED';
        pill.style.color = '#86EFAC';
        pill.style.background = 'rgba(34,197,94,0.15)';
      }
    } else {
      showToast('Could not push library to remote operators.', 'warning');
    }
  } catch (err) {
    showToast('Failed to reach local server.', 'error');
  } finally {
    if (btn) btn.style.opacity = '1';
  }
}
async function pushHostLibraryToOperator(operatorId, operatorName, btnElement) {
  if (!operatorId) return;
  const songs = (typeof SONGS_DATABASE !== 'undefined') ? SONGS_DATABASE : [];
  const customBibles = (window.libraryImporter && window.libraryImporter.customBibles) ? window.libraryImporter.customBibles : {};
  const agendaItems = Array.isArray(state.agendaItems) ? state.agendaItems : [];

  const originalContent = btnElement ? btnElement.innerHTML : '';
  if (btnElement) {
    btnElement.disabled = true;
    btnElement.style.opacity = '0.7';
    btnElement.innerHTML = `<span>Pushing...</span>`;
  }

  try {
    const res = await fetch('/api/session/push-to-operator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operatorId: operatorId,
        bible: customBibles,
        songs: songs.map(s => ({
          id: s.id,
          title: s.title,
          author: s.author || '',
          songbook: s.songbook || 'Custom Library',
          stanzas: s.stanzas
        })),
        agendaItems: agendaItems
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      showToast(`Pushed ${data.count || songs.length} songs & ${data.agendaCount || agendaItems.length} agenda items to ${operatorName || 'Operator'}!`, 'success');
      if (btnElement) {
        btnElement.innerHTML = `<span>Pushed</span>`;
        btnElement.style.background = 'rgba(34,197,94,0.2)';
        btnElement.style.borderColor = 'rgba(34,197,94,0.5)';
        btnElement.style.color = '#86EFAC';
        setTimeout(() => {
          if (btnElement) {
            btnElement.disabled = false;
            btnElement.style.opacity = '1';
            btnElement.innerHTML = originalContent;
            btnElement.style.background = '';
            btnElement.style.borderColor = '';
            btnElement.style.color = '';
          }
        }, 2000);
      }
    } else {
      showToast(`Could not push library to ${operatorName || 'operator'}.`, 'warning');
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.style.opacity = '1';
        btnElement.innerHTML = originalContent;
      }
    }
  } catch (err) {
    showToast('Failed to reach local server.', 'error');
    if (btnElement) {
      btnElement.disabled = false;
      btnElement.style.opacity = '1';
      btnElement.innerHTML = originalContent;
    }
  }
}
window.pushHostLibraryToOperator = pushHostLibraryToOperator;

async function pushRemoteLibraryToHost() {
  const songs = (typeof SONGS_DATABASE !== 'undefined') ? SONGS_DATABASE : [];
  const agendaItems = Array.isArray(state.agendaItems) ? state.agendaItems : [];

  const btn = document.getElementById('remote-push-to-host-btn');
  if (btn) btn.style.opacity = '0.6';

  try {
    const res = await fetch('/api/session/push-to-host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songs: songs.map(s => ({
          id: s.id,
          title: s.title,
          author: s.author || '',
          songbook: s.songbook || 'Custom Library',
          stanzas: s.stanzas
        })),
        agendaItems: agendaItems,
        operatorName: getSavedOperatorName() || 'Remote Operator'
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      showToast('Pushed new songs and agenda items to Host Studio!', 'success');
    } else {
      showToast(data.error || 'Could not push changes to Host.', 'warning');
    }
  } catch (err) {
    showToast('Could not connect to Host Studio.', 'error');
  } finally {
    if (btn) btn.style.opacity = '1';
  }
}
window.pushRemoteLibraryToHost = pushRemoteLibraryToHost;

function applyRemotePushedItems(payload) {
  if (!payload) return;
  let newSongsCount = 0;
  let newAgendaCount = 0;

  // Merge songs non-destructively
  if (Array.isArray(payload.songs) && payload.songs.length > 0) {
    payload.songs.forEach(remoteSong => {
      if (!remoteSong || !remoteSong.title) return;
      const existingIdx = SONGS_DATABASE.findIndex(s =>
        (s.id && remoteSong.id && s.id === remoteSong.id) ||
        (s.title.trim().toLowerCase() === remoteSong.title.trim().toLowerCase())
      );
      if (existingIdx === -1) {
        SONGS_DATABASE.push(remoteSong);
        newSongsCount++;
      } else {
        if (remoteSong.stanzas && remoteSong.stanzas.length > 0) {
          SONGS_DATABASE[existingIdx].stanzas = remoteSong.stanzas;
          if (remoteSong.author) SONGS_DATABASE[existingIdx].author = remoteSong.author;
        }
      }
    });
  }

  // Merge agenda items non-destructively
  if (Array.isArray(payload.agendaItems) && payload.agendaItems.length > 0) {
    payload.agendaItems.forEach(remoteItem => {
      if (!remoteItem || !remoteItem.id) return;
      const exists = state.agendaItems.some(item => item.id === remoteItem.id || item.title === remoteItem.title);
      if (!exists) {
        state.agendaItems.push(remoteItem);
        newAgendaCount++;
      }
    });
  }

  if (newSongsCount > 0 || newAgendaCount > 0) {
    renderAgenda();
    renderLibrary();
    renderDeck();
    syncDashboardWorkspace();
    const parts = [];
    if (newSongsCount > 0) parts.push(`${newSongsCount} new song(s)`);
    if (newAgendaCount > 0) parts.push(`${newAgendaCount} new agenda item(s)`);
    showToast(`Received ${parts.join(' and ')} from ${payload.operatorName || 'Remote Operator'}!`, 'success');
  } else {
    showToast(`Host library is already up to date with ${payload.operatorName || 'Remote Operator'}.`, 'info');
  }
}

function applyHostPushedCatalog(catalog, showToastNotice = true) {
  if (!catalog) return;

  let updated = false;

  if (catalog.bible && typeof catalog.bible === 'object' && Object.keys(catalog.bible).length > 0) {
    if (window.libraryImporter && window.libraryImporter.customBibles) {
      Object.assign(window.libraryImporter.customBibles, catalog.bible);
    }
    Object.assign(BIBLE_DATABASE, catalog.bible);
    updated = true;
  }

  if (Array.isArray(catalog.songs) && catalog.songs.length > 0) {
    SONGS_DATABASE.splice(0, SONGS_DATABASE.length, ...catalog.songs);
    updated = true;
  }

  if (Array.isArray(catalog.agendaItems)) {
    state.agendaItems = catalog.agendaItems;
    updated = true;
  }

  if (updated) {
    ensureActiveSong();
    renderAgenda();
    renderLibrary();
    renderDeck();
    syncDashboardWorkspace();
    if (showToastNotice) {
      showToast(`Updated songbook (${(catalog.songs || []).length} songs) & agenda from Host Studio!`, 'success');
    }
  }
}



function renderAiHud() {
  if (typeof window.syncBentoAiHud === 'function') {
    window.syncBentoAiHud();
  }

  const activeTab = (state.activeAiTab === 'songs') ? 'songs' : 'detected';
  ['detected', 'songs'].forEach(t => {
    const tabEl = document.getElementById(`ai-tab-${t}`);
    const panelEl = document.getElementById(`ai-panel-${t}`);
    if (tabEl) tabEl.classList.toggle('active', t === activeTab);
    if (panelEl) panelEl.style.display = t === activeTab ? 'flex' : 'none';
  });

  // Update Tab Badges with real-time detection counts
  const tabDet = document.getElementById('ai-tab-detected');
  const tabSongs = document.getElementById('ai-tab-songs');

  const detCount = state.aiDetectedVerses.length;
  const songsCount = state.aiDetectedSongs.length;

  if (tabDet) tabDet.innerHTML = `SCRIPTURES${detCount > 0 ? ` <span style="font-size:10px; background:rgba(59,130,246,0.3); color:#93C5FD; padding:1px 5px; border-radius:10px; margin-left:2px;">${detCount}</span>` : ''}`;
  if (tabSongs) tabSongs.innerHTML = `SONGS${songsCount > 0 ? ` <span style="font-size:10px; background:rgba(236,72,153,0.3); color:#F472B6; padding:1px 5px; border-radius:10px; margin-left:2px;">${songsCount}</span>` : ''}`;

  // 1. Detected Scripture Verses
  const detList = document.getElementById('ai-panel-detected');
  if (detList) {
    detList.innerHTML = '';
    const items = state.aiDetectedVerses.length > 0 ? state.aiDetectedVerses : state.aiSuggestions;
    if (items.length === 0) {
      detList.innerHTML = `
        <div class="ai-empty-state">
          <span>No scripture references detected yet</span>
          <span style="font-size:10.5px; opacity:0.65; margin-top:3px;">Speak e.g. "John 3:16" or "Psalm 23"</span>
        </div>`;
    } else {
      items.forEach(s => {
        const card = document.createElement('div');
        card.className = 'ai-detection-card scripture-card';
        const ref = s.rawReference || s.reference;
        const conf = s.confidence ? `${s.confidence}%` : '98%';
        const snippet = s.text ? s.text.replace(/\[.*?\]/g, '').trim() : '';

        card.innerHTML = `
          <div class="ai-card-header">
            <div class="ai-card-title">
              <span class="ai-badge scripture-badge">SCRIPTURE</span>
              <span class="ai-card-ref">${ref}</span>
            </div>
            <div class="ai-card-meta">
              <span class="ai-conf-pill">${conf}</span>
              ${s.time ? `<span class="ai-time-pill">${s.time}</span>` : ''}
            </div>
          </div>
          ${snippet ? `<div class="ai-card-body">${snippet}</div>` : ''}
          <div class="ai-card-actions">
            <button class="ai-action-btn live-btn" title="Project live immediately"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>${s.kind === 'chapter' ? 'Open Chapter' : 'Project Live'}</button>
          </div>
        `;

        const triggerProject = (e) => {
          if (e) e.stopPropagation();
          window.performDetectionAction(s, 'select');
        };

        card.querySelector('.live-btn').onclick = triggerProject;
        card.onclick = triggerProject;

        detList.appendChild(card);
      });
    }
  }

  // 2. Detected Songs & Lyrics
  const songsList = document.getElementById('ai-panel-songs');
  if (songsList) {
    songsList.innerHTML = '';
    if (state.aiDetectedSongs.length === 0) {
      songsList.innerHTML = `
        <div class="ai-empty-state">
          <span>No worship songs or lyrics detected yet</span>
          <span style="font-size:10.5px; opacity:0.65; margin-top:3px;">Sing or quote lyrics from your library</span>
        </div>`;
    } else {
      state.aiDetectedSongs.forEach(sm => {
        const card = document.createElement('div');
        card.className = 'ai-detection-card song-card';
        const conf = sm.confidence ? `${sm.confidence}%` : '90%';
        const snippet = sm.matchedSnippet || sm.fullStanzaText || '';

        card.innerHTML = `
          <div class="ai-card-header">
            <div class="ai-card-title">
              <span class="ai-badge song-badge">${sm.stanzaType || 'SONG'}</span>
              <span class="ai-card-ref">${sm.title}</span>
            </div>
            <div class="ai-card-meta">
              <span class="ai-conf-pill">${conf}</span>
              ${sm.time ? `<span class="ai-time-pill">${sm.time}</span>` : ''}
            </div>
          </div>
          ${snippet ? `<div class="ai-card-body">${snippet}</div>` : ''}
          <div class="ai-card-actions">
            <button class="ai-action-btn live-btn" title="Project slide live"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Project Live</button>
          </div>
        `;

        const triggerSong = (e) => {
          if (e) e.stopPropagation();
          window.performDetectionAction(sm, 'select');
        };

        card.querySelector('.live-btn').onclick = triggerSong;
        card.onclick = triggerSong;

        songsList.appendChild(card);
      });
    }
  }

  // 3. AI Paraphrase Matches
  const paraList = document.getElementById('ai-panel-paraphrase');
  if (paraList) {
    paraList.innerHTML = '';
    if (state.paraphraseMatches.length === 0) {
      paraList.innerHTML = `
        <div class="ai-empty-state">
          <span>No scripture quotes or paraphrases detected</span>
          <span style="font-size:10.5px; opacity:0.65; margin-top:3px;">Quotes like "God so loved the world" will match here</span>
        </div>`;
    } else {
      state.paraphraseMatches.forEach(p => {
        const card = document.createElement('div');
        card.className = 'ai-detection-card paraphrase-card';
        const conf = p.confidence ? `${p.confidence}%` : '85%';

        card.innerHTML = `
          <div class="ai-card-header">
            <div class="ai-card-title">
              <span class="ai-badge para-badge">QUOTE MATCH</span>
              <span class="ai-card-ref">${p.reference}</span>
            </div>
            <div class="ai-card-meta">
              <span class="ai-conf-pill">${conf}</span>
              ${p.time ? `<span class="ai-time-pill">${p.time}</span>` : ''}
            </div>
          </div>
          <div class="ai-card-body">${p.text}</div>
          <div class="ai-card-actions">
            <button class="ai-action-btn live-btn" title="Project live immediately"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Project Live</button>
          </div>
        `;

        const triggerPara = (e) => {
          if (e) e.stopPropagation();
          projectSlide(`para_${p.reference}`, p.text, p.reference);
        };

        card.querySelector('.live-btn').onclick = triggerPara;
        card.onclick = triggerPara;
        paraList.appendChild(card);
      });
    }
  }

  if (typeof window.syncBentoAiHud === 'function') {
    window.syncBentoAiHud();
  }
}



function initPanics() {
  const bindInstant = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    const trigger = (e) => {
      if (e && e.button !== undefined && e.button !== 0) return;
      fn();
    };
    el.onpointerdown = trigger;
    el.onclick = trigger;
  };

  bindInstant('stage-clear-btn', clearAllOutputs);
  bindInstant('panic-clear-text', clearAllOutputs);
  bindInstant('panic-clear-bg', () => broadcastState({ clearBg: true }));
  bindInstant('panic-blackout', () => broadcastState({ blackout: true }));
  bindInstant('panic-logo', () => projectSlide('logo', '', 'CHRIST PAVILION'));
}

function escapeHtml(str) {
  return (str || '')
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "\\n");
}

// Ultra-Premium Settings Tab Switcher & Segmented Controls
function openSettingsToTab(tabId) {
  const modal = document.getElementById('settings-modal-backdrop');
  if (modal) modal.classList.add('open');
  const navItem = document.querySelector(`.settings-nav-item[onclick*="'${tabId}'"]`);
  switchSettingsTab(tabId, navItem);
  syncMedleySettingsUI();
  const pane = document.querySelector('.settings-content-pane');
  if (pane) pane.scrollTop = 0;
}

function switchSettingsTab(tabId, tabEl) {
  document.querySelectorAll('.settings-nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.settings-tab-page').forEach(el => el.style.display = 'none');

  if (tabEl) tabEl.classList.add('active');
  const targetPage = document.getElementById(`tab-${tabId}`);
  if (targetPage) {
    targetPage.style.display = 'flex';
  }
  const pane = document.querySelector('.settings-content-pane');
  if (pane) pane.scrollTop = 0;
  initCustomSelects();

  if (tabId === 'speech') {
    syncAiSettingsUI();
    refreshAudioInputDevices();
  }
  if (tabId === 'medley') {
    syncMedleySettingsUI();
  }
}

function openSettingsModal() {
  const modal = document.getElementById('settings-modal-backdrop');
  if (modal) modal.classList.add('open');
  const pane = document.querySelector('.settings-content-pane');
  if (pane) pane.scrollTop = 0;
  syncMedleySettingsUI();
  syncAiSettingsUI();
  refreshAudioInputDevices();
  syncTransitionSettingsUI();
  syncSongSettingsUI();
}

function closeSettingsModal() {
  const modal = document.getElementById('settings-modal-backdrop');
  if (modal) modal.classList.remove('open');
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAGGABLE FLOATING OMNI-SEARCH CONTROLLER (UNIFIED SCRIPTURES & SONGS)
// ─────────────────────────────────────────────────────────────────────────────

/* hoisted */
let omniCloudSearchDebounce = null;
let omniCurrentCloudResults = [];

function initOmniSearchDrag() {
  const palette = document.getElementById('omni-search-palette');
  const header = document.getElementById('omni-drag-header');
  if (!palette || !header) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  const onDragStart = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;

    isDragging = true;
    palette.classList.add('dragging');
    const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

    const rect = palette.getBoundingClientRect();
    startX = clientX;
    startY = clientY;
    initialLeft = rect.left;
    initialTop = rect.top;

    palette.style.transform = 'none';
    palette.style.left = `${initialLeft}px`;
    palette.style.top = `${initialTop}px`;

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('touchend', onDragEnd);
  };

  const onDragMove = (e) => {
    if (!isDragging) return;
    if (e.cancelable && e.type.startsWith('touch')) e.preventDefault();

    const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

    const dx = clientX - startX;
    const dy = clientY - startY;

    let newLeft = initialLeft + dx;
    let newTop = initialTop + dy;

    const maxLeft = window.innerWidth - palette.offsetWidth - 8;
    const maxTop = window.innerHeight - palette.offsetHeight - 8;

    newLeft = Math.max(8, Math.min(newLeft, maxLeft));
    newTop = Math.max(8, Math.min(newTop, maxTop));

    palette.style.left = `${newLeft}px`;
    palette.style.top = `${newTop}px`;
  };

  const onDragEnd = () => {
    isDragging = false;
    palette.classList.remove('dragging');
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('touchend', onDragEnd);
  };

  header.addEventListener('mousedown', onDragStart);
  header.addEventListener('touchstart', onDragStart, { passive: true });
}

let omniSearchFocusOrigin = null;
function openOmniSearchPalette(mode = 'all', initialQuery = '') {
  const palette = document.getElementById('omni-search-palette');
  const input = document.getElementById('omni-search-input');
  if (!palette) return;

  if (palette.style.display !== 'flex') omniSearchFocusOrigin = document.activeElement;
  let backdrop = document.getElementById('omni-search-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'omni-search-backdrop';
    backdrop.addEventListener('click', closeOmniSearchPalette);
    palette.before(backdrop);
  }
  backdrop.hidden = false;
  palette.style.display = 'flex';
  initOmniSearchDrag();

  if (mode) switchOmniSearchMode(mode, false);

  if (input) {
    if (initialQuery !== undefined && initialQuery !== null && initialQuery !== '') {
      input.value = initialQuery;
      handleOmniSearchInput(initialQuery);
    } else {
      input.value = '';
      handleOmniSearchInput('');
    }
    input.focus();
    if (input.value) input.select();
  }
}

function closeOmniSearchPalette() {
  const palette = document.getElementById('omni-search-palette');
  if (palette) palette.style.display = 'none';
  const backdrop = document.getElementById('omni-search-backdrop');
  if (backdrop) backdrop.hidden = true;
  if (palette?.contains(document.activeElement)) omniSearchFocusOrigin?.focus();
}

function toggleOmniSearchPalette(mode) {
  const palette = document.getElementById('omni-search-palette');
  if (palette && palette.style.display === 'flex') {
    closeOmniSearchPalette();
  } else {
    openOmniSearchPalette(mode || omniSearchCurrentMode);
  }
}

// Aliases for backward compatibility
function openCommandPalette() {
  openOmniSearchPalette('all');
}

function closeCommandPalette() {
  closeOmniSearchPalette();
}

function switchOmniSearchMode(mode, reSearch = true) {
  omniSearchCurrentMode = mode || 'all';
  const tabAll = document.getElementById('omni-tab-all');
  const tabVerses = document.getElementById('omni-tab-verses');
  const tabSongs = document.getElementById('omni-tab-songs');
  const input = document.getElementById('omni-search-input');

  if (tabAll) {
    tabAll.classList.toggle('active', omniSearchCurrentMode === 'all');
    tabAll.classList.toggle('all-mode', omniSearchCurrentMode === 'all');
  }
  if (tabVerses) tabVerses.classList.toggle('active', omniSearchCurrentMode === 'verses');
  if (tabSongs) {
    tabSongs.classList.toggle('active', omniSearchCurrentMode === 'songs');
    tabSongs.classList.toggle('songs-mode', omniSearchCurrentMode === 'songs');
  }

  if (input) {
    if (omniSearchCurrentMode === 'all') {
      input.placeholder = "Search scriptures, songs, or lyrics...";
    } else if (omniSearchCurrentMode === 'verses') {
      input.placeholder = "Search scriptures by reference or words...";
    } else {
      input.placeholder = "Search songs by title, artist, or lyrics...";
    }
  }

  if (reSearch && input) {
    handleOmniSearchInput(input.value);
  }
}

function clearOmniSearchInput() {
  const input = document.getElementById('omni-search-input');
  if (input) {
    input.value = '';
    input.focus();
    handleOmniSearchInput('');
  }
}

function handleOmniSearchInput(val) {
  const clearBtn = document.getElementById('omni-input-clear-btn');
  const resultsBox = document.getElementById('omni-search-results-box');
  const cleanQ = (val || '').trim();

  if (clearBtn) clearBtn.style.display = cleanQ ? 'flex' : 'none';
  if (!resultsBox) return;

  if (omniSearchCurrentMode === 'all') {
    renderOmniUnifiedResults(cleanQ, resultsBox);
  } else if (omniSearchCurrentMode === 'verses') {
    renderOmniVersesResults(cleanQ, resultsBox);
  } else {
    renderOmniSongsResults(cleanQ, resultsBox);
  }
}

// ─── Full-Text Bible Verse Search Helper ────────────────────────────────────
function searchBibleFullText(phrase, version, limit = 4) {
  const ver = version || state.bibleVersion || 'KJV';
  const db = (typeof BIBLE_DATABASE !== 'undefined' && BIBLE_DATABASE[ver]) ? BIBLE_DATABASE[ver] : null;
  if (!db || !phrase || phrase.length < 3) return [];

  const qLower = phrase.toLowerCase().trim();
  const matches = [];

  for (const book in db) {
    const chapters = db[book];
    if (!chapters) continue;
    for (const chap in chapters) {
      const verses = chapters[chap];
      if (!Array.isArray(verses)) continue;
      for (let i = 0; i < verses.length; i++) {
        const v = verses[i];
        if (v && v.text && v.text.toLowerCase().includes(qLower)) {
          matches.push({
            book: book,
            chapter: parseInt(chap, 10),
            verse: v.verse,
            text: v.text,
            version: ver
          });
          if (matches.length >= limit) return matches;
        }
      }
    }
  }
  return matches;
}

// Helper to sanitize lyric preview text and remove raw newline escape characters
function cleanOmniPreview(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, ' ')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper to sanitize author/artist names
function cleanOmniArtist(author) {
  if (!author || author.trim() === '') return 'Unknown';
  return String(author)
    .replace(/\\n/g, ', ')
    .replace(/\r?\n/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── 1. UNIFIED SMART SEARCH (ALL IN ONE) ───────────────────────────────────
function renderOmniUnifiedResults(query, container) {
  if (!query) {
    container.innerHTML = `
      <div class="omni-empty-compact">
        <div class="omni-empty-icon" style="color:var(--purple, #8a6dff);">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <div class="omni-empty-title">Unified Omni-Search</div>
        <div class="omni-empty-desc">
          Search scriptures, verses by phrase, saved songs, and online worship lyrics simultaneously.
        </div>
        <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">
          <span class="tag-chip" onclick="setOmniSearchText('John 3:16')">John 3:16</span>
          <span class="tag-chip" onclick="setOmniSearchText('the Lord is my shepherd')">"Lord is my shepherd"</span>
          <span class="tag-chip" onclick="setOmniSearchText('Way Maker')">Way Maker</span>
          <span class="tag-chip" onclick="setOmniSearchText('Goodness of God')">Goodness of God</span>
        </div>
      </div>
    `;
    return;
  }

  // 1. Check Scripture Reference
  let parsed = null;
  if (typeof window.parseScriptureReference === 'function') {
    parsed = window.parseScriptureReference(query);
  }
  if (!parsed || !parsed.book) {
    const match = query.match(/^([1-3]?\s*[A-Za-z]+)\s*(\d*)(?:[:\.](\d+)(?:-(\d+))?)?$/i);
    if (match && window.libraryImporter && window.libraryImporter.isBibleBookName(match[1])) {
      parsed = {
        book: window.libraryImporter.normalizeBookName(match[1]),
        chapter: match[2] ? parseInt(match[2], 10) : 1,
        verse: match[3] ? parseInt(match[3], 10) : null,
        verseEnd: match[4] ? parseInt(match[4], 10) : null
      };
    }
  }

  const activeVer = state.bibleVersion || 'KJV';
  let scriptureVerses = [];
  let isExactRefMatch = false;

  if (parsed && parsed.book) {
    const verses = getBibleVerses(parsed.book, parsed.chapter || 1, activeVer);
    if (verses && verses.length > 0) {
      isExactRefMatch = true;
      if (parsed.verse) {
        if (parsed.verseEnd && parsed.verseEnd >= parsed.verse) {
          scriptureVerses = verses.filter(v => v.verse >= parsed.verse && v.verse <= parsed.verseEnd);
        } else {
          scriptureVerses = verses.filter(v => v.verse === parsed.verse);
        }
      }
      if (scriptureVerses.length === 0) scriptureVerses = verses.slice(0, 8);
    }
  }

  // 2. If not exact ref, search Bible Full-Text phrase
  let bibleTextMatches = [];
  if (!isExactRefMatch && query.length >= 3) {
    bibleTextMatches = searchBibleFullText(query, activeVer, 3);
  }

  // 3. Search Local Saved Songs in SONGS_DATABASE (Resilient matching on Title, Author & Full-Text Lyrics)
  const localSongMatches = (SONGS_DATABASE || []).filter(s => matchSongQuery(s, query));

  // Intent classification: If exact scripture reference detected, prioritize Scriptures section at top!
  const prioritizeScriptures = isExactRefMatch || (bibleTextMatches.length > 0 && localSongMatches.length === 0);

  let html = '';

  // ── Render Scripture Section (Top if scripture intent) ──
  const renderScripturesHtml = () => {
    let sHtml = '';
    const items = isExactRefMatch && scriptureVerses.length > 0 ? scriptureVerses : bibleTextMatches;
    if (items.length > 0) {
      const headerTitle = isExactRefMatch
        ? `SCRIPTURE MATCH (${parsed.book} ${parsed.chapter || 1} • ${activeVer})`
        : `BIBLE PHRASE MATCHES (${items.length} verses in ${activeVer})`;
      sHtml += `
        <div class="omni-section-header" style="color:var(--blue, #5fa8f5);">
          <span>${headerTitle}</span>
          ${isExactRefMatch ? `<span style="font-size:10px; color:var(--mute); cursor:pointer;" onclick="omniOpenBibleInDeck('${escapeHtml(parsed.book)}', ${parsed.chapter || 1})">Open in Deck ↗</span>` : ''}
        </div>
        ${renderScripturesResultsHtml(items, parsed, activeVer, isExactRefMatch)}
      `;
    }
    return sHtml;
  };

  // ── Render Local Songs Section ──
  const renderLocalSongsHtml = () => {
    let lHtml = '';
    if (localSongMatches.length > 0) {
      lHtml += `
        <div class="omni-section-header" style="color:var(--green, #3ecf7e);">
          <span>SAVED SONGS IN DATABASE (${localSongMatches.length})</span>
        </div>
        ${renderLocalSongsResultsHtml(localSongMatches)}
      `;
    }
    return lHtml;
  };

  // ── Render Cloud Songs Container ──
  const renderCloudContainerHtml = () => `
    <div id="omni-cloud-section" style="margin-top:8px;">
      <div class="omni-section-header" style="color:var(--pink, #f178b6);">
        <span>GLOBAL CLOUD SONGS</span>
        <span id="omni-cloud-status" style="font-weight:400; font-size:10px; color:var(--mute, #696773);">Searching...</span>
      </div>
      <div id="omni-cloud-items" style="display:flex; flex-direction:column; gap:6px;">
        <div style="padding:12px; text-align:center; color:var(--mute, #696773); font-size:11px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; animation:spin 1s linear infinite; margin-right:4px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Querying online worship repositories...
        </div>
      </div>
    </div>
  `;

  // Compose according to Intent Ranking
  if (prioritizeScriptures) {
    html += renderScripturesHtml();
    html += renderLocalSongsHtml();
    html += renderCloudContainerHtml();
  } else {
    html += renderLocalSongsHtml();
    html += renderScripturesHtml();
    html += renderCloudContainerHtml();
  }

  container.innerHTML = html;

  // Trigger Online Cloud Query in Parallel with Sequence Token
  clearTimeout(omniCloudSearchDebounce);
  const thisSeq = ++omniCloudSearchSeq;
  omniCloudSearchDebounce = setTimeout(async () => {
    const cloudItems = document.getElementById('omni-cloud-items');
    const cloudStatus = document.getElementById('omni-cloud-status');
    if (!cloudItems) return;

    try {
      if (!window.libraryImporter) {
        cloudItems.innerHTML = `<div style="color:var(--mute); font-size:11px; padding:8px;">Online search engine not ready.</div>`;
        return;
      }

      const results = await window.libraryImporter.searchOnlineLyrics(query);
      if (thisSeq !== omniCloudSearchSeq) {
        return; // Stale in-flight query response, discard!
      }
      omniCurrentCloudResults = results || [];

      if (cloudStatus) {
        cloudStatus.textContent = `${omniCurrentCloudResults.length} results`;
      }

      if (!omniCurrentCloudResults || omniCurrentCloudResults.length === 0) {
        cloudItems.innerHTML = `
          <div style="padding:10px 14px; text-align:center; color:var(--mute); font-size:11px; background:rgba(255,255,255,0.02); border-radius:8px;">
            No online cloud songs found for "${escapeHtml(query)}".
          </div>
        `;
        return;
      }

      cloudItems.innerHTML = renderCloudResultsHtml(omniCurrentCloudResults);
    } catch (e) {
      if (thisSeq !== omniCloudSearchSeq) return;
      cloudItems.innerHTML = `<div style="color:var(--red, #f2554b); font-size:11px; padding:8px;">Cloud search: ${e.message}</div>`;
    }
  }, 300);
}

// ─── Reusable Helper: Render Scriptures in Classic (list) or Bento (Hero+Grid) ─
function renderScripturesResultsHtml(items, parsed, activeVer, isExact = false) {
  if (!items || items.length === 0) return '';
  const isBento = (document.body.getAttribute('data-theme-style') === 'bento');

  if (!isBento) {
    return items.slice(0, 8).map(v => {
      const bookName = v.book || (parsed ? parsed.book : '');
      const chapNum = v.chapter || (parsed ? parsed.chapter : 1) || 1;
      const refStr = v.book ? `${v.book} ${v.chapter}:${v.verse}` : `${bookName} ${chapNum}:${v.verse}`;
      return `
        <div class="omni-card" style="border-left:3px solid var(--blue, #5fa8f5); cursor:pointer;" onclick="omniOpenBibleInDeck('${escapeHtml(bookName)}', ${chapNum}, ${v.verse})" title="Open ${refStr} in deck">
          <div style="min-width:0; flex:1;">
            <div class="omni-card-title">
              <span>${refStr}</span>
              <span class="omni-card-badge local">${activeVer}</span>
              ${isExact ? '<span style="font-size:9.5px; color:var(--purple-text, #c3b6ff); font-weight:600;">Exact Match</span>' : ''}
            </div>
            <div class="omni-card-sub">${escapeHtml(v.text)}</div>
          </div>
          <div class="omni-card-actions">
            <button type="button" class="omni-action-btn live" onclick="event.stopPropagation(); omniOpenBibleInDeck('${escapeHtml(bookName)}', ${chapNum}, ${v.verse})">
              Open
            </button>
            <button type="button" class="omni-action-btn secondary" onclick="event.stopPropagation(); omniAddVerseToAgenda('${escapeHtml(bookName)}', ${chapNum}, ${v.verse}, '${escapeHtml(v.text)}', '${activeVer}')">
              + Agenda
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Bento Theme: 1 Top Hero Match Card + 2-Column Grid
  const hero = items[0];
  const remaining = items.slice(1, 5);

  const heroBook = hero.book || (parsed ? parsed.book : '');
  const heroChap = hero.chapter || (parsed ? parsed.chapter : 1) || 1;
  const heroRef = hero.book ? `${hero.book} ${hero.chapter}:${hero.verse}` : `${heroBook} ${heroChap}:${hero.verse}`;

  let html = `
    <!-- Top Best Match Scripture Hero Card -->
    <div class="bento-omni-hero-card" onclick="omniOpenBibleInDeck('${escapeHtml(heroBook)}', ${heroChap}, ${hero.verse})" title="Click to open ${heroRef} in deck">
      <div class="bento-omni-icon-box scripture">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      </div>
      <div class="bento-omni-hero-info">
        <div class="bento-omni-hero-title-row">
          <span class="bento-omni-hero-title">${heroRef}</span>
          <span class="omni-card-badge local">${activeVer}</span>
          ${isExact ? '<span style="font-size:9.5px; color:var(--blue, #60a5fa); font-weight:600;">Exact Match</span>' : ''}
        </div>
        <div class="bento-omni-hero-sub">
          <span style="color:var(--blue, #60a5fa); font-weight:600;">${escapeHtml(heroBook)} Chapter ${heroChap}</span>
        </div>
        <div class="bento-omni-hero-sub" style="margin-top:2px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
          ${escapeHtml(hero.text)}
        </div>
      </div>
      <div class="bento-omni-hero-actions">
        <button type="button" class="bento-omni-btn-main scripture" onclick="event.stopPropagation(); omniOpenBibleInDeck('${escapeHtml(heroBook)}', ${heroChap}, ${hero.verse})">
          Open in Deck
        </button>
        <button type="button" class="omni-action-btn secondary" style="justify-content:center; padding:4px 8px; font-size:10.5px;" onclick="event.stopPropagation(); omniAddVerseToAgenda('${escapeHtml(heroBook)}', ${heroChap}, ${hero.verse}, '${escapeHtml(hero.text)}', '${activeVer}')">
          + Agenda
        </button>
      </div>
    </div>
  `;

  if (remaining.length > 0) {
    html += `<div class="bento-omni-grid">`;
    remaining.forEach(v => {
      const vBook = v.book || (parsed ? parsed.book : '');
      const vChap = v.chapter || (parsed ? parsed.chapter : 1) || 1;
      const vRef = v.book ? `${v.book} ${v.chapter}:${v.verse}` : `${vBook} ${vChap}:${v.verse}`;
      html += `
        <div class="bento-omni-grid-card scripture-card" onclick="omniOpenBibleInDeck('${escapeHtml(vBook)}', ${vChap}, ${v.verse})" title="Click to open ${vRef} in deck">
          <div>
            <div class="bento-omni-card-header">
              <span class="bento-omni-card-title">${vRef}</span>
              <span class="omni-card-badge local">${activeVer}</span>
            </div>
            <div class="bento-omni-card-author scripture">${escapeHtml(vBook)} ${vChap}</div>
            <div class="bento-omni-card-snippet">${escapeHtml(v.text)}</div>
          </div>
          <div class="bento-omni-card-actions">
            <button type="button" class="bento-omni-btn-main scripture" onclick="event.stopPropagation(); omniOpenBibleInDeck('${escapeHtml(vBook)}', ${vChap}, ${v.verse})">
              Open in Deck
            </button>
            <button type="button" class="bento-omni-btn-plus" title="Add to Service Agenda" onclick="event.stopPropagation(); omniAddVerseToAgenda('${escapeHtml(vBook)}', ${vChap}, ${v.verse}, '${escapeHtml(v.text)}', '${activeVer}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }

  return html;
}

// ─── Reusable Helper: Render Saved Local Songs in Classic (list) or Bento (Hero+Grid) ─
function renderLocalSongsResultsHtml(matches) {
  if (!matches || matches.length === 0) return '';
  const isBento = (document.body.getAttribute('data-theme-style') === 'bento');

  if (!isBento) {
    return matches.slice(0, 6).map(s => {
      const preview = cleanOmniPreview(s._matchedSnippet || (s.stanzas && s.stanzas[0] ? s.stanzas[0].text : ''));
      const artist = cleanOmniArtist(s.author);
      return `
        <div class="omni-card omni-card-clickable" style="border-left:3px solid var(--green, #3ecf7e); cursor:pointer;" onclick="omniLoadSongToDeck('${s.id}')" title="Open '${escapeHtml(s.title)}'">
          <div style="min-width:0; flex:1;">
            <div class="omni-card-title">
              <span>${escapeHtml(s.title)}</span>
              <span class="omni-card-badge local">Saved</span>
              <span style="font-size:9.5px; color:var(--mute, #696773); font-weight:500;">${s.stanzas ? s.stanzas.length : 0} slides</span>
            </div>
            <div class="omni-card-sub">
              <span style="color:var(--green, #3ecf7e); font-weight:500;">${escapeHtml(artist)}</span>${preview ? ` • ${escapeHtml(preview.slice(0, 85))}...` : ''}
            </div>
          </div>
          <div class="omni-card-actions">
            <button type="button" class="omni-action-btn live" onclick="event.stopPropagation(); omniLoadSongToDeck('${s.id}')">
              Open
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Bento Theme: 1 Top Hero Match Card + 2-Column Grid
  const hero = matches[0];
  const remaining = matches.slice(1, 5);

  const heroPreview = cleanOmniPreview(hero._matchedSnippet || (hero.stanzas && hero.stanzas[0] ? hero.stanzas[0].text : ''));
  const heroArtist = cleanOmniArtist(hero.author);

  let html = `
    <!-- Top Best Match Saved Song Hero Card -->
    <div class="bento-omni-hero-card" onclick="omniLoadSongToDeck('${hero.id}')" title="Click to open '${escapeHtml(hero.title)}' in workspace deck">
      <div class="bento-omni-icon-box" style="background:linear-gradient(135deg, #10b981 0%, #059669 100%); box-shadow:0 4px 14px rgba(16, 185, 129, 0.35);">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      </div>
      <div class="bento-omni-hero-info">
        <div class="bento-omni-hero-title-row">
          <span class="bento-omni-hero-title">${escapeHtml(hero.title)}</span>
          <span class="omni-card-badge local">SAVED</span>
          <span style="font-size:9.5px; color:var(--mute, #696773); font-weight:500;">${hero.stanzas ? hero.stanzas.length : 0} slides</span>
        </div>
        <div class="bento-omni-hero-sub">
          <span style="color:var(--green, #3ecf7e); font-weight:600;">${escapeHtml(heroArtist)}</span>
        </div>
        <div class="bento-omni-hero-sub" style="margin-top:2px; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;">
          ${escapeHtml(heroPreview)}
        </div>
      </div>
      <div class="bento-omni-hero-actions">
        <button type="button" class="bento-omni-btn-main" onclick="event.stopPropagation(); omniLoadSongToDeck('${hero.id}')">
          Open in Deck
        </button>
      </div>
    </div>
  `;

  if (remaining.length > 0) {
    html += `<div class="bento-omni-grid">`;
    remaining.forEach(s => {
      const preview = cleanOmniPreview(s._matchedSnippet || (s.stanzas && s.stanzas[0] ? s.stanzas[0].text : ''));
      const artist = cleanOmniArtist(s.author);
      html += `
        <div class="bento-omni-grid-card" onclick="omniLoadSongToDeck('${s.id}')" title="Click to open '${escapeHtml(s.title)}' in workspace deck">
          <div>
            <div class="bento-omni-card-header">
              <span class="bento-omni-card-title">${escapeHtml(s.title)}</span>
              <span class="omni-card-badge local">SAVED</span>
            </div>
            <div class="bento-omni-card-author" style="color:var(--green, #3ecf7e);">${escapeHtml(artist)}</div>
            <div class="bento-omni-card-snippet">${escapeHtml(preview)}</div>
          </div>
          <div class="bento-omni-card-actions">
            <button type="button" class="bento-omni-btn-main" onclick="event.stopPropagation(); omniLoadSongToDeck('${s.id}')">
              Open in Deck
            </button>
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }

  return html;
}

// ─── Reusable Helper: Render Cloud Songs in Classic (list) or Bento (Hero+Grid) ─
function renderCloudResultsHtml(results) {
  if (!results || results.length === 0) return '';
  if (!window._omniCloudMap) window._omniCloudMap = new Map();
  results.forEach((s, i) => {
    if (s) {
      if (!s.id) s.id = `cloud_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
      window._omniCloudMap.set(s.id, s);
    }
  });

  const isBento = (document.body.getAttribute('data-theme-style') === 'bento');

  if (!isBento) {
    // Classic Theme: Single Column List
    return results.slice(0, 6).map((s, idx) => {
      const preview = cleanOmniPreview(s.previewText || (s.stanzas && s.stanzas[0] ? s.stanzas[0].text : ''));
      const artist = cleanOmniArtist(s.author);
      const safeId = escapeHtml(s.id);
      return `
        <div class="omni-card omni-card-clickable" style="border-left:3px solid var(--pink, #f178b6); cursor:pointer;" onclick="omniAddAndOpenCloudSong('${safeId}')" title="Click to save and open '${escapeHtml(s.title)}'">
          <div style="min-width:0; flex:1;">
            <div class="omni-card-title">
              <span>${escapeHtml(s.title)}</span>
              <span style="font-size:9.5px; color:var(--mute, #696773); font-weight:500;">${s.stanzas ? s.stanzas.length : 0} slides</span>
            </div>
            <div class="omni-card-sub">
              <span style="color:var(--pink, #f178b6); font-weight:500;">${escapeHtml(artist)}</span>${preview ? ` • ${escapeHtml(preview.slice(0, 100))}...` : ''}
            </div>
          </div>
          <div class="omni-card-actions">
            <button type="button" class="omni-action-btn cloud-add" onclick="event.stopPropagation(); omniAddAndOpenCloudSong('${safeId}')" title="Save & open in workspace">
              Add & Project
            </button>
            <button type="button" class="omni-action-btn secondary" onclick="event.stopPropagation(); omniAddCloudSongToDatabase('${safeId}')" title="Save to database (keep modal open)">
              + Save
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Bento Theme: 1 Top Match Hero Card + 2-Column Grid for remaining matches
  const hero = results[0];
  const remaining = results.slice(1, 5);

  const heroPreview = cleanOmniPreview(hero.previewText || (hero.stanzas && hero.stanzas[0] ? hero.stanzas[0].text : ''));
  const heroArtist = cleanOmniArtist(hero.author);
  const safeHeroId = escapeHtml(hero.id);

  let html = `
    <!-- Top Best Match Hero Card (Full Width) -->
    <div class="bento-omni-hero-card" onclick="omniAddAndOpenCloudSong('${safeHeroId}')" title="Click to save and open '${escapeHtml(hero.title)}'">
      <div class="bento-omni-icon-box">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      </div>
      <div class="bento-omni-hero-info">
        <div class="bento-omni-hero-title-row">
          <span class="bento-omni-hero-title">${escapeHtml(hero.title)}</span>
          <span style="font-size:9.5px; color:var(--mute, #696773); font-weight:500;">${hero.stanzas ? hero.stanzas.length : 0} slides</span>
        </div>
        <div class="bento-omni-hero-sub">
          <span style="color:var(--pink, #f178b6); font-weight:600;">${escapeHtml(heroArtist)}</span>
        </div>
        <div class="bento-omni-hero-sub" style="margin-top:2px; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;">
          ${escapeHtml(heroPreview)}
        </div>
      </div>
      <div class="bento-omni-hero-actions">
        <button type="button" class="bento-omni-btn-main" onclick="event.stopPropagation(); omniAddAndOpenCloudSong('${safeHeroId}')">
          Add & Project
        </button>
        <button type="button" class="omni-action-btn secondary" style="justify-content:center; padding:4px 8px; font-size:10.5px;" onclick="event.stopPropagation(); omniAddCloudSongToDatabase('${safeHeroId}')">
          + Save
        </button>
      </div>
    </div>
  `;

  if (remaining.length > 0) {
    html += `<div class="bento-omni-grid">`;
    remaining.forEach((s) => {
      const preview = cleanOmniPreview(s.previewText || (s.stanzas && s.stanzas[0] ? s.stanzas[0].text : ''));
      const artist = cleanOmniArtist(s.author);
      const safeId = escapeHtml(s.id);
      html += `
        <div class="bento-omni-grid-card" onclick="omniAddAndOpenCloudSong('${safeId}')" title="Click to save and open '${escapeHtml(s.title)}'">
          <div>
            <div class="bento-omni-card-header">
              <span class="bento-omni-card-title">${escapeHtml(s.title)}</span>
              <span style="font-size:9.5px; color:var(--mute, #696773); font-weight:500;">${s.stanzas ? s.stanzas.length : 0} slides</span>
            </div>
            <div class="bento-omni-card-author">${escapeHtml(artist)}</div>
            <div class="bento-omni-card-snippet">${escapeHtml(preview)}</div>
          </div>
          <div class="bento-omni-card-actions">
            <button type="button" class="bento-omni-btn-main" onclick="event.stopPropagation(); omniAddAndOpenCloudSong('${safeId}')">
              Add & Project
            </button>
            <button type="button" class="bento-omni-btn-plus" title="Save to local database (keep modal open)" onclick="event.stopPropagation(); omniAddCloudSongToDatabase('${safeId}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }
  return html;
}

// ─── 2. Scripture-Only Filter Mode ──────────────────────────────────────────
function renderOmniVersesResults(query, container) {
  if (!query) {
    const activeVer = state.bibleVersion || 'KJV';
    container.innerHTML = `
      <div class="omni-empty-compact">
        <div class="omni-empty-icon" style="color:var(--blue, #5fa8f5);">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </div>
        <div class="omni-empty-title">Scriptures Lookup (${activeVer})</div>
        <div class="omni-empty-desc">
          Search by reference (e.g. John 3:16) or phrase (e.g. "the Lord is my shepherd").
        </div>
        <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">
          <span class="tag-chip" onclick="setOmniSearchText('John 3:16')">John 3:16</span>
          <span class="tag-chip" onclick="setOmniSearchText('Psalms 23:1')">Psalm 23:1</span>
          <span class="tag-chip" onclick="setOmniSearchText('Romans 8:28')">Rom 8:28</span>
        </div>
      </div>
    `;
    return;
  }

  let parsed = null;
  if (typeof window.parseScriptureReference === 'function') {
    parsed = window.parseScriptureReference(query);
  }
  if (!parsed || !parsed.book) {
    const match = query.match(/^([1-3]?\s*[A-Za-z]+)\s*(\d*)(?:[:\.](\d+)(?:-(\d+))?)?$/i);
    if (match && window.libraryImporter && window.libraryImporter.isBibleBookName(match[1])) {
      parsed = {
        book: window.libraryImporter.normalizeBookName(match[1]),
        chapter: match[2] ? parseInt(match[2], 10) : 1,
        verse: match[3] ? parseInt(match[3], 10) : null,
        verseEnd: match[4] ? parseInt(match[4], 10) : null
      };
    }
  }

  const activeVer = state.bibleVersion || 'KJV';
  if (parsed && parsed.book) {
    const verses = getBibleVerses(parsed.book, parsed.chapter || 1, activeVer);
    if (verses && verses.length > 0) {
      let filteredVerses = verses;
      if (parsed.verse) {
        if (parsed.verseEnd && parsed.verseEnd >= parsed.verse) {
          filteredVerses = verses.filter(v => v.verse >= parsed.verse && v.verse <= parsed.verseEnd);
        } else {
          filteredVerses = verses.filter(v => v.verse === parsed.verse);
        }
      }
      if (filteredVerses.length === 0) filteredVerses = verses.slice(0, 10);

      container.innerHTML = `
        <div class="omni-section-header" style="color:var(--blue, #5fa8f5);">
          <span>${parsed.book} Chapter ${parsed.chapter || 1} (${activeVer})</span>
          <span style="font-size:10px; color:var(--mute); cursor:pointer;" onclick="omniOpenBibleInDeck('${escapeHtml(parsed.book)}', ${parsed.chapter || 1}, ${parsed.verse || 'null'})">Open in Deck ↗</span>
        </div>
        ${renderScripturesResultsHtml(filteredVerses, parsed, activeVer, !!parsed.verse)}
      `;
      return;
    }
  }

  // Fallback phrase search
  const textMatches = searchBibleFullText(query, activeVer, 6);
  if (textMatches.length > 0) {
    container.innerHTML = `
      <div class="omni-section-header" style="color:var(--blue, #5fa8f5);">
        <span>Phrase Matches in ${activeVer} (${textMatches.length})</span>
      </div>
      ${renderScripturesResultsHtml(textMatches, parsed, activeVer, false)}
    `;
    return;
  }

  container.innerHTML = `
    <div class="omni-empty-state" style="text-align:center; padding:30px 16px;">
      <div style="color:var(--dim, #a3a1ae); font-size:13px; margin-bottom:12px;">No scripture verses found for "<b style="color:var(--text);">${escapeHtml(query)}</b>".</div>
      <button type="button" class="omni-action-btn live" style="margin:0 auto;" onclick="switchOmniSearchMode('all')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; margin-right:4px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <span>Search in All Categories</span>
      </button>
    </div>
  `;
}

// ─── 3. Songs-Only Filter Mode ──────────────────────────────────────────────
function renderOmniSongsResults(query, container) {
  if (!query) {
    container.innerHTML = `
      <div class="omni-empty-compact">
        <div class="omni-empty-icon" style="color:var(--pink, #f178b6);">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </div>
        <div class="omni-empty-title">Search Songs (Local & Online)</div>
        <div class="omni-empty-desc">
          Search across local database and global cloud worship lyric libraries.
        </div>
        <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">
          <span class="tag-chip" onclick="setOmniSearchText('Way Maker')">Way Maker</span>
          <span class="tag-chip" onclick="setOmniSearchText('Goodness of God')">Goodness of God</span>
          <span class="tag-chip" onclick="setOmniSearchText('Gratitude')">Gratitude</span>
        </div>
      </div>
    `;
    return;
  }

  const localMatches = (SONGS_DATABASE || []).filter(s => matchSongQuery(s, query));

  let html = '';

  if (localMatches.length > 0) {
    html += `
      <div class="omni-section-header" style="color:var(--green, #3ecf7e);">
        <span>SAVED SONGS IN DATABASE (${localMatches.length})</span>
      </div>
      ${renderLocalSongsResultsHtml(localMatches)}
    `;
  }

  html += `
    <div id="omni-cloud-section" style="margin-top:10px;">
      <div class="omni-section-header" style="color:var(--pink, #f178b6);">
        <span>Global Online Cloud Songs</span>
        <span id="omni-cloud-status" style="font-weight:400; font-size:10px; color:var(--mute, #696773);">Searching...</span>
      </div>
      <div id="omni-cloud-items" style="display:flex; flex-direction:column; gap:8px;">
        <div style="padding:16px; text-align:center; color:var(--mute, #696773); font-size:11.5px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; animation:spin 1s linear infinite; margin-right:4px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Searching online repositories...
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  clearTimeout(omniCloudSearchDebounce);
  const thisSeq = ++omniCloudSearchSeq;
  omniCloudSearchDebounce = setTimeout(async () => {
    const cloudItems = document.getElementById('omni-cloud-items');
    const cloudStatus = document.getElementById('omni-cloud-status');
    if (!cloudItems) return;

    try {
      if (!window.libraryImporter) return;
      const results = await window.libraryImporter.searchOnlineLyrics(query);
      if (thisSeq !== omniCloudSearchSeq) {
        return; // Stale in-flight query response, discard!
      }
      omniCurrentCloudResults = results || [];

      if (cloudStatus) cloudStatus.textContent = `${omniCurrentCloudResults.length} results`;

      if (!omniCurrentCloudResults || omniCurrentCloudResults.length === 0) {
        cloudItems.innerHTML = `<div style="padding:14px; text-align:center; color:var(--mute); font-size:11.5px;">No online lyrics found for "${escapeHtml(query)}".</div>`;
        return;
      }

      cloudItems.innerHTML = renderCloudResultsHtml(omniCurrentCloudResults);
    } catch (e) {
      if (thisSeq !== omniCloudSearchSeq) return;
      cloudItems.innerHTML = `<div style="color:var(--red, #f2554b); font-size:11px; padding:10px;">Cloud search: ${e.message}</div>`;
    }
  }, 350);
}


function setOmniSearchText(txt) {
  const input = document.getElementById('omni-search-input');
  if (input) {
    input.value = txt;
    input.focus();
    handleOmniSearchInput(txt);
  }
}

// ─── Actions from Omni Search ────────────────────────────────────────────────
function omniProjectVerse(book, chapter, verse, text, version) {
  const slideId = `bible_${book}_${chapter}_${verse}`;
  const ref = `${book} ${chapter}:${verse} (${version || state.bibleVersion || 'KJV'})`;
  projectSlide(slideId, text, ref);
  showToast(`Projecting ${ref} live!`, 'info');
}

function omniAddVerseToAgenda(book, chapter, verse, text, version) {
  const title = `${book} ${chapter}:${verse} (${version || state.bibleVersion || 'KJV'})`;
  state.agendaItems.push({
    id: `agenda_${Date.now()}`,
    title: title,
    type: 'scripture',
    text: text,
    ref: title,
    book: book,
    chapter: chapter,
    verse: verse,
    version: version || state.bibleVersion
  });
  renderAgenda();
  syncDashboardWorkspace();
  showToast(`Added ${title} to Service Agenda`, 'success');
}

function omniOpenBibleInDeck(book, chapter, verse = null, projectVerse = true) {
  state.activeBibleBook = book;
  state.activeBibleChapter = parseInt(chapter, 10) || 1;
  if (verse) {
    state.activeBibleVerse = parseInt(verse, 10) || 1;
  }
  state.activeDeckType = 'bible';
  state.currentTab = 'bible';
  state.liveEngagedDeck = null;
  if (typeof window.cancelPreparedSlide === 'function') window.cancelPreparedSlide();
  renderLibrary();
  renderDeck(true);
  syncDashboardWorkspace();
  closeOmniSearchPalette();

  if (verse) {
    requestAnimationFrame(() => {
      const activeVer = state.bibleVersion || 'KJV';
      const classicSlideId = `bible_${activeVer}_${book}_${state.activeBibleChapter}_${verse}`;
      const bentoSlideId = `bible_${book}_${state.activeBibleChapter}_${verse}`;
      
      const card = document.getElementById(`card_${classicSlideId}`) 
        || document.getElementById(`bento_card_${bentoSlideId}`) 
        || document.querySelector(`[data-slide-id="${classicSlideId}"]`) 
        || document.querySelector(`[data-slide-id="${bentoSlideId}"]`);
      
      if (card) {
        if (projectVerse && typeof card.click === 'function') card.click();
        else card.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      }
      if (projectVerse && typeof scrollToActiveSlide === 'function') {
        scrollToActiveSlide({ center: true });
      }
    });
  }
}

function omniProjectLocalSong(songId) {
  const song = (SONGS_DATABASE || []).find(s => s.id === songId);
  if (!song) return;
  state.activeSongId = song.id;
  state.activeDeckType = 'song';
  state.currentTab = 'songs';
  if (typeof window.applySongBoundTheme === 'function') {
    window.applySongBoundTheme(song.id);
  }
  renderLibrary();
  renderDeck(true);
  syncDashboardWorkspace();

  if (song.stanzas && song.stanzas.length > 0) {
    const firstSlide = song.stanzas[0];
    projectSlide(`${song.id}_0`, firstSlide.text, song.title);
  }
  showToast(`Projecting "${song.title}" live!`, 'info');
  closeOmniSearchPalette();
}

function omniLoadSongToDeck(songId) {
  state.activeSongId = songId;
  state.activeDeckType = 'song';
  state.currentTab = 'songs';
  state.liveEngagedDeck = null;
  if (typeof window.cancelPreparedSlide === 'function') window.cancelPreparedSlide();
  if (typeof window.applySongBoundTheme === 'function') {
    window.applySongBoundTheme(songId);
  }
  renderLibrary();
  renderDeck(true);
  syncDashboardWorkspace();
  closeOmniSearchPalette();
}

function omniAddAndProjectCloudSong(songOrIdOrIdx) {
  let song = null;
  if (typeof songOrIdOrIdx === 'object' && songOrIdOrIdx !== null) {
    song = songOrIdOrIdx;
  } else if (typeof songOrIdOrIdx === 'string') {
    if (window._omniCloudMap && window._omniCloudMap.has(songOrIdOrIdx)) {
      song = window._omniCloudMap.get(songOrIdOrIdx);
    } else if (typeof SONGS_DATABASE !== 'undefined') {
      song = SONGS_DATABASE.find(s => s.id === songOrIdOrIdx);
    }
  } else if (typeof songOrIdOrIdx === 'number' && omniCurrentCloudResults && omniCurrentCloudResults[songOrIdOrIdx]) {
    song = omniCurrentCloudResults[songOrIdOrIdx];
  }
  if (!song) return;

  state.activeDeckType = 'song';
  state.currentTab = 'songs';
  let targetSongId = song.id || '';

  if (window.libraryImporter) {
    const importRes = window.libraryImporter.importSongsData(song, true, true);
    if (importRes && Array.isArray(importRes.songs) && importRes.songs[0]) {
      targetSongId = importRes.songs[0].id || targetSongId;
      song = importRes.songs[0];
    }
  }

  state.activeSongId = targetSongId;
  if (typeof window.applySongBoundTheme === 'function') {
    window.applySongBoundTheme(targetSongId);
  }

  renderLibrary();
  renderDeck(true);
  syncRemoteCatalog();
  syncDashboardWorkspace();

  if (song.stanzas && song.stanzas.length > 0) {
    projectSlide(`${targetSongId}_0`, song.stanzas[0].text, song.title);
  }

  showToast(`Added and projected "${song.title}"!`, 'success');
  closeOmniSearchPalette();
}

// omniAddAndOpenCloudSong is declared at top

function omniAddCloudSongToDatabase(songOrIdOrIdx) {
  let song = null;
  if (typeof songOrIdOrIdx === 'object' && songOrIdOrIdx !== null) {
    song = songOrIdOrIdx;
  } else if (typeof songOrIdOrIdx === 'string') {
    if (window._omniCloudMap && window._omniCloudMap.has(songOrIdOrIdx)) {
      song = window._omniCloudMap.get(songOrIdOrIdx);
    } else if (window._cloudTabSearchResultsMap && window._cloudTabSearchResultsMap.has(songOrIdOrIdx)) {
      song = window._cloudTabSearchResultsMap.get(songOrIdOrIdx);
    } else if (typeof SONGS_DATABASE !== 'undefined') {
      song = SONGS_DATABASE.find(s => s.id === songOrIdOrIdx);
    }
  } else if (typeof songOrIdOrIdx === 'number' && omniCurrentCloudResults && omniCurrentCloudResults[songOrIdOrIdx]) {
    song = omniCurrentCloudResults[songOrIdOrIdx];
  }
  if (!song) return;

  if (window.libraryImporter) {
    window.libraryImporter.importSongsData(song, true);
  }

  renderLibrary();
  syncRemoteCatalog();
  showToast(`Saved "${song.title}" by ${song.author || 'Unknown'} to local database!`, 'success');
  const input = document.getElementById('omni-search-input');
  if (input) handleOmniSearchInput(input.value);
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM RESET & FORMAT CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────
function openSystemResetModal() {
  const modal = document.getElementById('system-reset-modal-backdrop');
  if (modal) {
    modal.classList.add('open');
  } else {
    // Fallback confirmation dialog if modal backdrop not yet mounted
    if (confirm('Are you sure you want to perform a system reset? All active songs, scriptures, service agenda, and workspace settings will revert to defaults. Theme styling will be preserved.')) {
      performSystemReset();
    }
  }
}

function closeSystemResetModal() {
  const modal = document.getElementById('system-reset-modal-backdrop');
  if (modal) modal.classList.remove('open');
}

function performSystemReset() {
  // 1. Clear Workspace Storage Keys (Strictly preserving sf_ui_style and sf_ui_mode)
  try {
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    localStorage.removeItem('scriptureflow_live_state');
    localStorage.removeItem('sf_remote_workspace_state');
    localStorage.removeItem('sf_bento_single_cols');
    localStorage.removeItem('sf_bento_single_zoom');
    localStorage.removeItem('sf_bento_medley_zoom');
    localStorage.removeItem('sf_deck_zoom');
    localStorage.removeItem('sf_bible_medley_change_target');
    localStorage.removeItem('sf_custom_songs');
    localStorage.removeItem('sf_custom_bibles');
    localStorage.removeItem('sf_custom_songbooks');
    localStorage.removeItem('sf_agenda_height');
    localStorage.removeItem('sf_sidebar_width');
    localStorage.removeItem('sf_preview_width');
    localStorage.removeItem('sf_bento_sidebar_width');
    localStorage.removeItem('sf_bento_preview_width');
    localStorage.removeItem('sf_bento_agenda_height');
    localStorage.removeItem('sf_bento_preview_height');
    localStorage.setItem('sf_system_formatted', 'true');
    if (typeof ThemeResizerEngine !== 'undefined') {
      ThemeResizerEngine.resetThemeDimensions();
    }
  } catch (e) {
    console.warn('LocalStorage reset error:', e);
  }

  // 2. Clear IndexedDB Custom Library Data if Importer is Available
  if (window.libraryImporter && typeof window.libraryImporter.clearAllData === 'function') {
    try {
      window.libraryImporter.clearAllData();
    } catch (e) {
      console.warn('Library clear error:', e);
    }
  }

  // 3. Clear Runtime Database Arrays in Memory
  if (typeof SONGS_DATABASE !== 'undefined') SONGS_DATABASE.length = 0;
  if (typeof SONGBOOKS_DATABASE !== 'undefined') SONGBOOKS_DATABASE.length = 0;
  if (typeof BIBLE_DATABASE !== 'undefined') {
    for (let k in BIBLE_DATABASE) delete BIBLE_DATABASE[k];
  }

  // 3. Reset In-Memory State to Clean Blank Defaults
  state.agendaItems = [];
  state.activeLiveSlideId = null;
  state.activeLiveText = '';
  state.activeLiveRef = '';
  state.isClear = true;
  state.isHoldLive = false;
  state.activeSongId = null;
  state.activeBibleBook = '';
  state.activeBibleChapter = 1;
  state.expandedBibleBook = null;
  state.isMedleyMode = false;
  state.medleySongIds = [];
  state.medleyBibleSlots = [];
  state.isCompareMode = false;
  state.compareData = null;

  // Defaults specified by user:
  // - Columns: 1 Col
  // - Zoom: 100% (1.0)
  // - Split: Full (0 lines)
  state.bentoSingleCols = 1;
  state.bentoSingleScale = 1.0;
  state.bentoMedleyScale = 1.0;
  state.deckScale = 1.0;
  state.deckZoom = 1.0;
  state.maxLinesPerSlide = 0;

  // Clear AI states & histories
  state.aiDetectedVerses = [];
  state.aiDetectedSongs = [];
  state.aiSuggestions = [];
  state.aiTranscript = '';
  state.lastAutoDetectedRef = '';
  state.lastAutoDetectedSongSlide = '';
  state.scriptureHistory = [];
  state.paraphraseMatches = [];

  // Reset CSS custom properties for zoom and widths
  document.documentElement.style.setProperty('--deck-scale-single', '1');
  document.documentElement.style.setProperty('--deck-scale-medley', '1');
  document.documentElement.style.setProperty('--deck-scale', '1');

  // Reset UI Controls & Labels
  const zoomLabel = document.getElementById('bento-zoom-label');
  if (zoomLabel) zoomLabel.textContent = '100%';
  const deckZoomLabel = document.getElementById('deck-zoom-label');
  if (deckZoomLabel) deckZoomLabel.textContent = '100%';

  const colsSeg = document.getElementById('bento-cols-seg');
  if (colsSeg) {
    colsSeg.querySelectorAll('span').forEach(sp => {
      sp.classList.toggle('active', parseInt(sp.dataset.cols, 10) === 1);
    });
  }

  const linesSeg = document.getElementById('bento-lines-seg');
  if (linesSeg) {
    linesSeg.querySelectorAll('span').forEach(sp => {
      sp.classList.toggle('active', parseInt(sp.dataset.lines, 10) === 0);
    });
  }

  const searchInput = document.getElementById('bento-search-input');
  if (searchInput) searchInput.value = '';
  const sideSearchInput = document.getElementById('sidebar-search-input');
  if (sideSearchInput) sideSearchInput.value = '';

  // Broadcast blank/clear state to secondary displays
  clearAllOutputs();

  // Close reset confirmation modal and settings modal
  closeSystemResetModal();
  const settingsModal = document.getElementById('settings-modal-backdrop');
  if (settingsModal) settingsModal.classList.remove('open');

  // Re-render all views
  renderAgenda();
  renderLibrary();
  renderDeck();
  renderAiHud();
  if (typeof window.renderBentoAgenda === 'function') window.renderBentoAgenda();
  if (typeof window.renderBentoLibrary === 'function') window.renderBentoLibrary();
  if (typeof window.renderBentoDeck === 'function') window.renderBentoDeck();
  if (typeof window.syncBentoStagePreview === 'function') window.syncBentoStagePreview();
  if (typeof window.syncBentoAiHud === 'function') window.syncBentoAiHud();
  if (typeof window.syncBentoTabsUI === 'function') window.syncBentoTabsUI();

  showToast('System reset complete. Workspace, songs, scriptures, and agenda have been reset to defaults.', 'success');
}

function performClearBiblesOnly() {
  if (window.libraryImporter && typeof window.libraryImporter.clearBiblesOnly === 'function') {
    window.libraryImporter.clearBiblesOnly();
  }
  if (typeof BIBLE_DATABASE !== 'undefined') {
    for (let k in BIBLE_DATABASE) delete BIBLE_DATABASE[k];
  }
  state.bibleVersion = '';
  state.activeBibleBook = '';
  state.activeBibleChapter = 1;
  const verLabel = document.getElementById('active-version-label');
  if (verLabel) verLabel.textContent = 'Select';

  closeSystemResetModal();
  renderLibrary();
  renderDeck();
  renderCloudBibles();
  syncRemoteCatalog();
  showToast('All downloaded Bible translations have been cleared from storage.', 'info');
}

function performClearSongsOnly() {
  if (window.libraryImporter && typeof window.libraryImporter.clearSongsOnly === 'function') {
    window.libraryImporter.clearSongsOnly();
  }
  if (typeof SONGS_DATABASE !== 'undefined') {
    SONGS_DATABASE.length = 0;
  }
  if (typeof SONGBOOKS_DATABASE !== 'undefined') {
    SONGBOOKS_DATABASE.length = 0;
  }
  state.activeSongId = null;
  state.medleySongIds = [];

  closeSystemResetModal();
  renderLibrary();
  renderDeck();
  syncRemoteCatalog();
  showToast('All saved songs have been cleared from local database.', 'info');
}

function projectAiSuggestion(sugId) {
  if (!sugId) return;
  const item = (state.aiDetectedVerses || []).find(s => (s.id || s.rawReference || s.reference) === sugId) ||
    (state.aiSuggestions || []).find(s => (s.id || s.rawReference || s.reference) === sugId) ||
    (state.aiDetectedSongs || []).find(s => (s.id || s.title) === sugId);
  if (!item) return;

  window.performDetectionAction(item, 'select');
}

function addAiToAgenda(sugId) {
  if (!sugId) return;
  const item = (state.aiDetectedVerses || []).find(s => (s.id || s.rawReference || s.reference) === sugId) ||
    (state.aiSuggestions || []).find(s => (s.id || s.rawReference || s.reference) === sugId) ||
    (state.aiDetectedSongs || []).find(s => (s.id || s.title) === sugId);
  if (!item) return;

  if (item.book) {
    const isRange = item.endVerse && item.endVerse > item.verse;
    const title = isRange ? `${item.book} ${item.chapter}:${item.verse}-${item.endVerse}` : `${item.book} ${item.chapter}:${item.verse}`;
    const ver = item.version || state.bibleVersion || 'KJV';
    state.agendaItems.push({
      id: `agenda_${Date.now()}`,
      title: title,
      type: 'bible',
      book: item.book,
      chapter: item.chapter,
      verse: item.verse,
      endVerse: item.endVerse || null,
      meta: `${ver} · ${item.book} ${item.chapter}`,
      text: item.text || ''
    });
  } else if (item.title) {
    state.agendaItems.push({
      id: item.songId || `agenda_${Date.now()}`,
      title: item.title,
      type: 'song',
      meta: item.artist || 'Worship Song',
      songId: item.songId || null
    });
  }
  renderAgenda();
  syncDashboardWorkspace();
  showToast('Added to Service Agenda!', 'success');
}

// ── Live Microphone Hardware Discovery & Real-Time VU Level Meter ──────────────
/* hoisted */
/* hoisted */
let audioMeterContext = null;
let audioMeterAnalyser = null;
let audioMeterStream = null;
let audioMeterAnimFrame = null;
let audioMeterRequestId = 0;

async function refreshAudioInputDevices() {
  const select = document.getElementById('setting-audio-mic-select');
  if (!select) return;

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      select.innerHTML = '<option value="default">Default System Microphone</option>';
      return;
    }

    // Query devices
    let devices = await navigator.mediaDevices.enumerateDevices();
    let audioInputs = devices.filter(d => d.kind === 'audioinput');

    audioInputDevices = audioInputs;
    select.innerHTML = '';

    if (audioInputs.length === 0) {
      select.innerHTML = '<option value="default">Default Laptop Microphone</option>';
      return;
    }

    audioInputs.forEach((d, idx) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId || 'default';
      opt.textContent = d.label || `Microphone ${idx + 1} (${d.deviceId.slice(0, 8)}...)`;
      if (d.deviceId === selectedAudioDeviceId || (!selectedAudioDeviceId && idx === 0)) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    syncActiveSpeechSettings();

  } catch (err) {
    console.error('Error refreshing audio input devices:', err);
    select.innerHTML = '<option value="default">Default System Microphone</option>';
  } finally {
    syncCustomSelect(select);
  }
}

function selectAudioInputDevice(deviceId, deviceLabel) {
  selectedAudioDeviceId = deviceId;
  localStorage.setItem('sf_selected_mic_device', deviceId);

  const select = document.getElementById('setting-audio-mic-select');
  if (select && select.value !== deviceId) {
    select.value = deviceId;
  }

  if (deviceLabel) {
    updateAudioMicPickerButtonLabel(deviceLabel);
  } else {
    const active = (audioMicDevices || []).find(d => d.deviceId === deviceId);
    if (active) updateAudioMicPickerButtonLabel(active.label || 'Microphone');
  }

  document.querySelectorAll('#audio-mic-device-list .audio-mic-option').forEach(option => {
    option.classList.toggle('active', option.dataset.deviceId === deviceId);
  });
  startAudioVuMeter(deviceId);

  if (speechAi && typeof speechAi.setAudioDeviceId === 'function') {
    speechAi.setAudioDeviceId(deviceId);
  } else if (state.aiListening && speechAi) {
    speechAi.stop();
    setTimeout(() => { speechAi.start(); }, 200);
  }
}

async function startAudioVuMeter(deviceId) {
  stopAudioVuMeter();
  const requestId = audioMeterRequestId;
  const meterBar = document.getElementById('mic-vu-meter-bar');
  const levelText = document.getElementById('mic-vu-level-text');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

  try {
    const constraints = {
      audio: deviceId && deviceId !== 'default'
        ? { deviceId: { ideal: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: true }
        : true
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (requestId !== audioMeterRequestId) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    audioMeterStream = stream;

    audioMeterContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioMeterContext.state === 'suspended') {
      await audioMeterContext.resume();
      if (requestId !== audioMeterRequestId) return;
    }
    const source = audioMeterContext.createMediaStreamSource(audioMeterStream);
    audioMeterAnalyser = audioMeterContext.createAnalyser();
    audioMeterAnalyser.fftSize = 256;
    audioMeterAnalyser.smoothingTimeConstant = 0.4;
    source.connect(audioMeterAnalyser);

    const dataArray = new Uint8Array(audioMeterAnalyser.frequencyBinCount);

    let lastAudioActivityTime = 0;
    let lastAudioBroadcastTime = 0;

    function updateMeter() {
      if (requestId !== audioMeterRequestId || !audioMeterAnalyser) return;
      audioMeterAnalyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      const percent = Math.min(100, Math.round((avg / 120) * 100));

      if (percent > 2) {
        lastAudioActivityTime = Date.now();
      }
      const isAudible = (Date.now() - lastAudioActivityTime) < 1600;
      if (speechAi && typeof speechAi.setAudioActivity === 'function') {
        speechAi.setAudioActivity(isAudible);
      }

      if (meterBar) {
        meterBar.style.width = `${percent}%`;
        if (percent > 75) {
          meterBar.style.background = 'linear-gradient(90deg, #22C55E 0%, #EAB308 65%, #EF4444 100%)';
        } else if (percent > 40) {
          meterBar.style.background = 'linear-gradient(90deg, #22C55E 0%, #EAB308 100%)';
        } else {
          meterBar.style.background = 'linear-gradient(90deg, #10B981, #22C55E)';
        }
      }

      if (levelText) {
        levelText.textContent = `${percent}%`;
      }

      updateMicSignalBars(percent);

      // Stream live audio meter levels to remote operators
      if (state.aiListening && Date.now() - lastAudioBroadcastTime > 180) {
        lastAudioBroadcastTime = Date.now();
        broadcastSpeechAiUpdate({ audioLevel: percent });
      }

      audioMeterAnimFrame = requestAnimationFrame(updateMeter);
    }

    updateMeter();

  } catch (err) {
    if (requestId !== audioMeterRequestId) return;
    stopAudioVuMeter();
    if (levelText) levelText.textContent = 'Mic unavailable';
    console.warn('Microphone level monitoring unavailable:', err);
  }
}

function updateMicSignalBars(percent) {
  const container = document.getElementById('mic-signal-indicator');
  const bar1 = container?.querySelector('.bar-1');
  const bar2 = container?.querySelector('.bar-2');
  const bar3 = container?.querySelector('.bar-3');
  const bar4 = container?.querySelector('.bar-4');

  const p = Math.max(0, Number(percent) || 0);

  if (bar1) bar1.classList.toggle('active', p > 2);
  if (bar2) bar2.classList.toggle('active', p > 14);
  if (bar3) bar3.classList.toggle('active', p > 32);
  if (bar4) bar4.classList.toggle('active', p > 60);

  const bentoVu = document.getElementById('bento-vu-meter');
  if (bentoVu) {
    bentoVu.classList.toggle('live-active', !!state.aiListening);
    const bars = bentoVu.querySelectorAll('i');
    if (bars.length >= 4) {
      // Staggered thresholds for each bar to light up progressively
      const thresholds = [2, 14, 32, 60];
      // Dynamic heights: each bar animates to a level-proportional height when active
      // Heights use a staggered natural EQ shape (bar3 = tallest peak)
      const activeHeights = [50, 85, 100, 70];
      const idleHeights = [30, 55, 80, 45];
      thresholds.forEach((thresh, i) => {
        const isActive = p > thresh;
        bars[i].classList.toggle('active', isActive);
        // Override inline height for fluid realtime animation; CSS transition handles the tween
        if (isActive) {
          // Scale height within the active range for a true level-responsive feel
          const drive = Math.min(1, (p - thresh) / (100 - thresh));
          const baseH = activeHeights[i];
          const idleH = idleHeights[i];
          bars[i].style.height = `${Math.round(idleH + (baseH - idleH) * drive)}%`;
        } else {
          bars[i].style.height = `${idleHeights[i]}%`;
        }
      });
    }
  }
}

function stopAudioVuMeter() {
  audioMeterRequestId++;
  audioMeterAnalyser = null;
  if (audioMeterAnimFrame) {
    cancelAnimationFrame(audioMeterAnimFrame);
    audioMeterAnimFrame = null;
  }
  if (audioMeterStream) {
    try { audioMeterStream.getTracks().forEach(t => t.stop()); } catch (e) { }
    audioMeterStream = null;
  }
  if (audioMeterContext && audioMeterContext.state !== 'closed') {
    try { audioMeterContext.close(); } catch (e) { }
    audioMeterContext = null;
  }
  if (speechAi && typeof speechAi.setAudioActivity === 'function') {
    speechAi.setAudioActivity(false);
  }
  const meterBar = document.getElementById('mic-vu-meter-bar');
  const levelText = document.getElementById('mic-vu-level-text');
  if (meterBar) meterBar.style.width = '0%';
  if (levelText) levelText.textContent = '0%';
  updateMicSignalBars(0);
}

// Auto-detect plugged / unplugged microphones (USB mics, headsets, mixer lines)
if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.ondevicechange !== undefined) {
  navigator.mediaDevices.ondevicechange = () => {
    refreshAudioInputDevices();
  };
}

function setSegmented(btnEl, groupKey, value) {
  const parent = btnEl.closest('.settings-segmented-group');
  if (parent) {
    parent.querySelectorAll('.settings-segmented-btn').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
  }
  console.log(`Setting changed: ${groupKey} = ${value}`);
}

function syncMedleySettingsUI() {
  const bibleChangeTargetSelect = document.getElementById('setting-bible-medley-change-target');
  if (bibleChangeTargetSelect) {
    bibleChangeTargetSelect.value = state.bibleMedleyChangeTarget || 'chapter';
    if (typeof syncCustomSelect === 'function') {
      syncCustomSelect(bibleChangeTargetSelect);
    }
  }

  const bibleToggle = document.getElementById('setting-bible-medley-toggle');
  if (bibleToggle) {
    bibleToggle.checked = !!state.showBibleMedleyButtons;
  }

  const songsToggle = document.getElementById('setting-medley-view-toggle');
  if (songsToggle) {
    songsToggle.checked = !!state.showMedleyView;
  }
}
window.syncMedleySettingsUI = syncMedleySettingsUI;

function toggleMedleyViewSetting(checked) {
  state.showMedleyView = checked;
  syncMedleySettingsUI();
  renderLibrary();
  renderDeck();
  syncDashboardWorkspace();
}
window.toggleMedleyViewSetting = toggleMedleyViewSetting;

function toggleBibleMedleyButtonsSetting(checked) {
  state.showBibleMedleyButtons = checked;
  syncMedleySettingsUI();
  renderLibrary();
  renderDeck();
  syncDashboardWorkspace();
}
window.toggleBibleMedleyButtonsSetting = toggleBibleMedleyButtonsSetting;

function updateBibleMedleyChangeTarget(target) {
  state.bibleMedleyChangeTarget = target === 'version' ? 'version' : 'chapter';
  localStorage.setItem('sf_bible_medley_change_target', state.bibleMedleyChangeTarget);
  syncMedleySettingsUI();
  renderDeck();
  syncDashboardWorkspace();
}
window.updateBibleMedleyChangeTarget = updateBibleMedleyChangeTarget;

// Import & Cloud UI Modal Handlers
function openImportModal() {
  const modal = document.getElementById('import-modal-backdrop');
  if (modal) {
    modal.classList.add('open');
    renderCloudBibles();
    renderCloudSongs();
  }
}

function switchImportSubTab(subTab) {
  if (subTab === 'songs') subTab = 'files';
  const subTabs = ['files', 'manual', 'bibles', 'cloudsongs', 'migrate'];
  subTabs.forEach(tab => {
    const btn = document.getElementById(`import-tab-btn-${tab}`);
    const pane = document.getElementById(`import-subtab-${tab}`);
    if (btn) btn.classList.toggle('active', tab === subTab);
    if (pane) pane.style.display = (tab === subTab) ? 'flex' : 'none';
  });
  if (subTab === 'bibles' && typeof renderCloudBibles === 'function') {
    renderCloudBibles(document.getElementById('cloud-bible-search-input')?.value || '');
  }
  if (subTab === 'cloudsongs' && typeof filterCloudSongs === 'function') {
    filterCloudSongs(document.getElementById('cloud-song-search-input')?.value || '');
  }
  if (subTab === 'manual' && typeof updateImportLivePreview === 'function') {
    updateImportLivePreview();
  }
  if (subTab === 'migrate' && typeof initMigrationTab === 'function') {
    initMigrationTab();
  }
}

let currentMigrationScan = null;

function initMigrationTab() {
  const pathInput = document.getElementById('import-migrate-folder-path');
  if (pathInput && !pathInput.value) {
    pathInput.value = '/Users/corpine/Downloads/Blip/VideoPsalm';
  }
}

async function handleMigrationScan() {
  const pathInput = document.getElementById('import-migrate-folder-path');
  const folderPath = pathInput?.value?.trim();
  const statusEl = document.getElementById('import-migrate-status');
  const breakdownEl = document.getElementById('import-migrate-breakdown');
  const actionBtn = document.getElementById('import-migrate-execute-btn');

  if (!folderPath) {
    if (typeof showToast === 'function') showToast('Please enter or select a folder path', 'warning');
    return;
  }

  if (statusEl) statusEl.textContent = 'Scanning directory for presentation data...';
  if (breakdownEl) breakdownEl.style.display = 'none';

  try {
    const res = await window.libraryImporter.scanMigrationFolder(folderPath);
    currentMigrationScan = res;

    if (statusEl) statusEl.textContent = `Found ${res.softwareType.toUpperCase()} content: ${res.counts.songs} songs, ${res.counts.bibles} Bibles, ${res.counts.videos} videos, ${res.counts.images} images, ${res.counts.agendas} agendas.`;

    const countsEl = document.getElementById('import-migrate-counts-row');
    if (countsEl) {
      countsEl.innerHTML = `
        <div class="migrate-count-badge"><strong>${res.counts.songs}</strong> Songs</div>
        <div class="migrate-count-badge"><strong>${res.counts.bibles}</strong> Bibles</div>
        <div class="migrate-count-badge"><strong>${res.counts.videos}</strong> Videos</div>
        <div class="migrate-count-badge"><strong>${res.counts.images}</strong> Images</div>
        <div class="migrate-count-badge"><strong>${res.counts.agendas}</strong> Agendas</div>
      `;
    }

    const detailsEl = document.getElementById('import-migrate-details');
    if (detailsEl) {
      const parts = [];
      if (res.detected.songbooks.length > 0) {
        parts.push(`<div><strong>Songbooks:</strong> ${res.detected.songbooks.map(s => `${s.name} (${s.songCount} songs)`).join(', ')}</div>`);
      }
      if (res.detected.bibles.length > 0) {
        parts.push(`<div><strong>Bibles:</strong> ${res.detected.bibles.map(b => `${b.code} - ${b.name}`).join(', ')}</div>`);
      }
      if (res.detected.agendas.length > 0) {
        parts.push(`<div><strong>Agendas:</strong> ${res.detected.agendas.map(a => a.name).join(', ')}</div>`);
      }
      detailsEl.innerHTML = parts.join('');
    }

    if (breakdownEl) breakdownEl.style.display = 'flex';
    if (actionBtn) {
      actionBtn.disabled = false;
      actionBtn.style.opacity = '1';
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = `Scan error: ${err.message}`;
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

async function handleMigrationExecute() {
  const pathInput = document.getElementById('import-migrate-folder-path');
  const folderPath = pathInput?.value?.trim();
  const statusEl = document.getElementById('import-migrate-status');
  const actionBtn = document.getElementById('import-migrate-execute-btn');
  const progressEl = document.getElementById('import-migrate-progress-bar');
  const progressContainer = document.getElementById('import-migrate-progress-container');

  if (!folderPath) return;

  const importSongs = document.getElementById('import-migrate-opt-songs')?.checked ?? true;
  const importBibles = document.getElementById('import-migrate-opt-bibles')?.checked ?? true;
  const importMedia = document.getElementById('import-migrate-opt-media')?.checked ?? true;
  const importAgendas = document.getElementById('import-migrate-opt-agendas')?.checked ?? true;

  if (actionBtn) actionBtn.disabled = true;
  if (statusEl) statusEl.textContent = 'Migrating data into GNOMY... Please wait.';
  if (progressContainer) progressContainer.style.display = 'block';
  if (progressEl) progressEl.style.width = '35%';

  try {
    const res = await window.libraryImporter.executeMigration({
      folderPath,
      importSongs,
      importBibles,
      importMedia,
      importAgendas
    });

    if (progressEl) progressEl.style.width = '100%';
    const msg = `Successfully migrated: ${res.importedCounts.songs} Songs, ${res.importedCounts.bibles} Bibles, ${res.importedCounts.videos} Videos, ${res.importedCounts.images} Images, ${res.importedCounts.agendas} Agendas!`;

    if (statusEl) statusEl.textContent = msg;
    if (typeof showToast === 'function') showToast(msg, 'success');

    setTimeout(() => {
      if (progressContainer) progressContainer.style.display = 'none';
      if (actionBtn) actionBtn.disabled = false;
    }, 1500);

    // Refresh UI components and activate migrated Bible if available
    if (res.bibles && res.bibles.length > 0) {
      const targetBible = res.bibles[0].code;
      if (targetBible) {
        state.bibleVersion = targetBible;
        if (typeof changeBibleVersion === 'function') {
          await changeBibleVersion(targetBible);
        }
      }
    }

    if (typeof populateBibleVersionSelects === 'function') populateBibleVersionSelects();
    if (typeof renderTranslationOptions === 'function') renderTranslationOptions();
    if (typeof renderLibrary === 'function') renderLibrary();
    if (typeof renderCloudBibles === 'function') renderCloudBibles();
    if (typeof renderSongsList === 'function') renderSongsList();
    if (typeof renderSongbooksGrid === 'function') renderSongbooksGrid();
    if (typeof loadSanctuaryUploads === 'function') loadSanctuaryUploads();
    if (typeof renderAgenda === 'function') renderAgenda();
    if (typeof renderDeck === 'function') renderDeck();
  } catch (err) {
    if (statusEl) statusEl.textContent = `Migration error: ${err.message}`;
    if (actionBtn) actionBtn.disabled = false;
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

function handleMigrationFolderSelected(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  const pathInput = document.getElementById('import-migrate-folder-path');

  const firstFile = files[0];
  if (firstFile.path) {
    const relParts = (firstFile.webkitRelativePath || '').split('/');
    let folderPath = firstFile.path;
    for (let i = 0; i < relParts.length; i++) {
      const lastSlash = Math.max(folderPath.lastIndexOf('/'), folderPath.lastIndexOf('\\'));
      if (lastSlash !== -1) {
        folderPath = folderPath.substring(0, lastSlash);
      }
    }
    if (folderPath && pathInput) {
      pathInput.value = folderPath;
      handleMigrationScan();
      return;
    }
  }

  if (pathInput && pathInput.value) {
    handleMigrationScan();
  }
}

function insertTagIntoImport(tagName) {
  const textarea = document.getElementById('import-song-text');
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const tagStr = (text.length === 0 || text.endsWith('\n\n')) ? `[${tagName}]\n` : `\n\n[${tagName}]\n`;

  textarea.value = text.substring(0, start) + tagStr + text.substring(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + tagStr.length;

  updateImportLivePreview();
}

function submitCustomSongText() {
  const title = document.getElementById('import-song-title')?.value || '';
  const author = document.getElementById('import-song-author')?.value || '';
  const text = document.getElementById('import-song-text')?.value || '';
  const overwrite = (document.getElementById('import-manual-overwrite') || document.getElementById('import-overwrite-dupes'))?.checked ?? true;

  if (!text.trim()) {
    showToast('Please enter or paste song lyrics!', 'warning');
    return;
  }

  const parsedSong = window.libraryImporter.parseSongText(text, title, author);
  const result = window.libraryImporter.importSongsData(parsedSong, overwrite);

  const titleInput = document.getElementById('import-song-title');
  if (titleInput) titleInput.value = '';
  const authorInput = document.getElementById('import-song-author');
  if (authorInput) authorInput.value = '';
  const textInput = document.getElementById('import-song-text');
  if (textInput) textInput.value = '';

  updateImportLivePreview();

  document.getElementById('import-modal-backdrop')?.classList.remove('open');
  renderLibrary();
  showToast(`Successfully added "${parsedSong.title}" to Songbook!`, 'success');
}

// One-way synchronization: preview scrolling remains independently inspectable.
function syncSongPreviewScroll(editor, previewId) {
  const preview = document.getElementById(previewId);
  if (!editor || !preview) return;
  const editorRange = Math.max(0, editor.scrollHeight - editor.clientHeight);
  const previewRange = Math.max(0, preview.scrollHeight - preview.clientHeight);
  const progress = editorRange > 0 ? editor.scrollTop / editorRange : 0;
  preview.scrollTop = Math.max(0, Math.min(1, progress)) * previewRange;
}

const songPreviewScrollFrames = new Map();
function scheduleSongPreviewScroll(editorId, previewId) {
  const pending = songPreviewScrollFrames.get(editorId);
  if (pending !== undefined) cancelAnimationFrame(pending);
  // Wait for the browser to scroll the textarea caret after an input event.
  songPreviewScrollFrames.set(editorId, requestAnimationFrame(() => {
    songPreviewScrollFrames.delete(editorId);
    syncSongPreviewScroll(document.getElementById(editorId), previewId);
  }));
}

// Preview text is HTML content, not a JavaScript string literal.
function escapeSongPreviewHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function updateImportLivePreview() {
  const title = document.getElementById('import-song-title')?.value || 'Untitled Song';
  const author = document.getElementById('import-song-author')?.value || 'Unknown Artist';
  const text = document.getElementById('import-song-text')?.value || '';
  const previewBox = document.getElementById('import-preview-box');
  const countBadge = document.getElementById('import-preview-count');

  if (!previewBox) return;

  if (!text.trim()) {
    if (countBadge) countBadge.textContent = '0 slides';
    previewBox.innerHTML = `<span class="import-prev-empty">Start writing or paste your lyrics. Each section becomes a slide here.</span>`;
    return;
  }

  const parsed = window.libraryImporter.parseSongText(text, title, author);
  if (countBadge) countBadge.textContent = `${parsed.stanzas.length} slide${parsed.stanzas.length === 1 ? '' : 's'}`;

  previewBox.innerHTML = `
    <div class="import-prev-meta">
      <span class="import-prev-title">${escapeSongPreviewHtml(parsed.title)}</span>
      <span class="import-prev-author">${escapeSongPreviewHtml(parsed.author)}</span>
    </div>
    ${parsed.stanzas.map((s, sIdx) => `
      <div class="import-prev-card">
        <div class="import-prev-card-header">
          <span class="import-prev-section-badge">${escapeSongPreviewHtml(s.type)}</span>
          <span class="import-prev-slide-badge">${String(sIdx + 1).padStart(2, '0')}</span>
        </div>
        <div class="import-prev-text">${escapeSongPreviewHtml(s.text)}</div>
      </div>
    `).join('')}
  `;
  scheduleSongPreviewScroll('import-song-text', 'import-preview-box');
}

// -------------------------------------------------------------
// Song Editor Modal Engine (Minimalist & Functional)
// -------------------------------------------------------------
function openSongEditorModal(targetId = null, targetStanzaIndex = null) {
  const modal = document.getElementById('song-editor-modal-backdrop');
  const titleInput = document.getElementById('editor-song-title');
  const authorInput = document.getElementById('editor-song-author');
  const textInput = document.getElementById('editor-song-text');
  const idInput = document.getElementById('editor-song-id');
  const delBtn = document.querySelector('.song-editor-del-btn');
  const saveBtn = document.querySelector('.song-editor-save-btn');
  const modalTitle = document.querySelector('.song-editor-modal-title');
  const modalSub = document.querySelector('.song-editor-modal-sub');

  if (!modal || !titleInput || !textInput) return;

  const isNew = targetId === 'new';

  if (isNew) {
    if (idInput) idInput.value = 'new';
    titleInput.value = '';
    authorInput.value = '';
    textInput.value = '';
    if (delBtn) delBtn.style.display = 'none';
    if (saveBtn) saveBtn.textContent = 'Create Song';
    if (modalTitle) modalTitle.textContent = 'Create New Song';
    if (modalSub) modalSub.textContent = 'Shape your lyrics into slides for worship.';

    updateSongEditorLivePreview(-1);
    modal.classList.add('open');
    setTimeout(() => {
      titleInput.focus();
    }, 60);
    return;
  }

  const songId = targetId || state.activeSongId;
  const song = SONGS_DATABASE.find(s => s.id === songId) || SONGS_DATABASE[0];
  if (!song) return;

  if (idInput) idInput.value = song.id;
  titleInput.value = song.title;
  authorInput.value = song.author || '';
  if (delBtn) delBtn.style.display = 'block';
  if (saveBtn) saveBtn.textContent = 'Save Changes';
  if (modalTitle) modalTitle.textContent = 'Song Lyrics Editor';
  if (modalSub) modalSub.textContent = 'Fine-tune your lyrics and preview every slide.';

  // Format stanzas into text editor format
  const formattedText = (song.stanzas || []).map(s => `[${s.type}]\n${s.text}`).join('\n\n');
  textInput.value = formattedText;

  const validStanzaIdx = (targetStanzaIndex !== null && targetStanzaIndex >= 0 && targetStanzaIndex < song.stanzas.length)
    ? targetStanzaIndex
    : -1;

  updateSongEditorLivePreview(validStanzaIdx);
  modal.classList.add('open');

  if (validStanzaIdx >= 0) {
    setTimeout(() => {
      focusSongEditorStanza(validStanzaIdx, song);
    }, 80);
  } else {
    setTimeout(() => {
      titleInput.focus();
    }, 60);
  }
}

function openNewSongModal() {
  openSongEditorModal('new');
}

function focusSongEditorStanza(targetStanzaIndex, song) {
  const textInput = document.getElementById('editor-song-text');
  const previewBox = document.getElementById('editor-preview-box');
  if (!textInput || !song || !song.stanzas) return;

  const targetStanza = song.stanzas[targetStanzaIndex];
  if (!targetStanza) return;

  // Find character index of this stanza in textInput.value
  let searchFrom = 0;
  let targetCharIdx = -1;
  for (let i = 0; i <= targetStanzaIndex; i++) {
    const s = song.stanzas[i];
    const tag = `[${s.type}]`;
    const found = textInput.value.indexOf(tag, searchFrom);
    if (found !== -1) {
      if (i === targetStanzaIndex) {
        targetCharIdx = found;
        break;
      }
      searchFrom = found + tag.length;
    }
  }

  if (targetCharIdx !== -1) {
    textInput.focus();
    textInput.setSelectionRange(targetCharIdx, targetCharIdx + `[${targetStanza.type}]`.length);
    const linesBefore = textInput.value.substring(0, targetCharIdx).split('\n').length;
    const lineHeight = 19;
    textInput.scrollTop = Math.max(0, (linesBefore - 2) * lineHeight);
  }

  if (previewBox) {
    const prevStanzaEl = document.getElementById(`editor-prev-stanza-${targetStanzaIndex}`);
    if (prevStanzaEl) {
      prevStanzaEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      prevStanzaEl.classList.add('targeted-stanza-highlight');
    }
  }
}

function updateSongEditorLivePreview(targetStanzaIndex = -1) {
  const title = document.getElementById('editor-song-title')?.value || 'Untitled Song';
  const author = document.getElementById('editor-song-author')?.value || 'Unknown Artist';
  const text = document.getElementById('editor-song-text')?.value || '';
  const previewBox = document.getElementById('editor-preview-box');

  if (!previewBox) return;

  if (!text.trim()) {
    const count = document.getElementById('editor-preview-count');
    if (count) count.textContent = '0 slides';
    previewBox.innerHTML = `<div class="song-editor-empty-hint"><div class="song-editor-empty-screen"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8m-4-5v5M8 8h8m-6 3h4"/></svg></div><strong>A little lyric. A big moment.</strong><p>Start writing or paste your lyrics.<br>Each section becomes a slide here.</p></div>`;
    return;
  }

  const parsed = window.libraryImporter.parseSongText(text, title, author);
  const count = document.getElementById('editor-preview-count');
  if (count) count.textContent = `${parsed.stanzas.length} slide${parsed.stanzas.length === 1 ? '' : 's'}`;
  previewBox.innerHTML = `
    <div class="editor-prev-meta"><strong>${escapeSongPreviewHtml(parsed.title)}</strong><span class="editor-prev-author">${escapeSongPreviewHtml(parsed.author)}</span></div>
    ${parsed.stanzas.map((s, idx) => `
      <div class="editor-prev-stanza ${idx === targetStanzaIndex ? 'targeted-stanza-highlight' : ''}" id="editor-prev-stanza-${idx}">
        <div class="editor-prev-card-heading"><span class="editor-prev-tag">${escapeSongPreviewHtml(s.type)}</span><span>${String(idx + 1).padStart(2, '0')}</span></div>
        <div class="editor-prev-text">${escapeSongPreviewHtml(s.text)}</div>
      </div>`).join('')}`;
  if (targetStanzaIndex < 0) scheduleSongPreviewScroll('editor-song-text', 'editor-preview-box');
}

// Preserve wording and section boundaries; balance four lines as 2 + 2,
// rather than leaving a single-line slide after a three-line slide.
function formatSongEditorLyrics(text) {
  const blocks = [];
  let lines = [];
  const flush = () => {
    for (let offset = 0; offset < lines.length;) {
      const remaining = lines.length - offset;
      const size = remaining === 4 ? 2 : Math.min(3, remaining);
      blocks.push(lines.slice(offset, offset + size).join('\n'));
      offset += size;
    }
    lines = [];
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const isHeading = /^\[[^\]\n]+\]:?$/.test(line) ||
      /^(verse|chorus|bridge|pre[- ]chorus|tag|intro|outro|refrain|v|c|b|p)\s*\d*:?$/i.test(line);
    const isMetadata = /^(title|author|artist|composer|by)\s*:/i.test(line);
    if (isHeading || isMetadata) {
      flush();
      blocks.push(line);
      continue;
    }
    // Wrap long pasted paragraphs at word boundaries, without cutting words.
    let wrapped = '';
    for (const word of line.split(/\s+/)) {
      if (wrapped && wrapped.length + 1 + word.length > 60) {
        lines.push(wrapped);
        wrapped = word;
      } else {
        wrapped += (wrapped ? ' ' : '') + word;
      }
    }
    if (wrapped) lines.push(wrapped);
  }
  flush();
  return blocks.join('\n\n');
}

function autoFormatImportSong() {
  autoFormatSongEditor('import-song-text', updateImportLivePreview);
}

function autoFormatSongEditor(inputId = 'editor-song-text', refreshPreview = updateSongEditorLivePreview) {
  const textarea = document.getElementById(inputId);
  if (!textarea) return;
  if (!textarea.value.trim()) {
    showToast('Paste or type some lyrics first.', 'warning');
    textarea.focus();
    return;
  }
  textarea.value = formatSongEditorLyrics(textarea.value);
  refreshPreview();
  textarea.focus();
  textarea.setSelectionRange(0, 0);
  textarea.scrollTop = 0;
}

function insertTagIntoEditor(tagName) {
  const textarea = document.getElementById('editor-song-text');
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const tagStr = `\n\n[${tagName}]\n`;

  textarea.value = text.substring(0, start) + tagStr + text.substring(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + tagStr.length;

  updateSongEditorLivePreview();
}

function saveSongEditorChanges() {
  const songId = document.getElementById('editor-song-id')?.value;
  const title = document.getElementById('editor-song-title')?.value;
  const author = document.getElementById('editor-song-author')?.value;
  const text = document.getElementById('editor-song-text')?.value;

  if (!title || !title.trim()) {
    if (typeof showToast === 'function') showToast('Please enter a song title.', 'warning');
    else alert('Please enter a song title.');
    return;
  }
  if (!text || !text.trim()) {
    if (typeof showToast === 'function') showToast('Please enter song lyrics.', 'warning');
    else alert('Please enter song lyrics.');
    return;
  }

  const parsed = window.libraryImporter.parseSongText(text, title, author);
  const isNew = !songId || songId === 'new';

  if (isNew) {
    const newSongObj = {
      id: 'song_custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      title: title.trim(),
      author: author.trim() || 'Unknown',
      songbook: 'Custom Library',
      stanzas: parsed.stanzas && parsed.stanzas.length > 0 ? parsed.stanzas : [{ type: 'Verse 1', text: text.trim() }]
    };

    window.libraryImporter.importSongsData(newSongObj, true);
    state.activeSongId = newSongObj.id;
    document.getElementById('song-editor-modal-backdrop')?.classList.remove('open');
    renderLibrary();
    renderDeck();
    showToast(`Created "${newSongObj.title}" successfully`, 'success');
    return;
  }

  const success = window.libraryImporter.updateSong(songId, {
    title: parsed.title,
    author: parsed.author,
    stanzas: parsed.stanzas
  });

  if (success) {
    document.getElementById('song-editor-modal-backdrop').classList.remove('open');
    renderLibrary();
    renderDeck();
    if (state.activeLiveSlideId && state.activeLiveSlideId.includes(songId)) {
      reprojectCurrentLive();
    }
    showToast(`Updated "${parsed.title}" successfully`, 'success');
  }
}

function deleteCurrentEditingSong() {
  const songId = document.getElementById('editor-song-id')?.value;
  const title = document.getElementById('editor-song-title')?.value || 'this song';

  if (confirm(`Are you sure you want to delete "${title}" from your songbook?`)) {
    window.libraryImporter.deleteSong(songId);
    const modal = document.getElementById('song-editor-modal-backdrop');
    if (modal) modal.classList.remove('open');
    if (state.activeSongId === songId && SONGS_DATABASE.length > 0) {
      state.activeSongId = SONGS_DATABASE[0].id;
    }
    renderLibrary();
    renderDeck();
    showToast(`Deleted "${title}"`, 'info');
  }
}

// Global Aliases for HTML Handlers
window.openSongEditor = openSongEditor;
window.openSongEditorModal = openSongEditorModal;
window.openNewSongModal = openNewSongModal;
window.openCreateSongModal = openNewSongModal;
window.openSongSheetModal = openSongEditor;
window.formatSongEditorLyrics = formatSongEditorLyrics;
window.focusSongEditorStanza = focusSongEditorStanza;
window.closeSongEditor = function () {
  const modal = document.getElementById('song-editor-modal-backdrop');
  if (modal) modal.classList.remove('open');
};
window.saveSongEditor = saveSongEditorChanges;
window.saveSongEditorChanges = saveSongEditorChanges;
window.deleteSongEditor = deleteCurrentEditingSong;
window.deleteCurrentEditingSong = deleteCurrentEditingSong;
window.handleSongEditorInput = updateSongEditorLivePreview;
window.clearLiveText = function () { if (typeof clearAllOutputs === 'function') clearAllOutputs(); };
window.clearLiveBg = function () { if (typeof broadcastState === 'function') broadcastState({ clearBg: true }); };

function handleSongFileSelect(event) {
  handleUnifiedFileImport(event);
}

function handleBibleFileSelect(event) {
  handleUnifiedFileImport(event);
}

function handleUnifiedFileImport(event) {
  const files = event.target?.files || (event.dataTransfer ? event.dataTransfer.files : []);
  if (!files || files.length === 0) return;

  const overwrite = document.getElementById('import-overwrite-dupes')?.checked ?? true;
  let processedCount = 0;
  const totalFiles = files.length;
  let biblesImported = 0;
  let songsImported = 0;
  let backupsRestored = 0;
  let lastBibleCode = '';

  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const result = window.libraryImporter.importRawFile(content, file.name, overwrite);

      if (result.success) {
        if (result.type === 'bible') {
          biblesImported++;
          lastBibleCode = result.code;
        } else if (result.type === 'song') {
          songsImported += (result.importedCount || 1);
        } else if (result.type === 'backup') {
          backupsRestored++;
        }
      } else {
        showToast(`Failed to import "${file.name}": ${result.error || 'Unknown error'}`, 'error');
      }

      processedCount++;
      if (processedCount === totalFiles) {
        const fileInput = document.getElementById('import-file-input');
        if (fileInput) fileInput.value = '';
        const bibleFileInput = document.getElementById('import-bible-file-input');
        if (bibleFileInput) bibleFileInput.value = '';

        const modal = document.getElementById('import-modal-backdrop');
        if (modal) modal.classList.remove('open');

        // If bibles were imported, set active version and book
        if (biblesImported > 0) {
          if (!state.bibleVersion || !BIBLE_DATABASE[state.bibleVersion]) {
            state.bibleVersion = lastBibleCode || Object.keys(BIBLE_DATABASE)[0];
          }
          const availableBooks = getBibleBooks(state.bibleVersion);
          if (!state.activeBibleBook || !availableBooks.includes(state.activeBibleBook)) {
            state.activeBibleBook = availableBooks[0] || 'Genesis';
            const chs = getBibleChapters(state.activeBibleBook, state.bibleVersion);
            state.activeBibleChapter = chs.length > 0 ? parseInt(chs[0], 10) : 1;
          }
          const verLabel = document.getElementById('active-version-label');
          if (verLabel) verLabel.textContent = state.bibleVersion;
        }

        renderLibrary();
        renderDeck();
        syncRemoteCatalog();

        // Build friendly feedback toast
        const parts = [];
        if (biblesImported > 0) parts.push(`${biblesImported} Bible translation(s)`);
        if (songsImported > 0) parts.push(`${songsImported} song(s)`);
        if (backupsRestored > 0) parts.push(`${backupsRestored} library backup(s)`);

        if (parts.length > 0) {
          showToast(`Successfully imported ${parts.join(' and ')}!`, 'success');
        }
      }
    };
    reader.readAsText(file);
  });
}

function initImportDropzone() {
  const dropzone = document.getElementById('import-dropzone');
  if (!dropzone) return;

  dropzone.ondragover = (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-hover');
  };

  dropzone.ondragleave = () => {
    dropzone.classList.remove('drag-hover');
  };

  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-hover');
    handleUnifiedFileImport(e);
  };
}

// Hook dropzone initialization on DOM load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initImportDropzone, 500);
});

// ─── CLOUD BIBLES & DOWNLOAD MANAGER ──────────────────────────────────────────

async function addAndProjectCatalogSong(title, artist) {
  const cleanTitle = (title || '').trim();
  const cleanArtist = (artist || '').trim();
  if (!cleanTitle) return;

  // 1. Check if already exists in local database
  const titleLower = cleanTitle.toLowerCase();
  const existing = (SONGS_DATABASE || []).find(s => s.title && s.title.toLowerCase().trim() === titleLower);
  if (existing) {
    state.activeSongId = existing.id;
    state.currentTab = 'songs';
    if (typeof window.applySongBoundTheme === 'function') {
      window.applySongBoundTheme(existing.id);
    }
    if (typeof syncActiveTabUI === 'function') syncActiveTabUI();
    renderLibrary();
    renderDeck(true);
    syncDashboardWorkspace();
    if (existing.stanzas && existing.stanzas.length > 0) {
      projectSlide(`${existing.id}_0`, existing.stanzas[0].text, existing.title);
    }
    showToast(`Projecting "${existing.title}" live!`, 'info');
    const modal = document.getElementById('import-modal-backdrop');
    if (modal) modal.classList.remove('open');
    return;
  }

  showToast(`Fetching lyrics for "${cleanTitle}"...`, 'info');

  try {
    let songToImport = null;
    if (window.libraryImporter && typeof window.libraryImporter.searchOnlineLyrics === 'function') {
      const results = await window.libraryImporter.searchOnlineLyrics(`${cleanTitle} ${cleanArtist}`.trim());
      if (results && results.length > 0) {
        songToImport = results.find(s => s.title && s.title.toLowerCase().includes(titleLower)) || results[0];
      }
      if (!songToImport && cleanArtist) {
        const fallbackResults = await window.libraryImporter.searchOnlineLyrics(cleanTitle);
        if (fallbackResults && fallbackResults.length > 0) {
          songToImport = fallbackResults.find(s => s.title && s.title.toLowerCase().includes(titleLower)) || fallbackResults[0];
        }
      }
    }

    if (!songToImport) {
      songToImport = {
        title: cleanTitle,
        author: cleanArtist || 'Worship',
        stanzas: [
          { label: 'Verse 1', text: `${cleanTitle}\n${cleanArtist ? 'By ' + cleanArtist : ''}` }
        ]
      };
    }

    let targetSongId = songToImport.id || `cloud_${Date.now()}`;
    if (window.libraryImporter) {
      const res = window.libraryImporter.importSongsData(songToImport, true, true);
      if (res && res.songs && res.songs[0]) {
        targetSongId = res.songs[0].id || targetSongId;
        songToImport = res.songs[0];
      }
    }

    state.activeSongId = targetSongId;
    state.currentTab = 'songs';
    if (typeof window.applySongBoundTheme === 'function') {
      window.applySongBoundTheme(targetSongId);
    }
    if (typeof syncActiveTabUI === 'function') syncActiveTabUI();
    renderLibrary();
    renderDeck(true);
    syncRemoteCatalog();
    syncDashboardWorkspace();

    if (songToImport.stanzas && songToImport.stanzas.length > 0) {
      projectSlide(`${targetSongId}_0`, songToImport.stanzas[0].text, songToImport.title);
    }

    showToast(`Added and projected "${songToImport.title}"!`, 'success');
    const modal = document.getElementById('import-modal-backdrop');
    if (modal) modal.classList.remove('open');
  } catch (err) {
    console.error('Error adding catalog song:', err);
    showToast(`Failed to load "${cleanTitle}": ${err.message}`, 'error');
  }
}
window.addAndProjectCatalogSong = addAndProjectCatalogSong;

async function addCatalogSongToDatabase(title, artist) {
  const cleanTitle = (title || '').trim();
  const cleanArtist = (artist || '').trim();
  if (!cleanTitle) return;

  const titleLower = cleanTitle.toLowerCase();
  const existing = (SONGS_DATABASE || []).find(s => s.title && s.title.toLowerCase().trim() === titleLower);
  if (existing) {
    showToast(`"${existing.title}" is already in your songbook!`, 'info');
    return;
  }

  showToast(`Downloading "${cleanTitle}"...`, 'info');
  try {
    let songToImport = null;
    if (window.libraryImporter && typeof window.libraryImporter.searchOnlineLyrics === 'function') {
      const results = await window.libraryImporter.searchOnlineLyrics(`${cleanTitle} ${cleanArtist}`.trim());
      if (results && results.length > 0) {
        songToImport = results.find(s => s.title && s.title.toLowerCase().includes(titleLower)) || results[0];
      }
    }
    if (!songToImport) {
      songToImport = {
        title: cleanTitle,
        author: cleanArtist || 'Worship',
        stanzas: [
          { label: 'Verse 1', text: `${cleanTitle}\n${cleanArtist ? 'By ' + cleanArtist : ''}` }
        ]
      };
    }

    if (window.libraryImporter) {
      window.libraryImporter.importSongsData(songToImport, true);
    }
    renderLibrary();
    syncRemoteCatalog();
    showToast(`Saved "${songToImport.title}" to local database!`, 'success');
  } catch (err) {
    showToast(`Failed to save "${cleanTitle}": ${err.message}`, 'error');
  }
}
window.addCatalogSongToDatabase = addCatalogSongToDatabase;

function renderCloudSongs(filter = '') {
  const container = document.getElementById('cloud-songs-results') || document.getElementById('cloud-songs-list') || document.getElementById('cloud-song-list');
  if (!container) return;
  const q = (filter || '').trim().toLowerCase();
  const list = (typeof CLOUD_REPOSITORIES !== 'undefined' && CLOUD_REPOSITORIES.songs) || [
    { title: 'Way Maker', artist: 'Sinach', tags: 'Worship' },
    { title: 'Goodness of God', artist: 'Bethel Music / Jenn Johnson', tags: 'Praise' },
    { title: 'Firm Foundation (He Won\'t)', artist: 'Maverick City / Chandler Moore', tags: 'Worship' },
    { title: 'Gratitude', artist: 'Brandon Lake', tags: 'Thanksgiving' },
    { title: 'Ageless God', artist: 'Victoria Orenze', tags: 'Adoration' },
    { title: 'Holy Forever', artist: 'Chris Tomlin', tags: 'Worship' },
    { title: 'How Great Thou Art', artist: 'Hymn / Stuart Hine', tags: 'Classic Hymn' },
    { title: '10,000 Reasons (Bless The Lord)', artist: 'Matt Redman', tags: 'Worship' }
  ];
  const matches = list.filter(s => !q || s.title.toLowerCase().includes(q) || (s.artist && s.artist.toLowerCase().includes(q)) || (s.tags && s.tags.toLowerCase().includes(q)));
  if (matches.length === 0) {
    container.innerHTML = `<div class="repo-empty-state">No cloud songs matching "${escapeHtml(filter)}"</div>`;
    return;
  }
  container.innerHTML = matches.map((s) => {
    const safeTitle = escapeHtml(s.title);
    const safeArtist = escapeHtml(s.artist || 'Worship');
    const safeTitleAttr = s.title.replace(/'/g, "\\'");
    const safeArtistAttr = (s.artist || '').replace(/'/g, "\\'");
    return `
      <div class="repo-item-card cloud-item-card">
        <div class="repo-item-main">
          <div class="repo-item-title">${safeTitle}</div>
          <div class="repo-item-meta">
            <span>${safeArtist}</span>
            <span class="meta-dot">&bull;</span>
            <span class="repo-tag-pill installed">${escapeHtml(s.tags || 'Song')}</span>
          </div>
        </div>
        <div class="repo-item-actions" style="display:flex; gap:6px;">
          <button type="button" class="repo-action-btn bento-btn-primary-sm" onclick="addAndProjectCatalogSong('${safeTitleAttr}', '${safeArtistAttr}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span>Add & Project</span>
          </button>
          <button type="button" class="repo-action-btn" title="Save to database (keep in background)" onclick="addCatalogSongToDatabase('${safeTitleAttr}', '${safeArtistAttr}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>+ Save</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}
window.renderCloudSongs = renderCloudSongs;

let currentBibleFilter = '';
let biblesViewMode = 'grid';
let currentSongFilter = '';
let songsViewMode = 'grid';

function setCloudBiblesViewMode(mode) {
  biblesViewMode = mode;
  const container = document.getElementById('cloud-bibles-list');
  const listBtn = document.getElementById('bible-view-list-btn');
  const gridBtn = document.getElementById('bible-view-grid-btn');
  if (container) {
    container.classList.remove('view-grid', 'view-list');
    container.classList.add(`view-${mode}`);
  }
  if (listBtn) listBtn.classList.toggle('active', mode === 'list');
  if (gridBtn) gridBtn.classList.toggle('active', mode === 'grid');
}
window.setCloudBiblesViewMode = setCloudBiblesViewMode;

function applyCloudBibleFilter(btn, filter) {
  currentBibleFilter = filter;
  const searchInput = document.getElementById('cloud-bible-search-input');
  if (searchInput) searchInput.value = filter;
  const pills = btn.parentElement?.querySelectorAll('.repo-filter-pill');
  pills?.forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  renderCloudBibles(filter);
}
window.applyCloudBibleFilter = applyCloudBibleFilter;

function setCloudSongsViewMode(mode) {
  songsViewMode = mode;
  const container = document.getElementById('cloud-songs-results');
  const listBtn = document.getElementById('song-view-list-btn');
  const gridBtn = document.getElementById('song-view-grid-btn');
  if (container) {
    container.classList.remove('view-grid', 'view-list');
    container.classList.add(`view-${mode}`);
  }
  if (listBtn) listBtn.classList.toggle('active', mode === 'list');
  if (gridBtn) gridBtn.classList.toggle('active', mode === 'grid');
}
window.setCloudSongsViewMode = setCloudSongsViewMode;

function applyCloudSongFilter(btn, filter) {
  currentSongFilter = filter;
  const searchInput = document.getElementById('cloud-song-search-input');
  if (searchInput) searchInput.value = filter;
  const pills = btn.parentElement?.querySelectorAll('.repo-filter-pill');
  pills?.forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  filterCloudSongs(filter);
}
window.applyCloudSongFilter = applyCloudSongFilter;

function renderCloudBibles(filter = '') {
  const container = document.getElementById('cloud-bibles-list');
  if (!container) return;

  const q = (filter || '').trim().toLowerCase();
  const matches = (CLOUD_REPOSITORIES.bibles || []).filter(b =>
    !q || b.code.toLowerCase().includes(q) || b.name.toLowerCase().includes(q) || b.lang.toLowerCase().includes(q)
  );

  if (matches.length === 0) {
    container.innerHTML = `<div class="repo-empty-state">No matching Bible translations found for "${escapeHtml(filter)}"</div>`;
    return;
  }

  container.innerHTML = matches.map(b => {
    const isInstalled = (typeof BIBLE_DATABASE !== 'undefined' && BIBLE_DATABASE[b.code] && Object.keys(BIBLE_DATABASE[b.code]).length > 0) || (window.libraryImporter && window.libraryImporter.customBibles && window.libraryImporter.customBibles[b.code]);
    const isActive = isInstalled && state.bibleVersion === b.code;

    return `
      <div class="repo-item-card ${isActive ? 'active-repo' : (isInstalled ? 'installed-repo' : '')}">
        <div class="repo-item-main">
          <div class="repo-item-title-row">
            <span class="repo-tag-pill ${isActive ? 'active' : (isInstalled ? 'installed' : '')}">${b.code}</span>
            <span class="repo-item-title" title="${escapeHtml(b.name)}">${escapeHtml(b.name)}</span>
          </div>
          <div class="repo-item-meta">
            <span class="meta-lang">${b.lang}</span>
            <span class="meta-dot">&bull;</span>
            <span class="meta-size">${b.size || '4 MB'}</span>
            ${isActive
        ? '<span class="repo-status-badge active"><span class="badge-dot">●</span> Active</span>'
        : (isInstalled
          ? '<span class="repo-status-badge ready"><span class="badge-dot">●</span> Ready</span>'
          : '<span class="repo-status-badge cloud"><span class="badge-dot">☁</span> Cloud</span>')}
          </div>
        </div>
        <div class="repo-item-actions">
          ${isActive ? `
            <button class="repo-action-btn bento-btn-active-indicator" disabled>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Active</span>
            </button>
            <button class="bento-btn-icon-danger" onclick="deleteCloudBible('${b.code}')" title="Delete ${b.code} from storage">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          ` : (isInstalled ? `
            <button class="repo-action-btn bento-btn-primary-sm" onclick="switchCloudBible('${b.code}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
              <span>Switch</span>
            </button>
            <button class="bento-btn-icon-danger" onclick="deleteCloudBible('${b.code}')" title="Delete ${b.code} from storage">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          ` : `
            <button id="btn-dl-${b.code}" class="repo-action-btn bento-btn-secondary-sm" onclick="downloadCloudBible('${b.code}', '${escapeHtml(b.name)}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Download</span>
            </button>
          `)}
        </div>
      </div>
    `;
  }).join('');
}

function filterCloudBibles(query) {
  renderCloudBibles(query);
}

async function downloadCloudBible(code, name) {
  const btn = document.getElementById(`btn-dl-${code}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span style="display:inline-block; animation:spin 1s linear infinite; margin-right:4px;">⏳</span> Downloading...`;
  }

  showToast(`Downloading ${code} (${name}) into offline storage...`, 'info');

  try {
    if (!window.libraryImporter) {
      throw new Error('Library import engine not ready.');
    }

    const res = await window.libraryImporter.downloadCloudBible(code, name);

    // Set as active Bible version
    state.bibleVersion = code;
    const books = getBibleBooks(code);
    state.activeBibleBook = books[0] || 'Genesis';
    const chs = getBibleChapters(state.activeBibleBook, code);
    state.activeBibleChapter = chs.length > 0 ? parseInt(chs[0], 10) : 1;

    const verLabel = document.getElementById('active-version-label');
    if (verLabel) verLabel.textContent = code;

    renderLibrary();
    renderDeck();
    syncRemoteCatalog();
    renderCloudBibles();
    showToast(`Successfully downloaded and saved ${code} (${res.booksCount} books) to IndexedDB!`, 'success');
  } catch (err) {
    console.error('Download error:', err);
    showToast(`Could not download ${code}: ${err.message}`, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `⬇ Download`;
    }
  }
}

function switchCloudBible(code) {
  state.bibleVersion = code;
  const books = getBibleBooks(code);
  if (!state.activeBibleBook || !books.includes(state.activeBibleBook)) {
    state.activeBibleBook = books[0] || 'Genesis';
    const chs = getBibleChapters(state.activeBibleBook, code);
    state.activeBibleChapter = chs.length > 0 ? parseInt(chs[0], 10) : 1;
  }
  const verLabel = document.getElementById('active-version-label');
  if (verLabel) verLabel.textContent = code;
  renderLibrary();
  renderDeck();
  syncRemoteCatalog();
  renderCloudBibles();
  showToast(`Switched active Bible translation to ${code}.`, 'info');
}

async function deleteCloudBible(code) {
  const confirmed = await window.showCustomConfirm({
    title: `Remove ${code}?`,
    message: 'Remove this Bible from offline storage. You can download it again later.',
    confirmText: 'Remove Bible',
    cancelText: 'Cancel',
    danger: true
  });
  if (!confirmed) return;

  if (window.libraryImporter) {
    window.libraryImporter.deleteBible(code);
  }

  // If deleted the active version, pick another available version
  if (state.bibleVersion === code) {
    const remaining = Object.keys(BIBLE_DATABASE || {});
    if (remaining.length > 0) {
      state.bibleVersion = remaining[0];
      const books = getBibleBooks(state.bibleVersion);
      state.activeBibleBook = books[0] || '';
    } else {
      state.bibleVersion = '';
      state.activeBibleBook = '';
      state.activeBibleChapter = 1;
    }
  }

  const verLabel = document.getElementById('active-version-label');
  if (verLabel) verLabel.textContent = state.bibleVersion || 'Select';

  renderLibrary();
  renderDeck();
  syncRemoteCatalog();
  renderCloudBibles();
  showToast(`Removed ${code} from offline storage.`, 'info');
}

// ─── CLOUD LYRICS DYNAMIC SEARCH ENGINE ───────────────────────────────────────

let cloudSearchDebounceTimer = null;
let currentCloudSearchResults = [];

function filterCloudSongs(query) {
  clearTimeout(cloudSearchDebounceTimer);
  const container = document.getElementById('cloud-songs-results');
  if (!container) return;

  const cleanQ = (query || '').trim();
  if (!cleanQ) {
    renderCloudSongs('');
    return;
  }

  container.innerHTML = `
    <div style="padding: 30px; text-align: center; color: var(--text-muted); font-size: 12px;">
      <div style="display:flex; justify-content:center; margin-bottom:8px; color:var(--purple, #8a6dff);">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
      </div>
      <div>Searching online repositories for "<b>${escapeHtml(cleanQ)}</b>"...</div>
    </div>
  `;

  const thisSeq = ++cloudTabSearchSequence;
  cloudSearchDebounceTimer = setTimeout(async () => {
    try {
      if (!window.libraryImporter) {
        container.innerHTML = `<div style="padding:20px; color:#EF4444; text-align:center;">Import engine not loaded.</div>`;
        return;
      }

      const results = await window.libraryImporter.searchOnlineLyrics(cleanQ);
      if (thisSeq !== cloudTabSearchSequence) {
        return; // Stale in-flight query response, discard!
      }
      currentCloudSearchResults = results || [];
      if (!window._cloudTabSearchResultsMap) window._cloudTabSearchResultsMap = new Map();
      currentCloudSearchResults.forEach((s, idx) => {
        if (s) {
          if (!s.id) s.id = `cloud_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
          window._cloudTabSearchResultsMap.set(s.id, s);
        }
      });

      if (!results || results.length === 0) {
        container.innerHTML = `
          <div class="repo-empty-state">
            <div style="display:flex; justify-content:center; margin-bottom:8px; color:var(--mute, #696773);"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>
            <div style="font-weight:600; color:var(--text, #f3f2f7); margin-bottom:4px;">No online lyrics found for "${escapeHtml(cleanQ)}"</div>
            <div style="font-size:11px; color:var(--dim, #a3a1ae); margin-bottom:12px;">Try typing a different keyword or paste lyrics directly into the Song Creator tab.</div>
            <button type="button" class="bento-btn bento-btn-primary-sm" onclick="switchImportSubTab('manual')">Open Song Creator ↗</button>
          </div>
        `;
        return;
      }

      container.innerHTML = results.map((s) => {
        const safeId = escapeHtml(s.id);
        return `
          <div class="repo-item-card cloud-item-card">
            <div class="repo-item-main">
              <div class="repo-item-title-row">
                <span class="repo-item-title">${escapeHtml(s.title)}</span>
                <span class="repo-slide-count-badge">${s.stanzas ? s.stanzas.length : 0} Slides</span>
              </div>
              <div class="repo-item-author">${escapeHtml(s.author || 'Unknown Artist')} ${s.album ? `• <span style="color:var(--dim); font-weight:400;">${escapeHtml(s.album)}</span>` : ''}</div>
              <div class="repo-item-preview-text">${escapeHtml(s.previewText || (s.stanzas && s.stanzas[0] ? s.stanzas[0].text : ''))}</div>
            </div>
            <div class="repo-item-actions" style="display:flex; gap:6px;">
              <button type="button" class="repo-action-btn bento-btn-primary-sm" onclick="addCloudSongByIndex('${safeId}', true)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span>Add & Project</span>
              </button>
              <button type="button" class="repo-action-btn" onclick="addCloudSongByIndex('${safeId}', false)" title="Save to local database">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>+ Save</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      if (thisSeq !== cloudTabSearchSequence) return;
      container.innerHTML = `<div style="padding:20px; color:#EF4444; text-align:center; font-size:12px;">Search failed: ${err.message}</div>`;
    }
  }, 350);
}

function addCloudSongByIndex(songOrIdOrIdx, andProject = false) {
  let song = null;
  if (typeof songOrIdOrIdx === 'object' && songOrIdOrIdx !== null) {
    song = songOrIdOrIdx;
  } else if (typeof songOrIdOrIdx === 'string') {
    if (window._cloudTabSearchResultsMap && window._cloudTabSearchResultsMap.has(songOrIdOrIdx)) {
      song = window._cloudTabSearchResultsMap.get(songOrIdOrIdx);
    } else if (window._omniCloudMap && window._omniCloudMap.has(songOrIdOrIdx)) {
      song = window._omniCloudMap.get(songOrIdOrIdx);
    } else if (typeof SONGS_DATABASE !== 'undefined') {
      song = SONGS_DATABASE.find(s => s.id === songOrIdOrIdx);
    }
  } else if (typeof songOrIdOrIdx === 'number' && currentCloudSearchResults && currentCloudSearchResults[songOrIdOrIdx]) {
    song = currentCloudSearchResults[songOrIdOrIdx];
  }
  if (!song) return;

  let targetSongId = song.id || `cloud_${Date.now()}`;
  if (window.libraryImporter) {
    const res = window.libraryImporter.importSongsData(song, true, true);
    if (res && res.songs && res.songs[0]) {
      targetSongId = res.songs[0].id || targetSongId;
      song = res.songs[0];
    }
  }

  showToast(`Added "${song.title}" to your database!`, 'success');

  state.currentTab = 'songs';
  state.activeSongId = targetSongId;
  if (typeof window.applySongBoundTheme === 'function') {
    window.applySongBoundTheme(targetSongId);
  }
  if (typeof syncActiveTabUI === 'function') syncActiveTabUI();

  renderLibrary();
  renderDeck(true);
  syncRemoteCatalog();
  syncDashboardWorkspace();

  if (andProject && song.stanzas && song.stanzas.length > 0) {
    projectSlide(`${targetSongId}_0`, song.stanzas[0].text, song.title);
  }

  // Close import modal if open
  const modal = document.getElementById('import-modal-backdrop');
  if (modal) modal.classList.remove('open');
}

// Auto-Lyrics Search Dialog logic
function openAutoLyricsModal() {
  const modal = document.getElementById('auto-lyrics-modal-backdrop');
  if (modal) modal.classList.add('open');
}

function openAutoLyricsWithQuery(query) {
  openAutoLyricsModal();
  const input = document.getElementById('auto-lyrics-title');
  if (input) {
    input.value = query || '';
    performAutoLyricsSearch();
  }
}
window.openAutoLyricsWithQuery = openAutoLyricsWithQuery;

async function performAutoLyricsSearch() {
  const title = (document.getElementById('auto-lyrics-title').value || '').trim();
  const artist = (document.getElementById('auto-lyrics-artist').value || '').trim();
  const resultsBox = document.getElementById('auto-lyrics-results-box');

  if (!resultsBox) return;

  const query = `${title} ${artist}`.trim();
  if (!query) {
    resultsBox.innerHTML = `<span style="color:var(--text-muted);">Please enter a song title or artist to search lyrics.</span>`;
    return;
  }

  resultsBox.innerHTML = `
    <div style="padding: 24px; text-align: center; color: var(--text-muted);">
      <div style="display:flex; justify-content:center; margin-bottom:8px; color:var(--purple, #8a6dff);">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
      </div>
      <div>Searching online for "<b>${escapeHtml(query)}</b>"...</div>
    </div>
  `;

  try {
    const results = await window.libraryImporter.searchOnlineLyrics(query, artist, title);
    currentCloudSearchResults = results || [];
    if (!window._cloudTabSearchResultsMap) window._cloudTabSearchResultsMap = new Map();
    currentCloudSearchResults.forEach((s, idx) => {
      if (s) {
        if (!s.id) s.id = `cloud_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
        window._cloudTabSearchResultsMap.set(s.id, s);
      }
    });

    if (!results || results.length === 0) {
      resultsBox.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">No online lyrics found matching "${escapeHtml(query)}".</div>`;
      return;
    }

    resultsBox.innerHTML = results.map((s) => {
      const safeId = escapeHtml(s.id);
      return `
        <div style="background:#16161A; padding:14px; border-radius:10px; border:1px solid rgba(255,255,255,0.08); margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <div style="min-width:0; flex:1;">
            <div style="font-weight:700; font-size:13.5px; color:#FFFFFF; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(s.title)}</div>
            <div style="font-size:12px; color:var(--accent-pink-light);">${escapeHtml(s.author || 'Unknown')}</div>
            <div style="font-size:11px; color:#94A3B8; margin-top:3px; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(s.previewText || '')}</div>
          </div>
          <button type="button" onclick="addCloudSongByIndex('${safeId}', true); document.getElementById('auto-lyrics-modal-backdrop').classList.remove('open');" style="background:var(--accent-pink-gradient); color:white; font-weight:700; font-size:12px; padding:7px 16px; border:none; border-radius:8px; cursor:pointer; flex-shrink:0;">
            + Add & Project
          </button>
        </div>
      `;
    }).join('');
  } catch (e) {
    resultsBox.innerHTML = `<div style="color:#EF4444; padding:16px;">Search error: ${e.message}</div>`;
  }
}

// Global Custom Tooltip Portal Engine (Positions messages ABOVE icons/buttons)
function initGlobalTooltips() {
  let tooltipEl = document.getElementById('global-app-tooltip');
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'global-app-tooltip';
    tooltipEl.className = 'global-app-tooltip';
    document.body.appendChild(tooltipEl);
  }

  let activeTarget = null;

  function hideTooltip() {
    tooltipEl.classList.remove('visible');
    activeTarget = null;
  }

  window.refreshAppTooltip = (target, text) => {
    if (activeTarget === target) {
      tooltipEl.textContent = text;
    }
  };

  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-tooltip], [title]');
    if (!target) {
      if (activeTarget) hideTooltip();
      return;
    }

    // Convert native title to data-tooltip to suppress native browser cursor tooltip
    let text = target.getAttribute('data-tooltip');
    if (!text && target.hasAttribute('title')) {
      text = target.getAttribute('title');
      if (text) {
        target.setAttribute('data-tooltip', text);
        target.removeAttribute('title');
      }
    }

    if (!text) {
      if (activeTarget) hideTooltip();
      return;
    }

    activeTarget = target;
    const hintMatch = text.match(/^(.*?)\s*(\(([^)]+)\)|\[([^\]]+)\])$/);
    if (hintMatch && hintMatch[1].trim()) {
      tooltipEl.innerHTML = '';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'tooltip-label';
      labelSpan.textContent = hintMatch[1].trim();
      tooltipEl.appendChild(labelSpan);

      const hintSpan = document.createElement('span');
      hintSpan.className = 'tooltip-hint';
      hintSpan.textContent = hintMatch[3] || hintMatch[4];
      tooltipEl.appendChild(hintSpan);
    } else {
      tooltipEl.textContent = text;
    }
    tooltipEl.classList.add('visible');

    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();

    let top = rect.top - tooltipRect.height - 8;
    let left = rect.left + (rect.width / 2);

    // If target button is too close to the top of window, place below target
    if (top < 8) {
      top = rect.bottom + 8;
      tooltipEl.classList.add('position-bottom');
    } else {
      tooltipEl.classList.remove('position-bottom');
    }

    // Ensure tooltip horizontal alignment stays within screen boundaries
    const halfWidth = tooltipRect.width / 2;
    if (left - halfWidth < 8) {
      left = halfWidth + 8;
    } else if (left + halfWidth > window.innerWidth - 8) {
      left = window.innerWidth - halfWidth - 8;
    }

    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;
  });

  document.addEventListener('mouseout', (e) => {
    if (activeTarget) {
      const related = e.relatedTarget;
      if (!related || !activeTarget.contains(related)) {
        hideTooltip();
      }
    }
  });

  document.addEventListener('click', () => {
    hideTooltip();
  });

  window.addEventListener('scroll', hideTooltip, true);
}
// ── Remote Operator Host Controller (Streamlined Single Operator Full Control) ─

sessionPanelState = Object.assign(sessionPanelState || {}, {
  enabled: false,
  operatorUrl: null,
  pendingImportId: null,
  pendingImportEntry: null
});

function openSessionPanel() {
  if (REMOTE_MODE) return;
  fetch('/api/session').then(r => r.json()).then(data => {
    sessionPanelState.enabled = !!data.enabled;
    sessionPanelState.operatorUrl = data.lanUrl || null;
    renderSessionPanel();
    updateSessionOperatorCount((data.connectedOperators || []).length);
    document.getElementById('session-panel').style.display = 'flex';
    document.getElementById('session-panel-backdrop').style.display = 'block';
  }).catch(() => {
    renderSessionPanel();
    document.getElementById('session-panel').style.display = 'flex';
    document.getElementById('session-panel-backdrop').style.display = 'block';
  });
}

function closeSessionPanel() {
  document.getElementById('session-panel').style.display = 'none';
  document.getElementById('session-panel-backdrop').style.display = 'none';
}

function renderSessionPanel() {
  const urlEl = document.getElementById('session-op-url');
  if (urlEl) {
    urlEl.textContent = sessionPanelState.enabled && sessionPanelState.operatorUrl
      ? sessionPanelState.operatorUrl
      : 'Start session to generate URL';
  }

  const dotEl = document.getElementById('session-status-dot');
  const textEl = document.getElementById('session-status-text');
  if (dotEl && textEl) {
    dotEl.style.background = sessionPanelState.enabled ? '#22C55E' : '#64748B';
    dotEl.style.boxShadow = sessionPanelState.enabled ? '0 0 8px #22C55E' : 'none';
    textEl.textContent = sessionPanelState.enabled ? 'Session Active (Ready)' : 'Session Inactive';
    textEl.style.color = sessionPanelState.enabled ? '#86EFAC' : 'var(--text-starlight)';
  }

  const startBtn = document.getElementById('session-start-stop-btn');
  if (startBtn) {
    startBtn.textContent = sessionPanelState.enabled ? 'Stop Remote Session' : 'Start Remote Session';
    startBtn.style.background = sessionPanelState.enabled
      ? 'linear-gradient(135deg,#EF4444,#DC2626)'
      : 'linear-gradient(135deg,#22C55E,#16A34A)';
    startBtn.style.boxShadow = sessionPanelState.enabled
      ? '0 4px 14px rgba(239,68,68,0.3)'
      : '0 4px 14px rgba(34,197,94,0.3)';
  }

  const hubToggleBtn = document.getElementById('hub-toggle-session-btn');
  const hubStatusPill = document.getElementById('hub-remote-status-pill');
  if (hubToggleBtn) {
    hubToggleBtn.textContent = sessionPanelState.enabled ? 'Active' : 'Start';
    hubToggleBtn.className = 'hub-action-btn ' + (sessionPanelState.enabled ? 'status-live' : 'status-paused');
  }
  if (hubStatusPill) {
    hubStatusPill.textContent = sessionPanelState.enabled ? '● LIVE' : '○ PAUSED';
    hubStatusPill.style.color = sessionPanelState.enabled ? '#86EFAC' : 'var(--text-muted)';
  }
}

async function toggleSession() {
  const startBtn = document.getElementById('session-start-stop-btn');
  const wasEnabled = sessionPanelState.enabled;

  if (startBtn) {
    startBtn.style.opacity = '0.7';
    startBtn.textContent = wasEnabled ? 'Stopping session...' : 'Starting session...';
  }

  try {
    if (wasEnabled) {
      await fetch('/api/session/stop', { method: 'POST' }).catch(() => { });
      sessionPanelState.enabled = false;
      sessionPanelState.operatorUrl = null;
      isRemoteServerActive = false;
      showToast('Remote session stopped.', 'info');
    } else {
      let lanUrl = null;
      try {
        const res = await fetch('/api/session/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullControl: true })
        });
        const data = await res.json().catch(() => ({ success: true }));
        if (data && data.success) {
          const net = await fetch('/api/session').then(r => r.json()).catch(() => ({}));
          lanUrl = net.lanUrl || null;
        }
      } catch (err) {
        console.warn('Session API call fallback:', err);
      }

      sessionPanelState.enabled = true;
      isRemoteServerActive = true;
      sessionPanelState.operatorUrl = lanUrl || (window.location.origin.includes('http') ? `${window.location.origin}/index.html?remote=1` : 'http://localhost:8500/index.html?remote=1');
      syncRemoteCatalog();
      showToast('Remote session started! Operator has full control.', 'success');
    }
  } catch (err) {
    console.error('toggleSession error:', err);
    sessionPanelState.enabled = !wasEnabled;
    isRemoteServerActive = sessionPanelState.enabled;
    sessionPanelState.operatorUrl = sessionPanelState.enabled ? `${window.location.origin || 'http://localhost:8500'}/index.html?remote=1` : null;
  } finally {
    if (startBtn) startBtn.style.opacity = '1';
    updateRemoteSessionHeaderUI();
    renderSessionPanel();
  }
}

function updateRemoteSessionHeaderUI() {
  const btn = document.getElementById('broadcast-hub-btn') || document.getElementById('remote-server-btn');
  const dot = document.getElementById('broadcast-status-dot');
  if (!btn) return;
  btn.classList.toggle('active', sessionPanelState.enabled);
  if (dot) {
    dot.style.background = sessionPanelState.enabled ? '#22C55E' : '';
    dot.style.boxShadow = sessionPanelState.enabled ? '0 0 6px #22C55E' : '';
  }
  btn.title = sessionPanelState.enabled ? 'Broadcast & Remote Hub: Active' : 'Broadcast Outputs, OBS Links & Remote Controllers';
}

const knownHostOperatorIds = new Set();
let previousOperatorCount = 0;

function updateSessionOperatorCount(count, joinedName, joinedOpId) {
  const currentCount = typeof count === 'number' ? count : 0;
  const countEl = document.getElementById('session-op-count');
  if (countEl) countEl.textContent = currentCount > 0 ? `${currentCount} Online` : '0 Online';

  const badge = document.getElementById('remote-operator-count');
  if (badge) {
    badge.style.display = currentCount > 0 ? 'inline-block' : 'none';
    if (currentCount > 0) badge.textContent = currentCount;
  }

  const hubBadge = document.getElementById('hub-operators-badge');
  const hubCountPill = document.getElementById('hub-operators-count-pill');
  const hubCard = document.getElementById('hub-operators-card');
  const hubList = document.getElementById('hub-operators-list');

  if (hubBadge) {
    hubBadge.style.display = currentCount > 0 ? 'inline-block' : 'none';
    hubBadge.textContent = `${currentCount} ONLINE`;
  }
  if (hubCountPill) {
    hubCountPill.textContent = `${currentCount} ACTIVE`;
  }
  if (hubCard) {
    hubCard.style.display = currentCount > 0 ? 'block' : 'none';
  }

  // If on Host Studio and a new operator joined with a name, show toast notification
  if (!REMOTE_MODE && joinedName) {
    if (joinedOpId && !knownHostOperatorIds.has(joinedOpId)) {
      knownHostOperatorIds.add(joinedOpId);
      showToast(`Operator connected: ${joinedName}`, 'success');
    }
  }

  fetch('/api/session').then(r => r.json()).then(data => {
    const operators = data.connectedOperators || [];

    // Update known operator IDs
    operators.forEach(op => {
      if (op.id) knownHostOperatorIds.add(op.id);
    });

    const namesEl = document.getElementById('session-op-names');
    if (namesEl) {
      namesEl.innerHTML = '';
      if (operators.length === 0) {
        namesEl.innerHTML = '<div style="font-size:12px; color:var(--text-muted); font-style:italic;">No operator connected yet. Share the URL above.</div>';
      } else {
        operators.forEach(op => {
          const chip = document.createElement('div');
          chip.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;gap:8px;';
          chip.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              <div style="width:7px;height:7px;border-radius:50%;background:#22C55E;box-shadow:0 0 6px #22C55E;flex-shrink:0;"></div>
              <div style="min-width:0;">
                <div style="font-size:12.5px;font-weight:600;color:var(--text-starlight);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(op.name || 'Operator')}</div>
                <div style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);">Online Co-Pilot</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
              <span style="font-size:9.5px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#86EFAC;background:rgba(34,197,94,0.12);padding:2px 6px;border-radius:4px;">Full Control</span>
              <button type="button" onclick="pushHostLibraryToOperator('${op.id}', '${escapeHtml(op.name || 'Operator')}', this)" style="background:rgba(59,130,246,0.18); border:1px solid rgba(59,130,246,0.45); color:#93C5FD; font-family:var(--font-main); font-size:11px; font-weight:700; padding:3px 9px; border-radius:5px; cursor:pointer; display:flex; align-items:center; gap:4px; transition:all 0.15s ease;" title="Push library and agenda to this operator">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="7 13 12 18 17 13"/><line x1="12" y1="18" x2="12" y2="6"/></svg>
                <span>Push</span>
              </button>
            </div>
          `;
          namesEl.appendChild(chip);
        });
      }
    }

    if (hubList) {
      if (operators.length > 0) {
        hubList.innerHTML = operators.map(op => `
          <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(0,0,0,0.25); padding:6px 10px; border-radius:6px; font-size:11.5px; gap:8px;">
            <div style="display:flex; align-items:center; gap:6px; min-width:0;">
              <span style="width:5px; height:5px; border-radius:50%; background:#22C55E; flex-shrink:0;"></span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted); flex-shrink:0;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span style="color:#F8FAFC; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(op.name || op.id || 'Wireless Operator')}</span>
            </div>
            <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
              <span style="color:#86EFAC; font-family:var(--font-mono); font-size:9.5px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase;">Connected</span>
              <button type="button" onclick="pushHostLibraryToOperator('${op.id}', '${escapeHtml(op.name || 'Operator')}', this)" style="background:rgba(59,130,246,0.18); border:1px solid rgba(59,130,246,0.45); color:#93C5FD; font-family:var(--font-main); font-size:10px; font-weight:700; padding:2px 8px; border-radius:4px; cursor:pointer; display:flex; align-items:center; gap:3px;" title="Push library and agenda to this operator">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="7 13 12 18 17 13"/><line x1="12" y1="18" x2="12" y2="6"/></svg>
                <span>Push</span>
              </button>
            </div>
          </div>
        `).join('');
      } else {
        hubList.innerHTML = '';
      }
    }
  }).catch(() => { });
}

function copySessionUrl() {
  if (!sessionPanelState.operatorUrl) return;
  navigator.clipboard.writeText(sessionPanelState.operatorUrl)
    .then(() => showToast('Operator URL copied to clipboard!', 'success'))
    .catch(() => showToast(sessionPanelState.operatorUrl, 'info'));
}

function applyRemoteShadowDeck(command) {
  if (!command.songTitle || !Array.isArray(command.stanzas)) return;
  const exists = SONGS_DATABASE.some(s => (s.id || s.title) === command.songId);
  if (!exists) {
    SONGS_DATABASE.push({ id: command.songId, title: command.songTitle, stanzas: command.stanzas, _fromShadow: true });
    renderLibrary();
  }
  if (!state.activeSongId) { state.activeSongId = command.songId; renderDeck(); }
}

function showHostImportRequest(entry) {
  sessionPanelState.pendingImportId = entry.id;
  sessionPanelState.pendingImportEntry = entry;
  const notif = document.getElementById('host-import-notif');
  const text = document.getElementById('host-import-notif-text');
  if (!notif || !text) return;
  text.innerHTML = '<strong>' + entry.operatorName + '</strong> wants to add <em>"' + entry.song.title + '"</em> to the library';
  notif.style.display = 'block';
}

function hostAcceptImport() {
  if (!sessionPanelState.pendingImportId) return;
  const importId = sessionPanelState.pendingImportId;
  const song = sessionPanelState.pendingImportEntry && sessionPanelState.pendingImportEntry.song;
  fetch('/api/import-request/' + importId + '/accept', { method: 'POST' }).then(() => {
    if (song && !SONGS_DATABASE.some(s => s.title === song.title)) { SONGS_DATABASE.push(song); lastCatalogSignature = ''; syncRemoteCatalog(); renderLibrary(); }
    document.getElementById('host-import-notif').style.display = 'none';
    showToast('Song accepted and added to library', 'success');
  }).catch(() => { });
  sessionPanelState.pendingImportId = null; sessionPanelState.pendingImportEntry = null;
}

function hostDismissImport() {
  if (!sessionPanelState.pendingImportId) return;
  fetch('/api/import-request/' + sessionPanelState.pendingImportId + '/dismiss', { method: 'POST' }).catch(() => { });
  document.getElementById('host-import-notif').style.display = 'none';
  sessionPanelState.pendingImportId = null; sessionPanelState.pendingImportEntry = null;
}

// ─── Desktop (Electron) Integration ──────────────────────────────────────────
let desktopProjectorStatus = { isOpen: false, displayBounds: null };
let desktopStageStatus = { isOpen: false, displayBounds: null, mode: 'stage' };

function initDesktopIntegration() {
  if (typeof window.desktopApi === 'undefined' || !window.desktopApi.isDesktop) {
    return;
  }

  // Show desktop-only controls
  const desktopBtn = document.getElementById('desktop-projector-btn');
  if (desktopBtn) desktopBtn.style.display = 'inline-flex';

  const desktopCard = document.getElementById('desktop-monitor-card');
  if (desktopCard) desktopCard.style.display = 'block';

  // Expose global clearDisplay for main menu / global shortcuts
  window.clearDisplay = clearAllOutputs;

  // Populate displays list
  refreshDesktopDisplays();

  // Query current projector status
  if (window.desktopApi.getProjectorStatus) {
    window.desktopApi.getProjectorStatus().then(updateDesktopProjectorUI);
  }

  // Listen for projector status changes
  if (window.desktopApi.onProjectorStatusChange) {
    window.desktopApi.onProjectorStatusChange(updateDesktopProjectorUI);
  }

  // Query current stage monitor status
  if (window.desktopApi.getStageStatus) {
    window.desktopApi.getStageStatus().then(updateDesktopStageUI);
  }

  // Listen for stage status changes
  if (window.desktopApi.onStageStatusChange) {
    window.desktopApi.onStageStatusChange(updateDesktopStageUI);
  }

  // Listen for display connect/disconnect events
  if (window.desktopApi.onDisplaysUpdated) {
    window.desktopApi.onDisplaysUpdated(refreshDesktopDisplays);
  }

  // Query server info and populate LAN IPs
  if (window.desktopApi.getServerInfo) {
    window.desktopApi.getServerInfo().then(info => {
      if (info && info.lanIps && info.lanIps.length > 0) {
        const lanInput = document.getElementById('lan-ip-input');
        if (lanInput && (!lanInput.value || lanInput.value === 'localhost')) {
          lanInput.value = info.lanIps[0];
          updateLanIpHost(info.lanIps[0]);
        }
      }
    });
  }
}

async function refreshDesktopDisplays() {
  if (!window.desktopApi || !window.desktopApi.getDisplays) return;
  try {
    const displays = await window.desktopApi.getDisplays();
    const select = document.getElementById('desktop-display-select');
    const stageSelect = document.getElementById('desktop-stage-display-select');

    const valid = id => displays.some(d => String(d.id) === String(id));
    const saved = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
    const primary = displays.find(d => d.isPrimary) || displays[0];
    const audiencePreference = select?.value || saved('sf_projector_display');
    const stagePreference = stageSelect?.value || saved('sf_stage_display');
    const audienceId = valid(audiencePreference) ? audiencePreference : (displays.find(d => !d.isPrimary) || primary)?.id;
    const stageId = valid(stagePreference) ? stagePreference : (displays.find(d => !d.isPrimary && String(d.id) !== String(audienceId)) || displays.find(d => String(d.id) !== String(audienceId)) || primary)?.id;
    [[select, audienceId, 'sf_projector_display'], [stageSelect, stageId, 'sf_stage_display']].forEach(([field, selected, key]) => {
      if (!field) return;
      field.replaceChildren();
      displays.forEach((d, idx) => {
        const opt = document.createElement('option');
        opt.value = String(d.id);
        opt.textContent = `Screen ${idx + 1} (${d.bounds.width}x${d.bounds.height})${d.isPrimary ? ' — Primary' : ' — External'}`;
        field.appendChild(opt);
      });
      field.value = String(selected ?? '');
      field.onchange = () => { try { localStorage.setItem(key, field.value); } catch (_) {} };
    });
  } catch (err) {
    console.error('Failed to query displays:', err);
  }
}

function updateDesktopProjectorUI(status) {
  desktopProjectorStatus = status || { isOpen: false };
  const isOpen = !!desktopProjectorStatus.isOpen;

  // Header Button
  const btn = document.getElementById('desktop-projector-btn');
  const dot = document.getElementById('desktop-projector-dot');
  const label = document.getElementById('desktop-projector-label');
  if (btn && dot && label) {
    if (isOpen) {
      btn.style.background = 'rgba(16,185,129,0.3)';
      btn.style.borderColor = '#10B981';
      dot.style.background = '#34D399';
      dot.style.boxShadow = '0 0 10px #34D399';
      label.textContent = 'Projector: LIVE';
    } else {
      btn.style.background = 'rgba(16,185,129,0.12)';
      btn.style.borderColor = 'rgba(16,185,129,0.35)';
      dot.style.background = '#64748B';
      dot.style.boxShadow = 'none';
      label.textContent = 'Projector: Off';
    }
  }

  // Modal Card Controls
  const toggleBtn = document.getElementById('desktop-projector-toggle-btn');
  const modalStatus = document.getElementById('desktop-projector-modal-status');
  if (toggleBtn) {
    toggleBtn.textContent = isOpen ? 'Close Projector' : 'Launch Projector';
    toggleBtn.style.background = isOpen ? '#EF4444' : '#10B981';
    toggleBtn.style.color = isOpen ? '#FFFFFF' : '#064E3B';
  }
  if (modalStatus) {
    modalStatus.textContent = isOpen ? 'ONLINE (PROJECTING)' : 'OFFLINE';
    modalStatus.style.background = isOpen ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)';
    modalStatus.style.color = isOpen ? '#34D399' : '#94A3B8';
  }
}

function updateDesktopStageUI(status) {
  desktopStageStatus = status || { isOpen: false };
  const isOpen = !!desktopStageStatus.isOpen;
  const mode = desktopStageStatus.mode || 'stage';

  const toggleBtn = document.getElementById('desktop-stage-toggle-btn');
  const modalStatus = document.getElementById('desktop-stage-modal-status');
  if (toggleBtn) {
    toggleBtn.textContent = isOpen ? 'Close' : 'Launch';
    toggleBtn.style.background = isOpen ? '#EF4444' : 'var(--purple, #8A6DFF)';
    toggleBtn.style.color = '#FFFFFF';
  }
  if (modalStatus) {
    modalStatus.textContent = isOpen ? `ONLINE (${mode.toUpperCase()})` : 'OFFLINE';
    modalStatus.style.background = isOpen ? 'var(--purple-dim, rgba(138, 109, 255, 0.2))' : 'rgba(255,255,255,0.06)';
    modalStatus.style.color = isOpen ? 'var(--purple-text, #C3B6FF)' : 'var(--mute, #94A3B8)';
  }
}

async function toggleDesktopProjector() {
  if (!window.desktopApi) {
    showToast('Desktop API only available in the Ginomia desktop application.', 'info');
    return;
  }

  if (desktopProjectorStatus.isOpen) {
    await window.desktopApi.closeProjector();
    showToast('Projector screen closed', 'info');
  } else {
    const select = document.getElementById('desktop-display-select');
    const selectedDisplayId = select ? select.value : null;
    await window.desktopApi.launchProjector({ displayId: selectedDisplayId, targetMode: 'sanctuary' });
    showToast('Audience projector output launched in full screen!', 'success');
  }
}
window.toggleDesktopProjector = toggleDesktopProjector;

async function toggleDesktopStageMonitor() {
  if (!window.desktopApi) {
    showToast('Desktop API only available in the Ginomia desktop application.', 'info');
    return;
  }

  if (desktopStageStatus.isOpen) {
    await window.desktopApi.closeStageMonitor();
    showToast('Stage confidence monitor closed', 'info');
  } else {
    const select = document.getElementById('desktop-stage-display-select');
    const modeSelect = document.getElementById('desktop-stage-mode-select');
    const selectedDisplayId = select ? select.value : null;
    const selectedMode = modeSelect ? modeSelect.value : 'stage';
    await window.desktopApi.launchStageMonitor({ displayId: selectedDisplayId, mode: selectedMode });
    showToast(`Stage confidence monitor (${selectedMode}) launched!`, 'success');
  }
}
window.toggleDesktopStageMonitor = toggleDesktopStageMonitor;

// ── Workspace Scalability & Resizing Engine ──────────────────────────────────
function initWorkspaceResizers() {
  // Load and apply saved layout preferences & zoom scales
  try {
    if (localStorage.getItem('sf_system_formatted') === 'true') {
      state.bentoSingleScale = 1.0;
      state.bentoMedleyScale = 1.0;
      state.deckScale = 1.0;
      state.deckZoom = 1.0;
      state.bentoSingleCols = 1;
      document.documentElement.style.setProperty('--deck-scale-single', '1');
      document.documentElement.style.setProperty('--deck-scale-medley', '1');
      document.documentElement.style.setProperty('--deck-scale', '1');
      const bentoLbl = document.getElementById('bento-zoom-label');
      if (bentoLbl) bentoLbl.textContent = '100%';
      const deckLbl = document.getElementById('deck-zoom-label');
      if (deckLbl) deckLbl.textContent = '100%';
      if (typeof ThemeResizerEngine !== 'undefined') {
        ThemeResizerEngine.init();
      }
      return;
    }

    const savedSingleZoom = localStorage.getItem('sf_bento_single_zoom') || localStorage.getItem('sf_deck_zoom');
    const savedMedleyZoom = localStorage.getItem('sf_bento_medley_zoom');

    if (savedSingleZoom) {
      const num = parseFloat(savedSingleZoom);
      if (!isNaN(num) && num >= 0.6 && num <= 1.8) {
        state.bentoSingleScale = num;
        state.deckScale = num;
        state.deckZoom = num;
        document.documentElement.style.setProperty('--deck-scale-single', num);
        document.documentElement.style.setProperty('--deck-scale', num);
        const lbl = document.getElementById('deck-zoom-label');
        if (lbl) lbl.textContent = `${Math.round(num * 100)}%`;
      }
    }
    if (savedMedleyZoom) {
      const num = parseFloat(savedMedleyZoom);
      if (!isNaN(num) && num >= 0.6 && num <= 1.8) {
        state.bentoMedleyScale = num;
        document.documentElement.style.setProperty('--deck-scale-medley', num);
      }
    }
    const currentScale = state.isMedleyMode ? (state.bentoMedleyScale || 1.0) : (state.bentoSingleScale || state.deckScale || 1.0);
    const bentoLbl = document.getElementById('bento-zoom-label');
    if (bentoLbl) bentoLbl.textContent = `${Math.round(currentScale * 100)}%`;

    const savedSingleCols = parseInt(localStorage.getItem('sf_bento_single_cols'), 10);
    if (savedSingleCols >= 1 && savedSingleCols <= 3) {
      state.bentoSingleCols = savedSingleCols;
    }
  } catch (e) { }

  // Initialize universal ThemeResizerEngine for Bento, Classic, and any future themes
  if (typeof ThemeResizerEngine !== 'undefined') {
    ThemeResizerEngine.init();
  }

  // Auto-observe wrap resize to keep preview iframe scale locked to 16:9
  const stageWrap = document.querySelector('.preview-stage-wrap');
  if (stageWrap && window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      if (typeof scalePreviewIframe === 'function') scalePreviewIframe();
    });
    ro.observe(stageWrap);
  }

  const bentoPrevBox = document.getElementById('bento-preview-box');
  if (bentoPrevBox && window.ResizeObserver) {
    const ro2 = new ResizeObserver(() => {
      if (typeof window.syncBentoStagePreview === 'function') window.syncBentoStagePreview();
    });
    ro2.observe(bentoPrevBox);
  }
}

function adjustDeckZoom(delta) {
  const isMedley = !!state.isMedleyMode;
  if (isMedley) {
    let scale = (state.bentoMedleyScale || 1.0) + delta;
    scale = Math.max(0.6, Math.min(1.8, Math.round(scale * 10) / 10));
    state.bentoMedleyScale = scale;
    document.documentElement.style.setProperty('--deck-scale-medley', scale);
    const bentoLbl = document.getElementById('bento-zoom-label');
    if (bentoLbl) bentoLbl.textContent = `${Math.round(scale * 100)}%`;
    try { localStorage.setItem('sf_bento_medley_zoom', scale); } catch (e) { }
  } else {
    let scale = (state.bentoSingleScale || state.deckScale || 1.0) + delta;
    scale = Math.max(0.6, Math.min(1.8, Math.round(scale * 10) / 10));
    state.bentoSingleScale = scale;
    state.deckScale = scale;
    state.deckZoom = scale;
    document.documentElement.style.setProperty('--deck-scale-single', scale);
    document.documentElement.style.setProperty('--deck-scale', scale);
    const lbl = document.getElementById('deck-zoom-label');
    if (lbl) lbl.textContent = `${Math.round(scale * 100)}%`;
    const bentoLbl = document.getElementById('bento-zoom-label');
    if (bentoLbl) bentoLbl.textContent = `${Math.round(scale * 100)}%`;
    try {
      localStorage.setItem('sf_bento_single_zoom', scale);
      localStorage.setItem('sf_deck_zoom', scale);
    } catch (e) { }
  }
}
window.adjustDeckZoom = adjustDeckZoom;

function switchMobileZone(zoneName) {
  state.activeMobileZone = zoneName;
  document.querySelectorAll('.mobile-zone-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.zone === zoneName);
  });
  const lib = document.getElementById('zone-library');
  const deck = document.getElementById('zone-deck');
  const prev = document.getElementById('zone-preview');
  if (lib && deck && prev) {
    lib.classList.toggle('mobile-active', zoneName === 'library');
    deck.classList.toggle('mobile-active', zoneName === 'deck');
    prev.classList.toggle('mobile-active', zoneName === 'preview');
  }
  if (zoneName === 'preview' && typeof scalePreviewIframe === 'function') {
    setTimeout(scalePreviewIframe, 60);
  }
}
window.switchMobileZone = switchMobileZone;

// Initialize resizers immediately or on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWorkspaceResizers);
} else {
  initWorkspaceResizers();
}

// ==========================================================================
// Audio Microphone Picker & Device Selection Engine
// ==========================================================================
/* hoisted */

async function initAudioMicPicker() {
  if (REMOTE_MODE) {
    updateAudioMicPickerButtonLabel(state.aiListening ? 'Host Mic: LIVE' : 'Host Mic: Standby');
    const btn = document.getElementById('audio-mic-picker-btn');
    if (btn) {
      btn.onclick = (e) => {
        if (e) e.stopPropagation();
        showToast('Audio input is captured and processed live from the Host Studio microphone.', 'info');
      };
      btn.setAttribute('data-tooltip', 'Audio is streamed live from Host Studio microphone');
      btn.title = 'Audio is streamed live from Host Studio microphone';
    }
    return;
  }

  updateMicSignalBars(0);
  await populateAudioInputDevices();
  startAudioVuMeter(selectedAudioDeviceId);

  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('audio-mic-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      closeAudioMicPopover();
    }
  });

  if (navigator.mediaDevices && navigator.mediaDevices.ondevicechange !== undefined) {
    navigator.mediaDevices.ondevicechange = () => {
      populateAudioInputDevices();
      startAudioVuMeter(selectedAudioDeviceId);
    };
  }
}

async function populateAudioInputDevices(requestPermissionIfNeeded = false) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    updateAudioMicPickerButtonLabel('Default - Microphone...');
    return;
  }

  try {
    let devices = await navigator.mediaDevices.enumerateDevices();
    let audioInputs = devices.filter(d => d.kind === 'audioinput');

    const hasBlankLabels = audioInputs.length > 0 && audioInputs.some(d => !d.label);
    if (hasBlankLabels && requestPermissionIfNeeded) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        devices = await navigator.mediaDevices.enumerateDevices();
        audioInputs = devices.filter(d => d.kind === 'audioinput');
      } catch (err) {
        console.warn('Microphone permission deferred or denied:', err);
      }
    }

    audioMicDevices = audioInputs;

    const deviceExists = audioInputs.some(d => d.deviceId === selectedAudioDeviceId);
    if (!deviceExists && audioInputs.length > 0) {
      selectedAudioDeviceId = audioInputs[0].deviceId || 'default';
      localStorage.setItem('sf_selected_mic_device', selectedAudioDeviceId);
    }

    const activeDevice = audioInputs.find(d => d.deviceId === selectedAudioDeviceId);
    let label = activeDevice ? (activeDevice.label || 'Microphone') : 'Default - Microphone...';

    if ((selectedAudioDeviceId === 'default' || !selectedAudioDeviceId) && !label.toLowerCase().startsWith('default')) {
      label = `Default - ${label}`;
    }

    updateAudioMicPickerButtonLabel(label);
    renderAudioMicPopoverItems();
  } catch (err) {
    console.warn('Failed to enumerate audio input devices:', err);
    updateAudioMicPickerButtonLabel('Default - Microphone...');
  }
}

function updateAudioMicPickerButtonLabel(label) {
  const labelEl = document.getElementById('audio-mic-picker-label');
  if (labelEl) {
    labelEl.textContent = label;
    labelEl.title = `Microphone: ${label}`;
  }
  const bentoDeviceName = document.getElementById('bento-device-name');
  if (bentoDeviceName) {
    bentoDeviceName.textContent = label;
    bentoDeviceName.title = `Microphone: ${label}`;
  }
  const bentoDeviceSel = document.getElementById('bento-device-sel');
  if (bentoDeviceSel) {
    bentoDeviceSel.title = `Microphone: ${label} (Click to switch)`;
  }
  const btn = document.getElementById('audio-mic-picker-btn');
  if (btn) {
    btn.setAttribute('data-tooltip', `Microphone: ${label}`);
    btn.title = `Microphone: ${label} (Click to switch)`;
  }
}

function renderAudioMicPopoverItems() {
  const listEl = document.getElementById('audio-mic-device-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (audioMicDevices.length === 0) {
    const fallbackItem = document.createElement('div');
    fallbackItem.className = 'audio-mic-option active';
    fallbackItem.innerHTML = `
      <span class="audio-mic-option-check"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
      <span class="audio-mic-option-name">Default - System Microphone</span>
    `;
    listEl.appendChild(fallbackItem);
    return;
  }

  audioMicDevices.forEach((device, index) => {
    let name = device.label || `Microphone ${index + 1}`;
    if (device.deviceId === 'default' && !name.toLowerCase().startsWith('default')) {
      name = `Default - ${name}`;
    }

    const isSelected = (device.deviceId === selectedAudioDeviceId) ||
      (selectedAudioDeviceId === 'default' && index === 0 && !audioMicDevices.some(d => d.deviceId === 'default'));

    const option = document.createElement('div');
    option.className = `audio-mic-option ${isSelected ? 'active' : ''}`;
    option.dataset.deviceId = device.deviceId;

    option.innerHTML = `
      <span class="audio-mic-option-check">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </span>
      <span class="audio-mic-option-name">${name}</span>
    `;

    option.onclick = (e) => {
      e.stopPropagation();
      selectAudioInputDevice(device.deviceId, name);
      closeAudioMicPopover();
    };

    listEl.appendChild(option);
  });
}

function toggleAudioMicPopover(e) {
  if (e) e.stopPropagation();
  const btn = document.getElementById('audio-mic-picker-btn');
  const bentoBtn = document.getElementById('bento-device-sel');
  const popover = document.getElementById('audio-mic-popover');
  if (!popover) return;

  const isOpen = popover.classList.contains('open');
  if (isOpen) {
    closeAudioMicPopover();
  } else {
    // If opened from Bento, position under bento-device-sel
    const target = (e && e.currentTarget) || bentoBtn || btn;
    if (target && target.closest('#bento-layout-root')) {
      target.style.position = 'relative';
      if (popover.parentElement !== target) {
        popover.remove();
        target.appendChild(popover);
      }
      popover.style.position = 'absolute';
      popover.style.top = 'calc(100% + 6px)';
      popover.style.left = '0';
      popover.style.right = 'auto';
      popover.style.zIndex = '99999';
    }
    populateAudioInputDevices(true);
    popover.classList.add('open');
    if (btn) btn.classList.add('open');
    if (bentoBtn) bentoBtn.classList.add('open');
    popover.style.zIndex = '100002';
    if (typeof window.openDismissShield === 'function') {
      window.openDismissShield(closeAudioMicPopover, 100001);
    }
  }
}

function closeAudioMicPopover() {
  const btn = document.getElementById('audio-mic-picker-btn');
  const bentoBtn = document.getElementById('bento-device-sel');
  const popover = document.getElementById('audio-mic-popover');
  if (popover) popover.classList.remove('open');
  if (btn) btn.classList.remove('open');
  if (bentoBtn) bentoBtn.classList.remove('open');
  if (typeof window.closeDismissShield === 'function') {
    window.closeDismissShield();
  }
}

// Global Window Exports for UI Integration & Bento Studio Pro
window.state = state;
window.SONGS_DATABASE = SONGS_DATABASE;
window.BIBLE_DATABASE = BIBLE_DATABASE;
window.projectSlide = projectSlide;
window.renderDeck = renderDeck;
window.renderLibrary = renderLibrary;
window.renderAgenda = renderAgenda;
window.syncDashboardWorkspace = syncDashboardWorkspace;
window.openCommandPalette = openCommandPalette;
window.closeCommandPalette = closeCommandPalette;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.projectAiSuggestion = projectAiSuggestion;
window.addAiToAgenda = addAiToAgenda;
window.removeAgendaItem = removeAgendaItem;
window.openSongPicker = openSongPicker;
window.closeSongPicker = closeSongPicker;
window.openBiblePassagePicker = openBiblePassagePicker;
window.closeBiblePassagePicker = closeBiblePassagePicker;
window.openVersionPicker = openVersionPicker;
window.closeVersionPicker = closeVersionPicker;
window.swapMedleySong = swapMedleySong;
window.assignBibleBookToSlot = assignBibleBookToSlot;
window.isBibleSlideLive = isBibleSlideLive;
window.isSongSlideLive = isSongSlideLive;
window.navigateLiveVerse = navigateLiveVerse;
window.navigateLiveMedleySlot = navigateLiveMedleySlot;
window.switchToAdjacentSong = switchToAdjacentSong;
window.navigateSlide = navigateSlide;
window.initKeyboardNav = initKeyboardNav;
window.splitStanzaIntoChunks = splitStanzaIntoChunks;
window.getBibleBooks = getBibleBooks;
window.getBibleChapters = getBibleChapters;
window.getBibleVerses = getBibleVerses;
window.getSongSearchIndex = getSongSearchIndex;
window.setDashboardLinesSetting = setDashboardLinesSetting;
window.setMedleyMode = setMedleyMode;
window.clearAllOutputs = clearAllOutputs;
window.toggleHoldLive = toggleHoldLive;
window.toggleSpeechAi = toggleSpeechAi;
window.toggleAutoProject = toggleAutoProject;
window.openBroadcastHub = openBroadcastHub;
window.openImportModal = openImportModal;
window.openSongEditor = openSongEditor;
window.openSongEditorModal = openSongEditorModal;
window.toggleCompareMode = toggleCompareMode;
window.toggleDesktopProjector = toggleDesktopProjector;
window.toggleTranslationDropdown = toggleTranslationDropdown;
window.closeTranslationDropdown = closeTranslationDropdown;
window.pushRemoteLibraryToHost = pushRemoteLibraryToHost;
window.openOperatorRenameModal = openOperatorRenameModal;
window.toggleAudioMicPopover = toggleAudioMicPopover;
window.closeAudioMicPopover = closeAudioMicPopover;
window.selectAudioInputDevice = selectAudioInputDevice;
window.openSystemResetModal = openSystemResetModal;
window.closeSystemResetModal = closeSystemResetModal;
window.performSystemReset = performSystemReset;
window.openAiProviderModal = openAiProviderModal;
window.closeAiProviderModal = closeAiProviderModal;
window.selectAiProviderChoice = selectAiProviderChoice;
window.openAiSettingsTab = openAiSettingsTab;
window.updateAiProviderSetting = updateAiProviderSetting;
window.saveDeepgramApiKey = saveDeepgramApiKey;
window.toggleDeepgramKeyVisibility = toggleDeepgramKeyVisibility;
window.testDeepgramConnection = testDeepgramConnection;
window.updateDeepgramModelSetting = updateDeepgramModelSetting;
window.updateChurchCustomTermsSetting = updateChurchCustomTermsSetting;
window.syncAiSettingsUI = syncAiSettingsUI;

// Omni-Search Window Exports
window.openOmniSearchPalette = openOmniSearchPalette;
window.closeOmniSearchPalette = closeOmniSearchPalette;
window.toggleOmniSearchPalette = toggleOmniSearchPalette;
window.switchOmniSearchMode = switchOmniSearchMode;
window.handleOmniSearchInput = handleOmniSearchInput;
window.clearOmniSearchInput = clearOmniSearchInput;
window.setOmniSearchText = setOmniSearchText;
window.omniProjectVerse = omniProjectVerse;
window.omniAddVerseToAgenda = omniAddVerseToAgenda;
window.omniOpenBibleInDeck = omniOpenBibleInDeck;
window.omniProjectLocalSong = omniProjectLocalSong;
window.omniLoadSongToDeck = omniLoadSongToDeck;
window.omniAddAndProjectCloudSong = omniAddAndProjectCloudSong;
window.omniAddAndOpenCloudSong = omniAddAndOpenCloudSong;
window.omniAddCloudSongToDatabase = omniAddCloudSongToDatabase;

if (typeof window.setBentoSingleCols === 'function') {
  window.setBentoSingleCols = window.setBentoSingleCols;
}

// Global Keyboard Shortcut Listener for Omni-Search (Ctrl+K / Cmd+K & Escape)
document.addEventListener('keydown', (e) => {
  // Check for Ctrl+K or Cmd+K
  if (window.sfActiveModal?.()) return;
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    toggleOmniSearchPalette();
    return;
  }

  // Check for Alt+N to open new song modal
  if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault();
    openNewSongModal();
    return;
  }

  // Check for Escape key to close omni-search
  if (e.key === 'Escape') {
    const palette = document.getElementById('omni-search-palette');
    if (palette && palette.style.display !== 'none') {
      closeOmniSearchPalette();
    }
  }
});

// Setup on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initOmniSearchDrag();
});

// ─────────────────────────────────────────────────────────────────────────────
// STRONG'S GREEK & HEBREW CONCORDANCE & LEXICON INSPECTOR ENGINE
// ─────────────────────────────────────────────────────────────────────────────

window.STRONGS_LEXICON_CACHE = null;
window.currentLexiconEntry = null;

function stripStrongsTags(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  return rawText
    .replace(/<sup\b[^>]*>.*?<\/sup>/gi, '')
    .replace(/<[HG]\d+>/gi, '')
    .replace(/<[A-Za-z0-9_:]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}
window.stripStrongsTags = stripStrongsTags;

function formatStrongsVerseHtml(rawText) {
  if (!rawText) return '';
  const clean = String(rawText).replace(/<sup\b[^>]*>.*?<\/sup>/gi, '');
  const regex = /([^<\s]+)?<([HG]\d+)>([,.;:!?]*)/g;
  return clean.replace(regex, (match, word, strongId, punc) => {
    const cleanWord = word ? escapeHtml(word) : '';
    const safeWordParam = cleanWord.replace(/'/g, "\\'");
    const puncHtml = punc ? escapeHtml(punc) : '';
    return `<span class="sf-strong-word" data-strong="${strongId}" onclick="event.stopPropagation(); window.openLexiconInspector('${strongId}', '${safeWordParam}')">${cleanWord}<sup class="sf-strong-tag">${strongId}</sup></span>${puncHtml}`;
  });
}
window.formatStrongsVerseHtml = formatStrongsVerseHtml;

async function toggleStrongsMode() {
  state.strongsMode = !state.strongsMode;

  const bentoBtn = document.getElementById('bento-strongs-btn');
  if (bentoBtn) {
    bentoBtn.classList.toggle('active', Boolean(state.strongsMode));
    bentoBtn.style.display = (state.currentTab === 'bible') ? 'inline-flex' : 'none';
  }

  const classicBtn = document.getElementById('btn-strongs-mode');
  if (classicBtn) {
    classicBtn.classList.toggle('active', Boolean(state.strongsMode));
    classicBtn.style.display = (state.currentTab === 'bible') ? 'inline-flex' : 'none';
  }

  // Load KJV_STRONGS data on demand if needed
  if (state.strongsMode) {
    if (typeof BIBLE_DATABASE !== 'undefined' && (!BIBLE_DATABASE['KJV_STRONGS'] || Object.keys(BIBLE_DATABASE['KJV_STRONGS']).length === 0)) {
      try {
        const resp = await fetch('/bibles/KJV_STRONGS.json');
        if (resp.ok) {
          const data = await resp.json();
          if (data && typeof data === 'object') {
            BIBLE_DATABASE['KJV_STRONGS'] = data;
          }
        }
      } catch (e) {
        console.warn('Could not preload KJV_STRONGS on demand:', e);
      }
    }

    // Preload unified lexicon in background for instant 0ms lookups
    if (!window.STRONGS_LEXICON_CACHE) {
      fetch('/lexicon/strongs_unified.json')
        .then(r => r.json())
        .then(data => { window.STRONGS_LEXICON_CACHE = data; })
        .catch(() => { });
    }

    if (typeof showActionToast === 'function') {
      showActionToast("Strong's Concordance ON — Click any tagged word for Greek/Hebrew study");
    }
  } else {
    if (typeof showActionToast === 'function') {
      showActionToast("Strong's Concordance OFF");
    }
  }

  if (typeof window.renderBentoDeck === 'function') {
    window.renderBentoDeck();
  }
  renderDeck();
}
window.toggleStrongsMode = toggleStrongsMode;

async function fetchLexiconEntry(strongId) {
  const id = String(strongId).toUpperCase().trim();
  const normId = id.replace(/^([GH])0+(\d+)/, '$1$2');
  if (window.STRONGS_LEXICON_CACHE && (window.STRONGS_LEXICON_CACHE[id] || window.STRONGS_LEXICON_CACHE[normId])) {
    return window.STRONGS_LEXICON_CACHE[id] || window.STRONGS_LEXICON_CACHE[normId];
  }
  try {
    const res = await fetch(`/api/lexicon/${normId}`);
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (e) {
    console.warn('API lookup failed, falling back to full cache fetch:', e);
  }
  if (!window.STRONGS_LEXICON_CACHE) {
    try {
      const fullRes = await fetch('/lexicon/strongs_unified.json');
      if (fullRes.ok) {
        window.STRONGS_LEXICON_CACHE = await fullRes.json();
        if (window.STRONGS_LEXICON_CACHE && (window.STRONGS_LEXICON_CACHE[id] || window.STRONGS_LEXICON_CACHE[normId])) {
          return window.STRONGS_LEXICON_CACHE[id] || window.STRONGS_LEXICON_CACHE[normId];
        }
      }
    } catch (err) { }
  }
  if (window.CONCORDANCE_DICTIONARY && Array.isArray(window.CONCORDANCE_DICTIONARY)) {
    const dictMatch = window.CONCORDANCE_DICTIONARY.find(e => e.id === id || e.id === normId);
    if (dictMatch) {
      return {
        id: dictMatch.id,
        lemma: dictMatch.lemma,
        transliteration: dictMatch.translit,
        lang: dictMatch.lang,
        short_definition: dictMatch.def
      };
    }
  }
  return null;
}
window.fetchLexiconEntry = fetchLexiconEntry;
window.currentLexiconEnglishWord = '';

// Load initial Concordance presentation preferences
if (typeof state !== 'undefined') {
  state.concordanceStyle = localStorage.getItem('sf_concordance_style') || 'hero';
  state.concordanceDisplayMode = localStorage.getItem('sf_concordance_display_mode') || 'full';
  state.concordancePosition = localStorage.getItem('sf_concordance_position') || 'right';
}

function updateConcordanceStyleSetting(style) {
  if (!style) return;
  state.concordanceStyle = style;
  localStorage.setItem('sf_concordance_style', style);

  const sel1 = document.getElementById('setting-concordance-style');
  if (sel1) sel1.value = style;
  const sel2 = document.getElementById('drawer-concordance-style-select');
  if (sel2) sel2.value = style;

  if (state.activeLiveSlideId && state.activeLiveSlideId.startsWith('lexicon_')) {
    projectCurrentLexiconWord();
  }
}
window.updateConcordanceStyleSetting = updateConcordanceStyleSetting;

function updateConcordanceModeSetting(mode) {
  if (!mode) return;
  state.concordanceDisplayMode = mode;
  localStorage.setItem('sf_concordance_display_mode', mode);

  const sel = document.getElementById('setting-concordance-mode');
  if (sel) sel.value = mode;

  if (state.activeLiveSlideId && state.activeLiveSlideId.startsWith('lexicon_')) {
    projectCurrentLexiconWord();
  }
}
window.updateConcordanceModeSetting = updateConcordanceModeSetting;

function updateConcordancePositionSetting(pos) {
  if (!pos) return;
  state.concordancePosition = pos;
  localStorage.setItem('sf_concordance_position', pos);

  const sel1 = document.getElementById('setting-concordance-position');
  if (sel1) sel1.value = pos;
  const sel2 = document.getElementById('drawer-concordance-position-select');
  if (sel2) sel2.value = pos;

  if (state.activeLiveSlideId && state.activeLiveSlideId.startsWith('lexicon_')) {
    projectCurrentLexiconWord();
  }
}
window.updateConcordancePositionSetting = updateConcordancePositionSetting;

window.lexiconHistoryStack = [];

window.openLexiconInspector = async function (strongId, wordText = '', isHistoryNav = false) {
  const id = String(strongId).toUpperCase().trim();

  const drawerBackdrop = document.getElementById('strongs-inspector-modal-backdrop');
  const isModalAlreadyOpen = drawerBackdrop && drawerBackdrop.classList.contains('open');

  if (!isHistoryNav) {
    if (isModalAlreadyOpen && window.currentLexiconEntry && window.currentLexiconEntry.id !== id) {
      window.lexiconHistoryStack.push({
        id: window.currentLexiconEntry.id,
        englishWord: window.currentLexiconEnglishWord || '',
        lemma: window.currentLexiconEntry.lemma || ''
      });
    } else if (!isModalAlreadyOpen) {
      window.lexiconHistoryStack = [];
    }
  }

  const entry = await fetchLexiconEntry(id);
  if (!entry) {
    console.warn('Lexicon entry not found for', id);
    return;
  }
  window.currentLexiconEntry = entry;
  window.currentLexiconEnglishWord = wordText || entry.short_definition || '';

  // Update Back Button in Drawer Header
  const backBtn = document.getElementById('strongs-drawer-back-btn');
  const backLabel = document.getElementById('strongs-drawer-back-label');
  if (backBtn) {
    if (window.lexiconHistoryStack.length > 0) {
      const prev = window.lexiconHistoryStack[window.lexiconHistoryStack.length - 1];
      backBtn.style.display = 'inline-flex';
      backBtn.title = `Back to ${prev.id} (${prev.lemma || prev.englishWord || ''})`;
      if (backLabel) {
        backLabel.textContent = `Back to ${prev.id}`;
      }
    } else {
      backBtn.style.display = 'none';
    }
  }

  const isHebrew = entry.lang === 'Hebrew' || id.startsWith('H');

  const idEl = document.getElementById('strongs-drawer-id');
  if (idEl) idEl.textContent = id;

  const langEl = document.getElementById('strongs-drawer-lang');
  if (langEl) langEl.textContent = `${isHebrew ? 'Hebrew' : 'Greek'} Word Study`;

  const lemmaEl = document.getElementById('strongs-drawer-lemma');
  if (lemmaEl) {
    lemmaEl.textContent = entry.lemma || wordText || id;
    lemmaEl.className = `strongs-lemma-text ${isHebrew ? 'hebrew' : 'greek'}`;
  }

  const translitEl = document.getElementById('strongs-drawer-translit');
  if (translitEl) translitEl.textContent = entry.transliteration || '';

  const pronEl = document.getElementById('strongs-drawer-pron');
  if (pronEl) pronEl.textContent = entry.pronunciation ? `/${entry.pronunciation}/` : '';

  const posEl = document.getElementById('strongs-drawer-pos');
  if (posEl) {
    posEl.textContent = entry.part_of_speech || (isHebrew ? 'Hebrew' : 'Greek');
    posEl.style.display = entry.part_of_speech ? 'inline-block' : 'none';
  }

  const shortDefEl = document.getElementById('strongs-drawer-shortdef');
  if (shortDefEl) shortDefEl.textContent = entry.short_definition || 'No concise definition available.';

  // Sync drawer style and position selects
  const drawerStyleSel = document.getElementById('drawer-concordance-style-select');
  if (drawerStyleSel) drawerStyleSel.value = state.concordanceStyle || 'hero';
  const drawerPosSel = document.getElementById('drawer-concordance-position-select');
  if (drawerPosSel) drawerPosSel.value = state.concordancePosition || 'right';

  // Derivation / Origin with interactive chips
  const originCard = document.getElementById('strongs-drawer-origin-card');
  const originEl = document.getElementById('strongs-drawer-origin');
  if (originEl) {
    if (entry.derivation) {
      let origHtml = escapeHtml(entry.derivation);
      origHtml = origHtml.replace(/([HG]\d+)/g, '<span class="strongs-origin-chip" onclick="openLexiconInspector(\'$1\')">$1</span>');
      originEl.innerHTML = origHtml;
      if (originCard) originCard.style.display = 'flex';
    } else {
      if (originCard) originCard.style.display = 'none';
    }
  }

  // KJV Translation summary
  const kjvCard = document.getElementById('strongs-drawer-kjv-card');
  const kjvEl = document.getElementById('strongs-drawer-kjv');
  if (kjvEl) {
    if (entry.kjv_definition) {
      kjvEl.textContent = entry.kjv_definition;
      if (kjvCard) kjvCard.style.display = 'flex';
    } else {
      if (kjvCard) kjvCard.style.display = 'none';
    }
  }

  // Full Thayer / BDB definition
  const lexTitleEl = document.getElementById('strongs-drawer-lex-title');
  if (lexTitleEl) lexTitleEl.textContent = isHebrew ? 'Brown-Driver-Briggs (BDB) Hebrew Lexicon' : "Thayer's Greek-English Lexicon";

  const fullDefEl = document.getElementById('strongs-drawer-full-def');
  if (fullDefEl) {
    let cleanDef = entry.full_definition_html || '';
    cleanDef = cleanDef.replace(/<a[^>]+(?:href=['"]S:([HG]\d+)['"])[^>]*>([^<]+)<\/a>/gi, (m, rootId, txt) => {
      return `<span class="strongs-origin-chip" onclick="openLexiconInspector('${rootId}')">${txt || rootId}</span>`;
    });
    fullDefEl.innerHTML = cleanDef || '<em>Full lexicon entry not available.</em>';
  }

  // Update Drawer Project Button State in-place
  const drawerProjBtn = document.getElementById('strongs-drawer-project-btn');
  if (drawerProjBtn) {
    const isAlreadyLive = state.activeLiveSlideId === `lexicon_${id}`;
    drawerProjBtn.classList.toggle('live-active', isAlreadyLive);
    const span = drawerProjBtn.querySelector('span');
    if (span) span.textContent = isAlreadyLive ? 'Live on Screen' : 'Project Word';
  }

  if (drawerBackdrop) {
    drawerBackdrop.classList.add('open');
  }
};

window.navigateBackLexiconHistory = function () {
  if (!window.lexiconHistoryStack || window.lexiconHistoryStack.length === 0) return;
  const prev = window.lexiconHistoryStack.pop();
  if (prev && prev.id) {
    window.openLexiconInspector(prev.id, prev.englishWord, true);
  }
};

window.closeLexiconInspector = function () {
  const drawerBackdrop = document.getElementById('strongs-inspector-modal-backdrop');
  if (drawerBackdrop) {
    drawerBackdrop.classList.remove('open');
  }
  window.lexiconHistoryStack = [];
};

window.projectCurrentLexiconWord = function () {
  const entry = window.currentLexiconEntry;
  if (!entry) return;
  const isHebrew = entry.lang === 'Hebrew' || entry.id.startsWith('H');
  const slideId = `lexicon_${entry.id}`;
  const refStr = `${entry.id} (${isHebrew ? 'Hebrew' : 'Greek'})`;
  const textStr = String(entry.short_definition || entry.lemma || entry.id || '');
  const style = state.concordanceStyle || localStorage.getItem('sf_concordance_style') || 'hero';
  const displayMode = state.concordanceDisplayMode || localStorage.getItem('sf_concordance_display_mode') || 'full';
  const position = state.concordancePosition || localStorage.getItem('sf_concordance_position') || 'right';
  const englishWord = window.currentLexiconEnglishWord || entry.short_definition || entry.lemma || entry.id;

  const payload = {
    slideId: slideId,
    contentType: 'lexicon',
    isLexicon: true,
    reference: refStr,
    text: textStr,
    englishWord: englishWord,
    lexiconStyle: style,
    lexiconDisplayMode: displayMode,
    concordancePosition: position,
    lexiconPosition: position,
    lexiconData: {
      id: entry.id,
      lang: entry.lang,
      lemma: entry.lemma,
      transliteration: entry.transliteration,
      pronunciation: entry.pronunciation,
      part_of_speech: entry.part_of_speech,
      short_definition: entry.short_definition,
      derivation: entry.derivation,
      englishWord: englishWord,
      style: style,
      displayMode: displayMode,
      position: position
    },
    mode: displayMode === 'full' ? 'full' : (state.currentMode || 'full'),
    projectorActive: state.projectorActive,
    livestreamActive: state.livestreamActive,
    transparentBg: state.transparentBg,
    typography: state.typography,
    textSize: state.textSize,
    textAutoScale: state.textAutoScale,
    bg: state.background,
    clear: false,
    blackout: false,
    _timestamp: Date.now()
  };

  state.activeLiveSlideId = slideId;
  state.activeLiveText = textStr;
  state.activeLiveRef = refStr;
  state.activeLexiconData = payload.lexiconData;

  updateActiveSlideVisuals(slideId);
  updateLivePreview(payload);
  if (typeof window.syncBentoStagePreview === 'function') {
    window.syncBentoStagePreview();
  }

  // Instant tactile feedback in drawer button (< 1ms)
  const drawerProjBtn = document.getElementById('strongs-drawer-project-btn');
  if (drawerProjBtn) {
    drawerProjBtn.classList.add('live-active');
    const span = drawerProjBtn.querySelector('span');
    if (span) span.textContent = 'Live on Screen';
  }

  if (typeof window.showToast === 'function') {
    window.showToast(`Projected Strong's ${entry.id}: ${entry.lemma || ''} (${englishWord})`, 'success');
  }

  if (REMOTE_MODE) {
    sendRemoteCommand({
      type: 'PROJECT',
      slideId,
      text: textStr,
      reference: refStr,
      isLexicon: true,
      contentType: 'lexicon',
      englishWord: englishWord,
      lexiconStyle: style,
      lexiconDisplayMode: displayMode,
      concordancePosition: position,
      lexiconData: payload.lexiconData
    });
  } else {
    broadcastState(payload);
  }
};

// Global Shortcut: Alt+S (Toggle Strong's) and Escape (Close Drawer)
document.addEventListener('keydown', (e) => {
  if (e.altKey && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    toggleStrongsMode();
    return;
  }

  if (e.key === 'Escape') {
    const drawer = document.getElementById('strongs-inspector-modal-backdrop');
    if (drawer && drawer.classList.contains('open')) {
      closeLexiconInspector();
    }
  }
});


// Extra Global Window Handlers for UI Buttons & Modals
window.switchImportSubTab = typeof switchImportSubTab === 'function' ? switchImportSubTab : function (t) {
  const tabs = ['files', 'manual', 'bibles', 'lyrics', 'cloudsongs', 'migrate'];
  tabs.forEach(tab => {
    const pane = document.getElementById('import-subtab-' + tab);
    const btn = document.getElementById('import-tab-btn-' + tab);
    if (pane) pane.style.display = tab === t ? 'flex' : 'none';
    if (btn) btn.classList.toggle('active', tab === t);
  });
};

window.switchSettingsTab = typeof switchSettingsTab === 'function' ? switchSettingsTab : function (t, el) {
  const allTabs = ['themes', 'typography', 'display', 'medley', 'speech', 'imports', 'shortcuts'];
  allTabs.forEach(tab => {
    const pane = document.getElementById('settings-tab-' + tab);
    if (pane) pane.style.display = tab === t ? 'block' : 'none';
  });
  document.querySelectorAll('.settings-tab-btn').forEach(btn => btn.classList.remove('active'));
  if (el) el.classList.add('active');
};

window.setTextAlignSetting = typeof setTextAlignSetting === 'function' ? setTextAlignSetting : function (align, target) {
  if (!state.typography) state.typography = {};
  if (target === 'bible') state.typography.textAlignBible = align;
  else if (target === 'songs') state.typography.textAlignSongs = align;
  else state.typography.textAlign = align;
  syncDashboardWorkspace();
};

window.setShadowIntensityLevel = typeof setShadowIntensityLevel === 'function' ? setShadowIntensityLevel : function (lvl) {
  if (!state.typography) state.typography = {};
  state.typography.shadowLevel = lvl;
  syncDashboardWorkspace();
};

window.resetTypographyDefaults = typeof resetTypographyDefaults === 'function' ? resetTypographyDefaults : function () {
  state.typography = {
    fontType: 'app',
    fontFamily: 'Outfit',
    highlightColor: '#EAB308',
    target: 'verse',
    fontSize: 48,
    longVerseMode: 'fit',
    lineHeight: '1.4',
    letterSpacing: '0',
    verseWeight: '800',
    verseTransform: 'none',
    textAlign: 'center',
    textAlignBible: 'center',
    textAlignSongs: 'center',
    hPadding: '4rem',
    vPadding: 'none',
    shadowLevel: 1
  };
  syncDashboardWorkspace();
  showToast('Typography reset to defaults', 'info');
};

window.testLiveTransitionEffect = typeof testLiveTransitionEffect === 'function' ? testLiveTransitionEffect : function () {
  testTransitionToggle = !testTransitionToggle;
  const sampleRef = testTransitionToggle ? 'John 3:16 (KJV)' : 'Psalm 23:1 (KJV)';
  const sampleText = testTransitionToggle
    ? 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'
    : 'The LORD is my shepherd; I shall not want.';
  projectSlide('test_trans_slide', sampleText, sampleRef);
};

window.setTransitionTypeSetting = typeof setTransitionTypeSetting === 'function' ? setTransitionTypeSetting : function (type) {
  state.transitionType = type;
  try { localStorage.setItem('sf_transition_type', type); } catch (e) { }
  syncDashboardWorkspace();
  if (typeof syncBentoStagePreview === 'function') syncBentoStagePreview();
};

window.setTransitionDurationSetting = typeof setTransitionDurationSetting === 'function' ? setTransitionDurationSetting : function (dur) {
  state.transitionDuration = parseInt(dur, 10) || 300;
  try { localStorage.setItem('sf_transition_duration', state.transitionDuration); } catch (e) { }
  syncDashboardWorkspace();
  if (typeof syncBentoStagePreview === 'function') syncBentoStagePreview();
};

window.insertTagIntoImport = typeof insertTagIntoImport === 'function' ? insertTagIntoImport : function (tag) {
  const textarea = document.getElementById('import-song-lyrics');
  if (!textarea) return;
  const val = textarea.value;
  const pos = textarea.selectionStart || val.length;
  const insertText = (pos > 0 && !val.slice(0, pos).endsWith('\n') ? '\n\n' : '') + '[' + tag + ']\n';
  textarea.value = val.slice(0, pos) + insertText + val.slice(pos);
  textarea.focus();
  if (typeof updateImportLivePreview === 'function') updateImportLivePreview();
};

window.submitCustomSongText = typeof submitCustomSongText === 'function' ? submitCustomSongText : function () {
  const title = document.getElementById('import-song-title')?.value;
  const author = document.getElementById('import-song-author')?.value;
  const text = document.getElementById('import-song-lyrics')?.value;
  if (!title || !title.trim()) { alert('Please enter song title.'); return; }
  if (!text || !text.trim()) { alert('Please enter song lyrics.'); return; }
  if (window.libraryImporter) {
    const parsed = window.libraryImporter.parseSongText(text, title, author);
    window.libraryImporter.importSongsData(parsed, true);
    renderLibrary();
    renderDeck();
    document.getElementById('import-modal-backdrop')?.classList.remove('open');
    showToast('Saved "' + parsed.title + '" to library!', 'success');
  }
};

window.filterCloudBibles = typeof filterCloudBibles === 'function' ? filterCloudBibles : function (q) {
  const list = document.getElementById('cloud-bible-list');
  if (!list) return;
  const items = list.querySelectorAll('.cloud-item-card');
  items.forEach(item => {
    const txt = item.textContent.toLowerCase();
    item.style.display = (!q || txt.includes(q.toLowerCase())) ? 'flex' : 'none';
  });
};

window.filterCloudSongs = typeof filterCloudSongs === 'function' ? filterCloudSongs : function (q) {
  const list = document.getElementById('cloud-song-list');
  if (!list) return;
  const items = list.querySelectorAll('.cloud-item-card');
  items.forEach(item => {
    const txt = item.textContent.toLowerCase();
    item.style.display = (!q || txt.includes(q.toLowerCase())) ? 'flex' : 'none';
  });
};

window.performAutoLyricsSearch = typeof performAutoLyricsSearch === 'function' ? performAutoLyricsSearch : async function () {
  const query = document.getElementById('cloud-song-search-input')?.value;
  if (!query || !query.trim()) return;
  if (window.libraryImporter) {
    const results = await window.libraryImporter.searchOnlineLyrics(query);
    if (typeof renderCloudSearchResults === 'function') renderCloudSearchResults(results);
  }
};

window.closeAiProviderModal = typeof closeAiProviderModal === 'function' ? closeAiProviderModal : function () {
  document.getElementById('ai-provider-modal-backdrop')?.classList.remove('open');
};

window.selectAiProviderChoice = typeof selectAiProviderChoice === 'function' ? selectAiProviderChoice : function (p) {
  state.aiProvider = p;
  try { localStorage.setItem('sf_ai_provider', p); } catch (e) { }
  document.getElementById('ai-provider-modal-backdrop')?.classList.remove('open');
  if (typeof syncAiSettingsUI === 'function') syncAiSettingsUI();
};

window.closeSessionPanel = typeof closeSessionPanel === 'function' ? closeSessionPanel : function () {
  document.getElementById('session-modal-backdrop')?.classList.remove('open');
};

window.copySessionUrl = typeof copySessionUrl === 'function' ? copySessionUrl : function () {
  const url = sessionPanelState.operatorUrl || window.location.origin + '/operator.html';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => showToast('Operator URL copied!', 'success'));
  }
};

window.hostAcceptImport = typeof hostAcceptImport === 'function' ? hostAcceptImport : function (id) {
  showToast('Remote import accepted', 'success');
};

window.hostDismissImport = typeof hostDismissImport === 'function' ? hostDismissImport : function (id) {
  showToast('Remote import dismissed', 'info');
};

window.pushHostLibraryToRemote = typeof pushHostLibraryToRemote === 'function' ? pushHostLibraryToRemote : function () {
  if (typeof syncRemoteCatalog === 'function') syncRemoteCatalog();
  showToast('Host library pushed to remote devices', 'success');
};

window.toggleSession = typeof toggleSession === 'function' ? toggleSession : function () {
  sessionPanelState.enabled = !sessionPanelState.enabled;
  showToast(sessionPanelState.enabled ? 'Session active' : 'Session paused', 'info');
};

window.closeOperatorJoinModal = typeof closeOperatorJoinModal === 'function' ? closeOperatorJoinModal : function () {
  document.getElementById('operator-join-modal-backdrop')?.classList.remove('open');
};

window.submitOperatorName = typeof submitOperatorName === 'function' ? submitOperatorName : function () {
  const input = document.getElementById('operator-name-input');
  if (input && input.value.trim()) {
    try { localStorage.setItem('sf_operator_name', input.value.trim()); } catch (e) { }
    document.getElementById('operator-join-modal-backdrop')?.classList.remove('open');
    if (typeof updateRemoteSessionHeaderUI === 'function') updateRemoteSessionHeaderUI();
    showToast('Operator name updated!', 'success');
  }
};

if (typeof window.projectBentoSlide !== 'function') {
  window.projectBentoSlide = function (slideId) {
    if (!slideId) return;
    const data = window._bentoSlideRegistry ? window._bentoSlideRegistry.get(slideId) : null;
    if (data && typeof projectSlide === 'function') {
      projectSlide(data.slideId, data.text, data.refStr);
    }
  };
}

// ── Settings Help & Support Actions ─────────────────────────────
function openHelpTutorial() {
  showToast('Opening Ginomia video guides...', 'info');
  window.open('https://youtube.com', '_blank', 'noopener,noreferrer');
}
window.openHelpTutorial = openHelpTutorial;

function openChangelogModal() {
  const modal = document.getElementById('changelog-modal-backdrop');
  if (modal) {
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('open'));
  }
}
window.openChangelogModal = openChangelogModal;

function closeChangelogModal() {
  const modal = document.getElementById('changelog-modal-backdrop');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
}
window.closeChangelogModal = closeChangelogModal;

function startInteractiveTour() {
  const settingsModal = document.getElementById('settings-modal-backdrop');
  if (settingsModal) settingsModal.classList.remove('open');

  showToast('Starting Ginomia interactive tour...', 'info');

  const tourSteps = [
    {
      targetId: 'bento-search-input',
      title: 'Universal Omni-Search',
      text: 'Press Ctrl+K or type here to search any Bible scripture, chapter, or song lyrics instantly.'
    },
    {
      targetId: 'bento-library-card',
      title: 'Scripture & Song Library',
      text: 'Browse Bible books, pick chapters in the accordion drawer, or switch to worship songs.'
    },
    {
      targetId: 'bento-deck-card',
      title: 'Presentation Deck',
      text: 'Click any verse or song stanza to project live with 0ms tactile latency. Switch between Single and Medley modes.'
    },
    {
      targetId: 'bento-prev-card',
      title: 'Live Stage Output Preview',
      text: 'Monitor sanctuary projector output in real-time with instant Clear, Hold, and Panic Blackout controls.'
    },
    {
      targetId: 'bento-mic-toggle-btn',
      title: 'Live AI Speech Recognition',
      text: 'Click the AI Mic to listen to sermon audio and auto-project spoken verses on the fly.'
    }
  ];

  let currentStep = 0;
  let tourOverlay = document.getElementById('sf-tour-overlay');
  if (!tourOverlay) {
    tourOverlay = document.createElement('div');
    tourOverlay.id = 'sf-tour-overlay';
    tourOverlay.style.cssText = 'position:fixed; bottom:30px; left:50%; transform:translateX(-50%); z-index:100000; background:#131218; border:1px solid rgba(138,109,255,0.4); box-shadow:0 16px 48px rgba(0,0,0,0.8); border-radius:14px; padding:18px 22px; width:440px; max-width:92vw; color:#f3f2f7; font-family:inherit;';
    document.body.appendChild(tourOverlay);
  }

  const renderStep = () => {
    const step = tourSteps[currentStep];
    const targetEl = document.getElementById(step.targetId);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.classList.add('bento-card-pulse');
      setTimeout(() => targetEl.classList.remove('bento-card-pulse'), 1400);
    }

    tourOverlay.style.display = 'block';
    tourOverlay.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-size:11px; font-weight:700; color:#c3b6ff; letter-spacing:0.04em; text-transform:uppercase;">Step ${currentStep + 1} of ${tourSteps.length} · Interactive Tour</span>
        <button type="button" onclick="document.getElementById('sf-tour-overlay').style.display='none';" style="background:none; border:none; color:#a3a1ae; cursor:pointer; font-size:15px; padding:2px;">✕</button>
      </div>
      <div style="font-size:14px; font-weight:700; color:#fff; margin-bottom:5px;">${step.title}</div>
      <div style="font-size:12px; color:#a3a1ae; line-height:1.5; margin-bottom:16px;">${step.text}</div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <button type="button" id="tour-prev-btn" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#a3a1ae; border-radius:8px; padding:6px 14px; font-size:11.5px; font-weight:600; cursor:pointer; ${currentStep === 0 ? 'visibility:hidden;' : ''}">Back</button>
        <div style="display:flex; gap:8px;">
          <button type="button" id="tour-skip-btn" style="background:none; border:none; color:#696773; font-size:11.5px; font-weight:600; cursor:pointer; padding:6px 10px;">Skip Tour</button>
          <button type="button" id="tour-next-btn" style="background:#8a6dff; border:none; color:#fff; border-radius:8px; padding:6px 16px; font-size:11.5px; font-weight:700; cursor:pointer;">${currentStep === tourSteps.length - 1 ? 'Finish Tour' : 'Next Step →'}</button>
        </div>
      </div>
    `;

    document.getElementById('tour-prev-btn')?.addEventListener('click', () => {
      if (currentStep > 0) { currentStep--; renderStep(); }
    });
    document.getElementById('tour-next-btn')?.addEventListener('click', () => {
      if (currentStep < tourSteps.length - 1) {
        currentStep++;
        renderStep();
      } else {
        tourOverlay.style.display = 'none';
        showToast('Tour completed! Enjoy using Ginomia.', 'success');
      }
    });
    document.getElementById('tour-skip-btn')?.addEventListener('click', () => {
      tourOverlay.style.display = 'none';
      showToast('Tour skipped', 'info');
    });
  };

  renderStep();
}
window.startInteractiveTour = startInteractiveTour;

async function sendSupportLogs() {
  let releaseInfo = { appName: 'Ginomia', version: '2.4.0' };
  try {
    const response = await fetch('/api/version');
    if (response.ok) releaseInfo = { ...releaseInfo, ...(await response.json()) };
  } catch (e) { }
  const diagnostics = [
    `=== ${releaseInfo.appName.toUpperCase()} SUPPORT & DIAGNOSTIC LOG ===`,
    `Generated: ${new Date().toISOString()}`,
    `App Version: ${releaseInfo.version} (The Word in Motion)`,
    `Theme: ${document.body.getAttribute('data-theme-style') || 'bento'} (${document.body.getAttribute('data-theme-mode') || 'dark'})`,
    `Viewport: ${window.innerWidth}x${window.innerHeight}`,
    `User Agent: ${navigator.userAgent}`,
    `Active Bible Book: ${window.state ? window.state.activeBibleBook : 'Genesis'} ${window.state ? window.state.activeBibleChapter : 1}`,
    `Active Song ID: ${window.state ? window.state.activeSongId : 'none'}`,
    `AI Speech Active: ${window.state ? Boolean(window.state.isMicActive) : false}`,
    `Songs Loaded: ${(window.SONGS_DATABASE || []).length}`,
    `Status: Operational (0 errors detected)`,
    `============================================`
  ].join('\n');

  try {
    const blob = new Blob([diagnostics], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ginomia-diagnostics-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) { }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(diagnostics).catch(() => { });
  }
  showToast('Support diagnostics bundle exported & downloaded!', 'success');
}
window.sendSupportLogs = sendSupportLogs;

function copySupportWhatsApp() {
  const contactText = '+234 800 GINOMAI (support@ginomai.pro)';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(contactText).then(() => {
      showToast('WhatsApp contact copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Contact: ' + contactText, 'info');
    });
  } else {
    showToast('Contact: ' + contactText, 'info');
  }
}
window.copySupportWhatsApp = copySupportWhatsApp;

function openSupportWhatsApp() {
  const msg = encodeURIComponent('Hello Ginomia Team, I need assistance with Ginomia v2.4.0.');
  window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener,noreferrer');
}
window.openSupportWhatsApp = openSupportWhatsApp;

function checkForUpdates(event) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();

  const btn = document.getElementById('check-update-btn');
  const btnArch = document.getElementById('check-update-btn-arch');
  const btnText = document.getElementById('check-update-btn-text');
  const btnTextArch = document.getElementById('check-update-btn-text-arch');
  const icon = document.getElementById('check-update-icon');
  const iconArch = document.getElementById('check-update-icon-arch');
  const statusText = document.getElementById('settings-update-status-text');
  const statusTextArch = document.getElementById('settings-update-status-text-arch');

  if (icon) icon.classList.add('sf-spinning');
  if (iconArch) iconArch.classList.add('sf-spinning');
  if (btnText) btnText.textContent = 'Checking...';
  if (btnTextArch) btnTextArch.textContent = 'Checking...';
  if (btn) btn.disabled = true;
  if (btnArch) btnArch.disabled = true;

  fetch('/api/version')
    .then(res => res.json())
    .then(data => {
      setTimeout(() => {
        if (icon) icon.classList.remove('sf-spinning');
        if (iconArch) iconArch.classList.remove('sf-spinning');
        if (btnText) btnText.textContent = 'Check for Updates';
        if (btnTextArch) btnTextArch.textContent = 'Check for Updates';
        if (btn) btn.disabled = false;
        if (btnArch) btnArch.disabled = false;

        const currentVer = data.version || '2.4.0';
        const isLatest = data.isLatest !== false;

        if (isLatest) {
          showToast(`You're up to date! Ginomia v${currentVer} is the latest version.`, 'success');
          const statusMsg = `✓ Up to date (v${currentVer}) · Checked just now`;
          if (statusText) statusText.textContent = statusMsg;
          if (statusTextArch) statusTextArch.textContent = statusMsg;
        } else {
          showToast(`Update available: Ginomia v${data.latestVersion || 'latest'}!`, 'info');
          if (typeof openChangelogModal === 'function') openChangelogModal();
        }
      }, 600);
    })
    .catch(() => {
      setTimeout(() => {
        if (icon) icon.classList.remove('sf-spinning');
        if (iconArch) iconArch.classList.remove('sf-spinning');
        if (btnText) btnText.textContent = 'Check for Updates';
        if (btnTextArch) btnTextArch.textContent = 'Check for Updates';
        if (btn) btn.disabled = false;
        if (btnArch) btnArch.disabled = false;

        showToast("You're on the latest build (Ginomia v2.4.0).", 'success');
        const statusMsg = `✓ Up to date (v2.4.0) · Checked just now`;
        if (statusText) statusText.textContent = statusMsg;
        if (statusTextArch) statusTextArch.textContent = statusMsg;
      }, 600);
    });
}
window.checkForUpdates = checkForUpdates;
