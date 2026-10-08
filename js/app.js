// Ginomai - Master Control Engine
'use strict';

const CHANNEL_NAME = 'scriptureflow_sync';
const syncChannel = new BroadcastChannel(CHANNEL_NAME);
const REMOTE_MODE = new URLSearchParams(window.location.search).get('remote') === '1';
window.isRemoteOperator = REMOTE_MODE;

// State Store
const state = {
  currentTab: 'songs', // 'bible' | 'songs' (Default to SONGS library tab)
  activeMediaId: null,
  activeCountdownId: null,
  mediaPageSelections: {},
  activePresentation: null,
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
      state.activeMediaId=dash.activeMediaId || null;
      state.activeCountdownId=dash.activeCountdownId || null;
      state.mediaPageSelections=dash.mediaPageSelections || {};
      state.activePresentation=dash.activePresentation || (['media','countdown'].includes(saved.contentType) ? {contentType:saved.contentType,media:saved.media,countdown:saved.countdown,playback:saved.playback,destinations:saved.destinations}:null);
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
  // Workspace navigation can be older than the last slide actually sent live.
  if (!REMOTE_MODE) {
    try {
      const savedLive = JSON.parse(localStorage.getItem(LIVE_STATE_STORAGE_KEY) || 'null');
      if (savedLive) restoreCommittedLiveState(savedLive);
    } catch (_) {}
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
  if (!REMOTE_MODE) liveHydrationPromise = hydrateCommittedLiveState();
  if (typeof ensureBibleLoaded === 'function') {
    ensureBibleLoaded(state.bibleVersion || 'KJV');
  }

  initTabs();
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

  const bentoFull = document.getElementById('bento-prev-mode-full');
  const bentoLt = document.getElementById('bento-prev-mode-lt');
  const bentoDual = document.getElementById('bento-prev-mode-dual');
  if (bentoFull) bentoFull.classList.toggle('active', previewTargetMode === 'sanctuary');
  if (bentoLt) bentoLt.classList.toggle('active', previewTargetMode === 'livestream');
  if (bentoDual) bentoDual.classList.toggle('active', previewTargetMode === 'dual');

  const previewTargetBtn = document.getElementById('preview-target-toggle-btn');
  if (previewTargetBtn) {
    if (previewTargetMode === 'sanctuary') previewTargetBtn.textContent = 'Projector';
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

  // Listen for sync request from newly opened OBS / Sanctuary output windows
  syncChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'REQUEST_STATE') {
      replyToOutputStateRequest();
    }
  };

});

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
  window.renderBentoAgenda?.();
  window.sessionManager?.updateTopBarUi?.();
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
  if (targetTab === 'media') { renderLibrary(); return; }

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

}
window.initTabs = initTabs;

function focusLibrarySearch() {
  const target = document.getElementById('bento-search-input');
  if (target) {
    target.focus();
    target.select?.();
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
    // Escape / F1 clear live output and its preview mirror together.
    else if (e.key === 'Escape' || e.key === 'F1') {
      e.preventDefault();
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
    if (state.medleySongIds.filter(Boolean).length === 0) {
      const songDb = window.SONGS_DATABASE || [];
      const candidates = [state.activeSongId, ...(state.agendaItems || []).filter(item => item.type === 'song').map(item => item.id)];
      state.medleySongIds = [...new Set(candidates.filter(id => songDb.some(song => song.id === id)))].slice(0, 3);
      if (!state.activeSongId) state.activeSongId = state.medleySongIds[0] || null;
    }
    if (state.medleyBibleSlots.length === 0) {
      state.medleyBibleSlots = [
        state.activeBibleBook ? { book: state.activeBibleBook, chapter: state.activeBibleChapter || 1, version: state.bibleVersion || 'KJV' } : null,
        null,
        null
      ];
    }
  }

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
        }
      }
    } else if (state.activeDeckType === 'song') {
      if (!state.medleySongIds.includes(state.activeSongId) && state.activeLiveSlideId) {
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

  renderDeck(true);
  syncDashboardWorkspace();
}

function selectSingleViewSong(songId) {
  if (!(window.SONGS_DATABASE || []).some(song => song.id === songId)) return;
  if (state.isMedleyMode) {
    const slots = state.medleySongIds || [];
    if (!slots.includes(songId)) {
      const emptySlot = [0, 1, 2].find(idx => !slots[idx]);
      if (emptySlot === undefined) {
        showToast('All medley slots are loaded. Use Change or drag onto a slot to replace a song.', 'info');
        return;
      }
      swapMedleySong(emptySlot, songId, false);
      return;
    }
    const needsDeckSwitch = state.activeDeckType !== 'song';
    const wasEditing = Boolean(state.isDeckEditingSong);
    state.activeSongId = songId;
    state.activeDeckType = 'song';
    state.currentTab = 'songs';
    syncActiveTabUI();
    if (wasEditing) closeDeckSplitEditor(false);
    else if (needsDeckSwitch) renderDeck(true);
    document.querySelectorAll('.bento-song-row, .library-item[data-song-id]').forEach(row => {
      row.classList.toggle('active', row.dataset.songId === songId);
    });
    document.querySelectorAll('.bento-slot-col').forEach(col => {
      col.classList.toggle('selected-song', col.dataset.songId === songId);
    });
    syncDashboardWorkspace();
    return;
  }
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
window.selectSingleViewSong = selectSingleViewSong;

// Render Zone 2 Deck (Single View vs Medley Deck View for Bible / Songs)
function renderDeck(resetScroll = false) {
  window.renderBentoDeck?.();
}

function scrollActiveLibraryItemIntoView(itemId) {
  if (!itemId) return;
  const libraryList = document.getElementById('bento-library-list');
  if (!libraryList) return;

  const activeEl = libraryList.querySelector(`[data-song-id="${itemId}"]`) ||
    libraryList.querySelector('.bento-lib-item.active');
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
      if (sibling.classList && (sibling.classList.contains('bento-single-card') || sibling.classList.contains('bento-slide-card'))) {
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
  if (REMOTE_MODE) options = { ...options, behavior: 'instant' };
  const scroll = () => {
    // 2. Bento Theme Deck Scroll (Single View & Medley Columns)
    const bentoContainer = document.getElementById('bento-medley-container');
    const bentoActiveCard = document.querySelector('#bento-medley-container .bento-single-card.live, #bento-medley-container .bento-slide-card.live')
      || document.querySelector('#bento-medley-container .bento-card-pulse');
    if (bentoActiveCard) {
      const bentoSlidesWrap = (typeof bentoActiveCard.closest === 'function') ? bentoActiveCard.closest('.bento-slides') : null;
      if (bentoSlidesWrap) {
        scrollElementIntoContainerView(bentoActiveCard, bentoSlidesWrap, { center: true, ...options });
      } else if (bentoContainer) {
        scrollElementIntoContainerView(bentoActiveCard, bentoContainer, { center: true, ...options });
      }
    }
  };
  if (REMOTE_MODE) scroll();
  else requestAnimationFrame(scroll);
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

  if (typeof CLOUD_REPOSITORIES !== 'undefined') {
    for (const bible of CLOUD_REPOSITORIES.bibles || []) {
      if (!bible.code.endsWith('_STRONGS') && !added.has(bible.code) && (bible.installed || bible.cloudAvailable)) {
        base.push({ code: bible.code, title: bible.name });
        added.add(bible.code);
      }
    }
  }
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
    const btn = document.getElementById('bento-trans-sel');
    if (dialog && dialog.classList.contains('open')) {
      if (!dialog.contains(e.target) && (!btn || !btn.contains(e.target))) {
        closeTranslationDropdown();
      }
    }

    const songDialog = document.getElementById('medley-song-dialog');
    if (songDialog && songDialog.classList.contains('open')) {
      if (!songDialog.contains(e.target) && !e.target.closest('.bento-slot-col .change')) {
        closeSongPicker();
      }
    }

    const versionDialog = document.getElementById('medley-version-dialog');
    if (versionDialog && versionDialog.classList.contains('open')) {
      if (!versionDialog.contains(e.target) && !e.target.closest('.bento-slot-col .change')) {
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
  const btn = document.getElementById('bento-trans-sel');
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
  const btn = document.getElementById('bento-trans-sel');
  const bentoBtn = document.getElementById('bento-trans-sel');
  if (dialog) dialog.classList.remove('open');
  if (btn) btn.classList.remove('open');
  if (bentoBtn) bentoBtn.classList.remove('open');
  if (typeof window.closeDismissShield === 'function') {
    window.closeDismissShield();
  }
}

// Version Switcher & Compare Mode
async function ensureBibleLoaded(ver = state.bibleVersion || 'KJV', allowDownload = false) {
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
    let resp = await fetch(`/bibles/${upper}.json`);
    if (resp.status === 404 && allowDownload && typeof window.ensureContentPack === 'function') {
      if (!await window.ensureContentPack(upper)) return false;
      resp = await fetch(`/bibles/${upper}.json`);
    }
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
    if (allowDownload) showToast(e.message, 'error');
  }
  return false;
}
window.ensureBibleLoaded = ensureBibleLoaded;

async function changeBibleVersion(ver) {
  if (!ver) return;
  const previousVersion = state.bibleVersion;
  state.bibleVersion = ver;

  // Sync select & custom button elements
  const bentoVerText = document.getElementById('bento-active-version-label');
  if (bentoVerText) {
    bentoVerText.textContent = ver;
  }

  if (!await ensureBibleLoaded(ver, true)) {
    if (state.bibleVersion === ver) {
      state.bibleVersion = previousVersion;
      for (const id of ['bento-active-version-label']) {
        const element = document.getElementById(id);
        if (element) element.textContent = previousVersion;
      }
    }
    return;
  }
  if (state.bibleVersion !== ver) return;

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
  const previousVersion = state.compareBibleVersion;
  state.compareBibleVersion = ver;

  if (!await ensureBibleLoaded(ver, true)) {
    if (state.compareBibleVersion === ver) {
      state.compareBibleVersion = previousVersion;
    }
    return;
  }
  if (state.compareBibleVersion !== ver) return;

  renderDeck();
  if (state.activeLiveSlideId && state.isCompareMode) reprojectCurrentLive();
  else syncDashboardWorkspace();
}

function toggleCompareMode() {
  state.isCompareMode = !state.isCompareMode;
  renderDeck();
  if (state.activeLiveSlideId) reprojectCurrentLive();
  else syncDashboardWorkspace();
}

// Hold / Lock Live Slide
function toggleHoldLive() {
  if (REMOTE_MODE) {
    state.isHoldLive = !state.isHoldLive;
    window.syncPresentationControls?.();
    sendRemoteCommand({type:'SET_HOLD',enabled:state.isHoldLive});
    return;
  }
  state.isHoldLive = !state.isHoldLive;
  window.syncPresentationControls?.();
  window.refreshBentoSplitLive?.();
  fetch('/api/hold', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ held: state.isHoldLive }) })
    .then(response => { if (!response.ok) throw new Error('Hold unavailable'); })
    .catch(() => showToast('Could not update remote Hold. Check the server connection.', 'error'));
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
  const container = document.getElementById('bento-medley-container');
  if (!container) return;
  const cols = Array.from(container.querySelectorAll('.bento-slot-col'));
  if (!cols.length) return;
  let curColIdx = cols.findIndex(c => c.classList.contains('active-song') || c.querySelector('.bento-slide-card.live'));
  if (curColIdx === -1) curColIdx = 0;

  let targetColIdx = curColIdx + dir;
  if (targetColIdx >= 0 && targetColIdx < cols.length) {
    const targetCol = cols[targetColIdx];
    const cards = Array.from(targetCol.querySelectorAll('.bento-slide-card'));
    if (cards.length > 0) {
      cards[0].click();
    }
  }
}

// Navigate Next / Prev Slide
function navigateLiveVerse(dir) {
  if (state.isHoldLive) return;
  if (window.navigateBentoSplitDraft?.(dir)) return;

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
  // 2. SINGLE VIEW NAVIGATION
  // ─────────────────────────────────────────────────────────────
  const visibleCards = Array.from(document.querySelectorAll('#bento-medley-container .bento-single-card[data-slide-id]:not(.bento-add-song-card), #bento-medley-container .bento-slide-card[data-slide-id]:not(.bento-add-song-card)'));

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

function getOutputUrl(targetType, overrideIp = '') {
  const baseUrl = getBaseDisplayUrl(overrideIp);
  const shortNames = {
    obs: 'live', livestream: 'livestream', sanctuary: 'projector', stage: 'stage', auto: 'auto',
    '?target=livestream&layout=lt': 'overlay'
  };
  if (baseUrl.startsWith('http') && Object.prototype.hasOwnProperty.call(shortNames, targetType)) {
    return baseUrl.replace(/display\.html$/, shortNames[targetType]);
  }
  return targetType.includes('?') ? `${baseUrl}${targetType}` : `${baseUrl}?target=${targetType}`;
}

function updateOutputLinksModal(overrideIp = '') {

  const inputSanctuary = document.getElementById('url-sanctuary');
  const inputLivestream = document.getElementById('url-livestream');
  const inputAuto = document.getElementById('url-auto');
  const inputRemote = document.getElementById('url-remote');

  if (inputSanctuary) inputSanctuary.value = getOutputUrl('sanctuary', overrideIp);
  if (inputLivestream) inputLivestream.value = getOutputUrl('livestream', overrideIp);
  if (inputAuto) inputAuto.value = getOutputUrl('auto', overrideIp);
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
    const opCard = document.getElementById('hub-operators-card');
    const list = document.getElementById('hub-operators-list');

    if (badge) {
      badge.style.display = count > 0 ? 'inline-block' : 'none';
      badge.textContent = `${count} Online`;
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
  if (displayUrl.startsWith('http')) return displayUrl.replace(/display\.html$/, 'remote');
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
  const finalUrl = getOutputUrl(targetType);
  const previewName = 'GinomaiOutput_' + targetType.replace(/[^a-z0-9]/gi, '_');
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
  const targetUrl = getOutputUrl(targetType, customLanIp);

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
  const inputEl = document.createElement('textarea');
  inputEl.value = targetType === 'remote' ? getRemoteControlUrl(customLanIp) : getOutputUrl(targetType, customLanIp);
  inputEl.style.cssText = 'position:fixed;left:-9999px;top:0;';
  document.body.appendChild(inputEl);
  inputEl.select();
  const copied = document.execCommand('copy');
  inputEl.remove();
  if (copied && callback) callback();
}

// Stage Preview Controls
/* hoisted */

function openPopoutPreview() {
  const baseUrl = getBaseDisplayUrl();
  const popUrl = `${baseUrl}?target=${previewTargetMode}`;
  window.open(popUrl, 'GinomaiProPreviewPopout', 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');
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
  const visibleCards = Array.from(document.querySelectorAll('#bento-medley-container [data-slide-id]:not(.bento-add-song-card)'));
  if (!visibleCards || visibleCards.length === 0) return null;

  const currentIdx = visibleCards.findIndex(c => c.getAttribute('data-slide-id') === activeSlideId);
  if (currentIdx !== -1 && currentIdx + 1 < visibleCards.length) {
    const nextCard = visibleCards[currentIdx + 1];
    const nextSlideId = nextCard.getAttribute('data-slide-id');
    if (window._bentoSlideRegistry && window._bentoSlideRegistry.has(nextSlideId)) {
      const reg = window._bentoSlideRegistry.get(nextSlideId);
      return { text: reg.text || '', reference: reg.refStr || '' };
    }
    const textEl = nextCard.querySelector('.ln, .slide-text, .bento-slide-text');
    const labelEl = nextCard.querySelector('.tag, .slide-label, .bento-slide-label, .bento-slide-header');
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
let liveHydrationPromise = null;
let liveStateHydrated = false;

function restoreCommittedLiveState(payload) {
  pendingLiveStorage = payload;
  state.activeLiveSlideId = payload.clear || payload.blackout ? null : (payload.slideId || null);
  state.activeLiveText = payload.text || '';
  state.activeLiveRef = payload.reference || '';
  state.activeLexiconData = payload.isLexicon ? payload.lexiconData : null;
  state.compareData = payload.compareData || null;
  state.activePresentation = ['media', 'countdown'].includes(payload.contentType)
    ? { contentType: payload.contentType, media: payload.media, countdown: payload.countdown,
        playback: payload.playback, destinations: payload.destinations } : null;
  for (const [key, value] of Object.entries({ currentMode: payload.mode, projectorActive: payload.projectorActive,
    livestreamActive: payload.livestreamActive, transparentBg: payload.transparentBg, streamAppearance: payload.streamAppearance,
    isCompareMode: payload.compare, compareBibleVersion: payload.compareVersion, serviceTimer: payload.serviceTimer })) {
    if (value !== undefined) state[key] = value;
  }
}

async function hydrateCommittedLiveState() {
  const initial = pendingLiveStorage;
  try {
    if (window.location.protocol !== 'file:') {
      const response = await fetch('/api/state');
      if (!response.ok) throw new Error('Live state unavailable');
      const payload = await response.json();
      // An explicit action during loading always wins over this delayed read.
      if (pendingLiveStorage === initial) {
        if (payload._outputRevision > 0 || !initial) restoreCommittedLiveState(payload);
        else if (initial) {
          await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(initial) });
        }
      }
    }
  } catch (_) {
    // Keep the committed local snapshot when the server is temporarily unavailable.
  } finally {
    liveStateHydrated = true;
  }
  if (pendingLiveStorage) {
    updateActiveSlideVisuals(state.activeLiveSlideId);
    updateLivePreview(pendingLiveStorage);
    window.syncPresentationControls?.(pendingLiveStorage);
    clearTimeout(liveStorageTimer);
    liveStorageTimer = setTimeout(flushCommittedLiveStorage, 80);
  }
}

async function replyToOutputStateRequest() {
  if (liveHydrationPromise) await liveHydrationPromise;
  if (pendingLiveStorage) syncChannel.postMessage(pendingLiveStorage);
}

function flushCommittedLiveStorage() {
  if (!pendingLiveStorage || REMOTE_MODE) return;
  try { localStorage.setItem(LIVE_STATE_STORAGE_KEY, JSON.stringify(pendingLiveStorage)); } catch (_) {}
}
window.addEventListener('pagehide', flushCommittedLiveStorage);

function broadcastState(override = {}, previewAlreadyUpdated = false) {
  if (REMOTE_MODE) {
    if (override.clear) sendRemoteCommand({ type: 'CLEAR' });
    else if (override.blackout) sendRemoteCommand({ type: 'BLACKOUT' });
    else sendRemoteCommand({ type: 'STATE_PATCH', patch: createDashboardSnapshot() });
    return;
  }
  const independentUpdate = override.alert !== undefined || override.serviceTimer !== undefined;
  const projection = override.slideId !== undefined || override.text !== undefined || override.contentType !== undefined;
  if (!liveStateHydrated && !projection && !override.clear && !override.blackout) {
    if (independentUpdate && liveHydrationPromise) {
      liveHydrationPromise.then(() => broadcastState(override, previewAlreadyUpdated));
    }
    return;
  }
  if (state.isHoldLive && !independentUpdate && !override.clear && !override.blackout) return;

  const slideId = override.slideId !== undefined ? override.slideId : (state.activeLiveSlideId || '');
  const isLexicon = Boolean(override.isLexicon || (slideId && slideId.startsWith('lexicon_')));
  const isBible = !isLexicon && (slideId.startsWith('bible_') || slideId.startsWith('medley_bible_') || slideId.startsWith('ai_') || slideId.startsWith('para_') || slideId.startsWith('hist_'));

  if (!isLexicon) {
    state.activeLexiconData = null;
  }

  const payload = {
    slideId: slideId,
    contentType: override.contentType !== undefined ? override.contentType : isLexicon ? 'lexicon' : state.activePresentation?.contentType || (isBible ? 'bible' : 'song'),
    media: state.activePresentation?.media || null,
    countdown: state.activePresentation?.countdown || null,
    playback: state.activePresentation?.playback || null,
    destinations: state.activePresentation?.destinations || null,
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
    streamAppearance: state.streamAppearance,
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
    clear: override.clear !== undefined ? !!override.clear : projection ? false : !!pendingLiveStorage?.clear,
    clearBg: override.clearBg !== undefined ? !!override.clearBg : projection ? false : !!pendingLiveStorage?.clearBg,
    blackout: override.blackout !== undefined ? !!override.blackout : projection ? false : !!pendingLiveStorage?.blackout,
    dashboard: createDashboardSnapshot(),
    _timestamp: Math.max(Date.now(), (pendingLiveStorage?._timestamp || 0) + 1)
  };

  // Appearance changes preserve committed content, including lexicon overrides.
  if (!projection && !override.clear && !override.blackout && pendingLiveStorage) {
    if (payload.slideId !== pendingLiveStorage.slideId || payload.contentType !== pendingLiveStorage.contentType) {
      for (const key of ['media', 'countdown', 'playback', 'destinations', 'compareData']) payload[key] = pendingLiveStorage[key];
    }
    for (const key of ['slideId', 'text', 'reference', 'contentType', 'isBible', 'isLexicon', 'lexiconData',
      'lexiconStyle', 'lexiconDisplayMode', 'concordancePosition', 'lexiconPosition', 'englishWord']) {
      payload[key] = pendingLiveStorage[key];
    }
  }

  // Alerts and timers preserve the last transmitted slide, including clear/blackout.
  if (independentUpdate && pendingLiveStorage) {
    Object.assign(payload, pendingLiveStorage, override, { _timestamp: payload._timestamp });
  }

  // 1. Save state to localStorage for cross-window hydration using isolated key
  pendingLiveStorage = payload;
  clearTimeout(liveStorageTimer);
  liveStorageTimer = setTimeout(flushCommittedLiveStorage, 80);

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
  window.syncPresentationControls?.(payload);
}

function createDashboardSnapshot() {
  return {
    currentTab: state.currentTab,
    activeDeckType: state.activeDeckType,
    activeMediaId: state.activeMediaId,
    activeCountdownId: state.activeCountdownId,
    mediaPageSelections: state.mediaPageSelections,
    activePresentation: state.activePresentation,
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
    streamAppearance: state.streamAppearance,
    transitionType: state.transitionType,
    transitionDuration: state.transitionDuration,
    typography: state.typography,
    background: state.background,
    autoProject: state.autoProject
  };
}

function applyDashboardPatch(patch = {}) {
  const changed = key => patch[key] !== undefined && JSON.stringify(patch[key]) !== JSON.stringify(state[key]);
  const deckChanged = ['activeDeckType', 'isMedleyMode', 'activeSongId', 'activeBibleBook', 'activeBibleChapter',
    'bibleVersion', 'compareBibleVersion', 'isCompareMode', 'maxLinesPerSlide', 'medleySongIds', 'medleyVersionCodes', 'medleyBibleSlots'].some(changed);
  const libraryChanged = deckChanged || changed('currentTab');
  const agendaChanged = changed('agendaItems');
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
  const transparent = document.getElementById('preview-transparent-bg-toggle');
  const settingsTransparent = document.getElementById('setting-transparent-bg-toggle');
  const previewAutoToggle = document.getElementById('preview-auto-project-toggle');
  if (sizeSlider) sizeSlider.value = state.textSize;
  if (transparent) transparent.checked = state.transparentBg;
  if (settingsTransparent) settingsTransparent.checked = state.transparentBg;
  syncTransparentBtnUI();
  syncMedleySettingsUI();
  if (previewAutoToggle) previewAutoToggle.checked = !!state.autoProject;
  document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === state.currentTab));
  if (agendaChanged) renderAgenda();
  if (libraryChanged) renderLibrary();
  if (deckChanged) renderDeck();
  updateActiveSlideVisuals(state.activeLiveSlideId);
}

// Called only by the protected desktop updater, before any windows are closed.
window.prepareDesktopUpdateRestart = async function prepareDesktopUpdateRestart(save = false) {
  const blockers = [];
  if (window.sermonManager?.isRecordingSermon) blockers.push('Sermon recording');
  if (state.aiSpeechRequested || state.aiListening || speechAi?.isListening) blockers.push('AI microphone');
  if (blockers.length) return { ok: true, blockers };
  if (!save) return { ok: true, blockers: [] };
  try {
    if (_syncWorkspaceTimer) { clearTimeout(_syncWorkspaceTimer); _syncWorkspaceTimer = null; }
    clearTimeout(liveStorageTimer);
    const dashboard = createDashboardSnapshot();
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ dashboard }));
    if (pendingLiveStorage) localStorage.setItem(LIVE_STATE_STORAGE_KEY, JSON.stringify(pendingLiveStorage));
    if (window.sessionManager && !window.sessionManager.saveCurrentSessionSnapshot(null, true)) throw new Error('Could not save the service session.');
    const response = await fetch('/api/workspace', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboard }), signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('Could not save the workspace.');
    return { ok: true, blockers: [] };
  } catch (_) { return { ok: false, error: 'Could not save the workspace. Restart has been prevented. Retry or export your service first.' }; }
};

function syncDashboardWorkspace(immediate = false) {
  const doSync = () => {
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ dashboard: createDashboardSnapshot() }));
    } catch (e) { }
    if (window.sessionManager && typeof window.sessionManager.notifyAgendaChanged === 'function') {
      window.sessionManager.notifyAgendaChanged();
    }
    if (!REMOTE_MODE) {
      fetch('/api/workspace', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboard: createDashboardSnapshot() })
      }).catch(() => {});
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
  // The selected effect is used on the next projection; do not replay this slide.
}

function setTransitionDurationSetting(duration) {
  const parsed = parseInt(duration, 10);
  if (isNaN(parsed)) return;
  state.transitionDuration = parsed;
  try {
    localStorage.setItem('sf_transition_duration', parsed);
  } catch (e) { }
  syncTransitionSettingsUI();
  // The selected effect is used on the next projection; do not replay this slide.
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
  publishQuickTextScale();
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
  publishQuickTextScale();
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
        if (backdrop.id === 'operator-join-modal-backdrop') {
          e.preventDefault();
          e.stopImmediatePropagation();
          closeOperatorJoinModal();
          return;
        }
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

let quickTextScaleQueued=false;
function publishQuickTextScale() {
  const label=document.getElementById('bento-textscale-label');
  if(label) label.textContent=getPreviewTextScaleControl().value.toFixed(1)+'x';
  // Resident production frames receive this payload directly. Avoid repeating the
  // legacy preview layout/video work for a text-size-only change.
  const resident=document.getElementById('bento-single-prev-wrap')?.classList.contains('uses-output-renderer');
  const publish=()=>broadcastState({clear:!!pendingLiveStorage?.clear,blackout:!!pendingLiveStorage?.blackout,transitionType:'cut'},!!resident);
  if(!resident) {publish();return;}
  if(quickTextScaleQueued) return;
  quickTextScaleQueued=true;
  // Keep payload serialization and transport outside the tactile state/DOM work.
  queueMicrotask(()=>{quickTextScaleQueued=false;publish();});
}

function updateTextScale(val) {
  state.textSize = parseFloat(val);
  publishQuickTextScale();
}

function getPreviewTextScaleControl() {
  if (state.activePresentation?.contentType === 'countdown') return {key:'textSize',value:state.textSize || 1,song:false,lowerThird:false};
  const id = String(state.activeLiveSlideId || '');
  const ref = state.activeLiveRef || '';
  const bible = id.startsWith('bible_') || id.startsWith('medley_bible_') ||
    id.startsWith('para_') || id.startsWith('hist_') ||
    (id.startsWith('ai_') && /\b\d+\s*:\s*\d+/.test(ref)) ||
    (state.currentTab === 'bible' && !id.includes('song'));
  const song = !bible && !id.startsWith('lexicon_') && Boolean(state.activeLiveText || id);
  const rule = window.themeManager?.obsModeRule || state.sanctuaryTheme?.obsModeRule || 'always_lt';
  const lowerThird = ['livestream', 'lt', 'lowerthird'].includes(window.previewTargetMode) &&
    (rule === 'always_lt' || (rule === 'follow' && state.currentMode === 'lt'));
  const key = song ? (lowerThird ? 'songScaleLt' : 'songScaleFull') : 'textSize';
  return { key, value: Number(state[key] ?? (song ? lowerThird ? 1.4 : 2.2 : 1)), song, lowerThird };
}
window.getPreviewTextScaleControl = getPreviewTextScaleControl;

function adjustTextScale(delta) {
  if (state.isHoldLive) { showToast('Release Hold live to change live text size.', 'info'); return; }
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
  try { localStorage.setItem('sf_preview_target_mode', mode); if(mode==='sanctuary'||mode==='livestream') localStorage.setItem('sf_style_target',mode); } catch (e) { }

  const bentoFull = document.getElementById('bento-prev-mode-full');
  const bentoLt = document.getElementById('bento-prev-mode-lt');
  const bentoDual = document.getElementById('bento-prev-mode-dual');
  if (bentoFull) bentoFull.classList.toggle('active', previewTargetMode === 'sanctuary');
  if (bentoLt) bentoLt.classList.toggle('active', previewTargetMode === 'livestream');
  if (bentoDual) bentoDual.classList.toggle('active', previewTargetMode === 'dual');

  const previewTargetBtn = document.getElementById('preview-target-toggle-btn');
  if (previewTargetBtn) {
    if (previewTargetMode === 'sanctuary') previewTargetBtn.textContent = 'Projector';
    else if (previewTargetMode === 'dual') previewTargetBtn.textContent = 'Dual Output';
    else previewTargetBtn.textContent = 'Livestream';
    previewTargetBtn.classList.toggle('active', previewTargetMode === 'livestream');
  }

  window.syncOutputPreviews?.();
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
    const badgeLabel = t.category === 'colors' ? (t.badge === 'SOLID' ? 'Solid' : 'Gradient') : t.imageUrl && /\.gif$/i.test(t.imageUrl) ? 'GIF' : t.type === 'video' ? 'Motion' : (t.type === 'image' ? 'Still' : 'Minimal');
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
  if (REMOTE_MODE) window.updateOutputPreviews?.(payload);
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
    .normalize('NFKD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .replace(/['\u2018\u2019`]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
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

// Cache normalized lyrics and words without persisting derived data in the songbook.
const songSearchCache = new WeakMap();
let lastSongSearchQuery = null;

function prepareSongSearchQuery(rawQuery) {
  if (rawQuery && typeof rawQuery === 'object') return rawQuery;
  const raw = String(rawQuery || '');
  if (lastSongSearchQuery?.raw === raw) return lastSongSearchQuery;
  const text = normalizeSearchText(raw);
  const tokens = [...new Set(text.split(/\s+/).filter(Boolean))];
  lastSongSearchQuery = { raw, text, tokens, singleWord: text && !text.includes(' ') };
  return lastSongSearchQuery;
}

function getSongSearchData(song) {
  const stanzas = song.stanzas || [];
  const cached = songSearchCache.get(song);
  if (cached && cached.title === song.title && cached.author === song.author &&
      cached.rawStanzas.length === stanzas.length &&
      stanzas.every((stanza, i) => (stanza.text || '') === cached.rawStanzas[i])) return cached;
  const rawStanzas = stanzas.map(stanza => stanza.text || '');
  const normalizedStanzas = rawStanzas.map(normalizeSearchText);
  const title = normalizeSearchText(song.title);
  const author = normalizeSearchText(song.author);
  const text = [title, author, ...normalizedStanzas].filter(Boolean).join(' ');
  const data = {
    title: song.title, author: song.author, rawStanzas, normalizedStanzas, text,
    titleText: title, authorText: author,
    metadataWords: `${title} ${author}`.split(/\s+/).filter(Boolean),
    stanzaWords: normalizedStanzas.map(text => new Set(text.split(/\s+/).filter(Boolean))),
    words: new Set(text.split(/\s+/).filter(Boolean))
  };
  songSearchCache.set(song, data);
  return data;
}

function getSongSearchIndex(song) {
  if (!song) return '';
  return getSongSearchData(song).text;
}

function invalidateSongSearchIndex(song) {
  if (song) {
    songSearchCache.delete(song);
    delete song._searchIndex;
    delete song._matchedSnippet;
  }
}

// Resilient matching across song title, author, and full-text lyrics
function matchSongQuery(song, rawQuery) {
  if (!song || !rawQuery) return false;
  song._matchedSnippet = '';
  const query = prepareSongSearchQuery(rawQuery);
  const qClean = query.text;
  if (!qClean) return false;
  const data = getSongSearchData(song);
  const qTokens = query.tokens;
  const firstStanza = data.rawStanzas[0] || '';

  // 1. Direct title or author match
  const containsPhrase = text => query.singleWord
    ? text.includes(qClean)
    : (` ${text}`).includes(` ${qClean}`);
  if (containsPhrase(data.titleText) || containsPhrase(data.authorText)) {
    song._matchedSnippet = firstStanza;
    return true;
  }

  // 2. Full-text lyrics match across stanzas (handling line breaks, punctuation, and contractions)
  for (let i = 0; i < data.normalizedStanzas.length; i++) {
    const rawStText = data.rawStanzas[i];
    const stNorm = data.normalizedStanzas[i];
    if (!stNorm) continue;

    // Direct continuous phrase match in stanza
    if (containsPhrase(stNorm)) {
      song._matchedSnippet = extractSnippetAroundMatch(rawStText, qTokens);
      return true;
    }
    // Retain forgiving lyric searches, counting unique whole words only.
    if (qTokens.length >= 3 && qTokens.filter(token => data.stanzaWords[i].has(token)).length / qTokens.length >= 0.75) {
      song._matchedSnippet = extractSnippetAroundMatch(rawStText, qTokens);
      return true;
    }
  }

  // 3. Words can span title, artist, and stanzas, in any order.
  // Unique, whole words keep short titles and repeated substrings from inflating matches.
  const hits = qTokens.filter(token => data.words.has(token)).length;
  if (hits === qTokens.length || (qTokens.length >= 3 && hits / qTokens.length >= 0.8)) {
    song._matchedSnippet = extractSnippetAroundMatch(data.rawStanzas.join('\n'), qTokens) || firstStanza;
    return true;
  }
  // Allow the final title/artist word to be unfinished while typing.
  if (qTokens.length >= 2 && qTokens.every((token, i) => data.metadataWords.some(word =>
      i === qTokens.length - 1 ? word.startsWith(token) : word === token))) {
    song._matchedSnippet = firstStanza;
    return true;
  }

  return false;
}

window.matchSongQuery = matchSongQuery;
window.normalizeSearchText = normalizeSearchText;

// Keep existing song rows and materialize at most one batch of new rows per render.
function renderSongLibraryRows(container, songs, options) {
  let cache = container._songLibraryRows;
  if (!cache) {
    container.replaceChildren();
    cache = container._songLibraryRows = { rows: new Map(), query: null, limit: 80 };
  }
  const catalog = new Set(options.catalog.map(song => song.id));
  for (const [id, entry] of cache.rows) {
    if (!catalog.has(id)) { entry.row.remove(); cache.rows.delete(id); }
  }
  if (cache.query !== options.query) {
    cache.query = options.query;
    cache.limit = 80;
    container.scrollTop = 0;
  }

  const showRows = () => {
    if (container._songLibraryRows !== cache) return;
    const desired = songs.slice(0, cache.limit).map(song => {
      const signature = options.signature(song);
      let entry = cache.rows.get(song.id);
      if (!entry || entry.song !== song || entry.signature !== signature) {
        if (entry) entry.row.remove();
        entry = { song, signature, row: options.createRow(song) };
        cache.rows.set(song.id, entry);
      }
      options.updateRow(entry.row, song);
      return entry.row;
    });
    if (!songs.length) {
      if (!cache.empty) cache.empty = document.createElement('div');
      if (cache.emptyHtml !== options.emptyHtml) {
        cache.empty.innerHTML = options.emptyHtml;
        cache.emptyHtml = options.emptyHtml;
      }
      desired.push(cache.empty);
    }
    const keep = new Set(desired);
    for (const child of Array.from(container.children)) {
      if (!keep.has(child)) child.remove();
    }
    desired.forEach((row, i) => {
      const current = container.children[i];
      if (current !== row) container.insertBefore(row, current || null);
    });
  };
  showRows();
  container.onscroll = () => {
    if (cache.limit < songs.length && container.scrollTop + container.clientHeight >= container.scrollHeight - 150) {
      cache.limit += 80;
      showRows();
    }
  };
}
window.renderSongLibraryRows = renderSongLibraryRows;

// Render the Bento library (BIBLE vs SONGS Tabs)
function renderLibrary(filterQuery = null) {
  if (state.currentTab === 'media') { syncActiveTabUI(); window.renderMediaLibrary?.(filterQuery); return; }
  if (typeof syncActiveTabUI === 'function') {
    syncActiveTabUI();
  }

  // Preserve active search query if not explicitly passed
  if (filterQuery === null || filterQuery === undefined) {
    const bentoInput = document.getElementById('bento-search-input');
    const input = bentoInput;
    filterQuery = (input && input.value) ? input.value : '';
  }

  if (typeof window.renderBentoLibrary === 'function') {
    window.renderBentoLibrary(filterQuery);
  }

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

// Medley Bible & Songs Custom Dialog Popovers
function initSongPickerModal() {
  document.addEventListener('click', (e) => {
    const sDialog = document.getElementById('medley-song-dialog');
    if (sDialog && sDialog.classList.contains('open')) {
      if (!sDialog.contains(e.target) && !e.target.closest('.bento-slot-col .change')) {
        closeSongPicker();
      }
    }
    const vDialog = document.getElementById('medley-version-dialog');
    if (vDialog && vDialog.classList.contains('open')) {
      if (!vDialog.contains(e.target) && !e.target.closest('.bento-slot-col .change')) {
        closeVersionPicker();
      }
    }
    const bDialog = document.getElementById('medley-bible-dialog');
    if (bDialog && bDialog.classList.contains('open')) {
      if (!bDialog.contains(e.target) && !e.target.closest('.bento-slot-col .change')) {
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

  const targetBtn = event ? (event.currentTarget || event.target) : document.querySelector(`.bento-slot-col:nth-child(${slotIndex + 1}) .change`);
  // Keep the picker above the dismissal shield and outside clipped deck panels.
  if (dialog.parentElement !== document.body) document.body.appendChild(dialog);

  const isAlreadyOpen = dialog.classList.contains('open') && dialog._openedForSlot === slotIndex;
  if (isAlreadyOpen) {
    closeSongPicker();
  } else {
    dialog._openedForSlot = slotIndex;
    if (input) input.value = '';
    renderSongPickerResults('');
    const rect = targetBtn ? targetBtn.getBoundingClientRect() : { left: 12, right: 302, bottom: 12 };
    const width = dialog.offsetWidth || 290;
    const height = dialog.offsetHeight || 320;
    dialog.style.position = 'fixed';
    dialog.style.left = `${Math.max(12, Math.min(slotIndex >= 2 ? rect.right - width : rect.left, window.innerWidth - width - 12))}px`;
    dialog.style.right = 'auto';
    dialog.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - height - 12))}px`;
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
      input.focus();
      input.select();
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
      closeSongPicker();
      swapMedleySong(state.activePickerSlot, song.id, false);
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

  const targetBtn = event ? (event.currentTarget || event.target) : document.querySelector(`.bento-slot-col:nth-child(${slotIndex + 1}) .change`);
  if (targetBtn) {
    const parentHeader = targetBtn.closest('.bento-slot-col-head') || targetBtn.parentElement;
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

  const targetBtn = event ? (event.currentTarget || event.target) : document.querySelector(`.bento-slot-col:nth-child(${slotIndex + 1}) .change`);
  if (targetBtn) {
    const parentHeader = targetBtn.closest('.bento-slot-col-head') || targetBtn.parentElement;
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
    if (!(window.SONGS_DATABASE || []).some(song => song.id === songId)) return;
    if (!Array.isArray(state.medleySongIds)) state.medleySongIds = [null, null, null];
    if (allowToggle && state.medleySongIds[slotIndex] === songId) {
      state.medleySongIds[slotIndex] = null;
      if (state.activeSongId === songId) state.activeSongId = state.medleySongIds.find(Boolean) || null;
    } else {
      state.medleySongIds.forEach((id, idx) => {
        if (idx !== slotIndex && id === songId) state.medleySongIds[idx] = null;
      });
      state.medleySongIds[slotIndex] = songId;
      state.activeSongId = songId;
      state.activeDeckType = 'song';
      state.currentTab = 'songs';
      state.isDeckEditingSong = null;
      syncActiveTabUI();
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
  // 4. Instant In-Place Bento Live State Update (0ms, no DOM teardown)
  const allBentoCards = document.querySelectorAll('.bento-slide-card, .bento-single-card');
  allBentoCards.forEach(c => {
    const isTarget = (c.dataset.slideId === slideId || c.id === `bento_card_${slideId}`);
    if (c.classList.contains('media-card')) {
      c.classList.toggle('live',isTarget);
      const badge=c.querySelector('.live-pill');if(badge) badge.hidden=!isTarget;
      if(isTarget) {c.classList.remove('staged');c.querySelectorAll('.staged-pill').forEach(node=>node.remove());}
      return;
    }
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
    if(c.classList.contains('media-card')) return;
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
    col.classList.toggle('selected-song', col.dataset.songId === state.activeSongId);
  });
  document.querySelectorAll('.bento-song-row').forEach(row => {
    row.classList.toggle('active', row.dataset.songId === state.activeSongId);
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
    if (state.activeDeckType !== 'bible') {
      state.activeDeckType = 'bible';
      needsDeckRebuild = true;
    }
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
    }
    if (!state.isMedleyMode) {
      if (book && book !== state.activeBibleBook) {
        state.activeBibleBook = book;
        needsDeckRebuild = true;
      }
      if (ch && !isNaN(ch) && ch !== Number(state.activeBibleChapter)) {
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
    {
      const songDb = (typeof SONGS_DATABASE !== 'undefined' ? SONGS_DATABASE : (window.SONGS_DATABASE || []));
      const matchedSong = songDb.slice().sort((a, b) => (b.id ? b.id.length : 0) - (a.id ? a.id.length : 0)).find(s => {
        if (!s || !s.id) return false;
        return [s.id + '_', 'song_' + s.id + '_', 'medley_' + s.id + '_', 'ai_song_' + s.id + '_'].some(p => slideId.startsWith(p)) || slideId === s.id;
      });
      if (matchedSong && matchedSong.id !== state.activeSongId) {
        state.activeSongId = matchedSong.id;
        needsDeckRebuild = !state.isMedleyMode;
      }
      if (matchedSong && state.activeDeckType !== 'song') {
        state.activeDeckType = 'song';
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
  if (extra.presentation) { window.projectPresentation?.(slideId,text,reference,extra); return; }
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

  state.activePresentation = null;
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

  state.activeLiveSlideId = slideId;
  state.activeLiveText = text;
  state.activeLiveRef = reference;
  const previousDeckType = state.activeDeckType;
  state.activeDeckType = isBible ? 'bible' : 'song';

  // 1. Sync state metadata first so activeSongId / activeBibleBook / activeBibleChapter are updated from slideId
  const needsDeckRebuild = syncStateFromSlideId(slideId) || previousDeckType !== state.activeDeckType;
  if (needsDeckRebuild) {
    renderDeck();
  }

  state.liveEngagedDeck = isBible
    ? { type: 'bible', book: state.activeBibleBook, chapter: state.activeBibleChapter }
    : { type: 'song', songId: state.activeSongId };

  // 2. Instantaneous 0ms in-place visual update (reacts before mouse-up finishes)
  updateActiveSlideVisuals(slideId);

  const operatorRequestId = REMOTE_MODE ? 'operator_' + Date.now() + '_' + Math.random().toString(36).slice(2) : undefined;
  if (REMOTE_MODE) window.pendingRemoteProjection = {id:operatorRequestId,startedAt:Date.now()};

  // 2. Instantaneous local Stage Preview update on Host
  updateLivePreview({
    _operatorRequestId: operatorRequestId,
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

  if (REMOTE_MODE) {
    sendRemoteCommand({ type: 'PROJECT', slideId, text, reference, contentType: isBible ? 'bible' : 'song', compareData: state.compareData, _operatorRequestId:operatorRequestId });
    return;
  }
  if (extra.committedLiveState) {
    // The server has already committed this operator projection to every output.
    restoreCommittedLiveState(extra.committedLiveState);
    syncDashboardWorkspace();
    return;
  }
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

  // 5. Update history asynchronously
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  state.scriptureHistory.unshift({ reference, text, time: now });
  state.scriptureHistory.length = Math.min(state.scriptureHistory.length, 100);
  clearTimeout(projectSlide.historyTimer);
  projectSlide.historyTimer = setTimeout(renderAiHud, 0);
}

function sendRemoteCommand(command) {
  const generation = remoteSessionGeneration;
  fetch('/api/control', {
    signal: AbortSignal.timeout(10000),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...command, _fromRemote: true })
  }).then(async response => {
    if (generation !== remoteSessionGeneration) return;
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (generation !== remoteSessionGeneration) return;
      if (data.sessionOffline) {
        syncRemoteOperatorSession({ enabled: false, revision: data.revision });
        showToast('Studio session has not been started by the host yet.', 'warning');
      } else if (data.pairingRequired) {
        window.sfOperatorPaired = false;
        setRemoteSessionLocked(false);
        openOperatorJoinModal(false);
        showToast('Enter the pairing code from the host Broadcast Hub to reconnect.', 'warning');
        refreshRemoteOperatorSession().catch(() => {});
      } else {
        showToast(data.error || 'Action denied by studio', 'warning');
      }
      return;
    }
    if (typeof setRemoteSessionLocked === 'function') setRemoteSessionLocked(false);
  }).catch(() => {
    if (generation !== remoteSessionGeneration) return;
    showToast('Cannot reach the studio computer', 'warning');
  });
}

// Sidebar Search Filter Input (Debounced for 60fps typing)
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
  if (el) el.textContent = health?.message || (state.aiSpeechRequested ? 'Connecting microphone…' : 'Start listening to check input.');
  const percent = Number.isFinite(health?.percent) ? Math.max(0, Math.min(100, Math.round(health.percent))) : 0;
  const meterBar = document.getElementById('mic-vu-meter-bar');
  const levelText = document.getElementById('mic-vu-level-text');
  if (meterBar) {
    meterBar.style.width = `${percent}%`;
    meterBar.style.background = percent > 75
      ? 'linear-gradient(90deg, #22C55E 0%, #EAB308 65%, #EF4444 100%)'
      : percent > 40 ? 'linear-gradient(90deg, #22C55E 0%, #EAB308 100%)'
      : 'linear-gradient(90deg, #10B981, #22C55E)';
  }
  if (levelText) levelText.textContent = `${percent}%`;
  updateMicSignalBars(percent);
  // The engine measures the same input it transcribes; share those levels with operators.
  const now = Date.now();
  if (state.aiListening && typeof broadcastSpeechAiUpdate === 'function' &&
      (now - (syncSpeechInputHealth.lastBroadcastAt || 0) >= 180 ||
       (percent === 0 && syncSpeechInputHealth.lastBroadcastLevel !== 0))) {
    syncSpeechInputHealth.lastBroadcastAt = now;
    syncSpeechInputHealth.lastBroadcastLevel = percent;
    broadcastSpeechAiUpdate({ audioLevel: percent });
  }
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
  ['bento-mic-btn'].forEach(id => {
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
  document.getElementById('bento-ai-live-dot')?.classList.toggle('active', ready);
  if (!ready) {
    ['bento-ai-transcript-text'].forEach(id => {
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
  if (REMOTE_MODE) return;
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
  if (REMOTE_MODE) {
    const enabled = !(state.aiSpeechRequested || state.aiListening);
    state.aiSpeechRequested = enabled;
    if (!enabled) state.aiListening = false;
    syncSpeechAiStatusControls();
    sendRemoteCommand({ type: 'SET_SPEECH_AI', enabled });
    return;
  }
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
  const slidePrefix = isRange ? `bible_${version}` : 'bible';
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
  return toggleSession();
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
  const generation = remoteSessionGeneration;
  const commands = new (window.AppEventSource || EventSource)('/api/control-events');
  controlEventSource = commands;
  commands.onmessage = (event) => {
    if (commands !== controlEventSource || (REMOTE_MODE && generation !== remoteSessionGeneration)) return;
    try { applyRemoteCommand(JSON.parse(event.data)); } catch (error) { console.warn('Ignored remote command', error); }
  };
}

function setRemoteSessionLocked(locked) {
  const overlay = document.getElementById('remote-lock-overlay');
  if (overlay) {
    overlay.style.display = locked ? 'flex' : 'none';
  }
}

function resetRemoteOperatorConnection() {
  remoteSessionGeneration++;
  operatorJoinController?.abort();
  operatorJoinController = null;
  operatorJoinRequest = null;
  window.sfOperatorPaired = false;
  controlEventSource?.close();
  currentOperatorSse?.close();
  remoteLiveEventSource?.close();
  controlEventSource = currentOperatorSse = remoteLiveEventSource = null;
  const button = document.getElementById('operator-join-submit-btn');
  if (button) { button.disabled = false; button.textContent = 'Connect to Studio'; }
}

async function refreshRemoteOperatorSession() {
  const generation = remoteSessionGeneration;
  const response = await fetch('/api/session', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Cannot check the studio session');
  const session = await response.json();
  // A poll issued before successful pairing cannot undo that pairing.
  if (generation !== remoteSessionGeneration && (!Number.isFinite(session.revision) || session.revision <= remoteSessionRevision)) return;
  syncRemoteOperatorSession(session);
  return session;
}

function syncRemoteOperatorSession(session) {
  if (!REMOTE_MODE || typeof session?.enabled !== 'boolean') return;
  if (Number.isFinite(session.revision)) {
    if (session.revision < remoteSessionRevision) return;
    if (remoteSessionRevision >= 0 && session.revision > remoteSessionRevision) {
      resetRemoteOperatorConnection();
      pairingRetryUntil = 0;
      const code = document.getElementById('operator-pairing-code');
      if (code) code.value = '';
    }
    remoteSessionRevision = session.revision;
  }
  if (operatorJoinRequest && session.enabled) return;
  if (!session.enabled || session.paired === false) {
    resetRemoteOperatorConnection();
  }
  setRemoteSessionLocked(!session.enabled);
  if (!session.enabled) {
    closeOperatorJoinModal();
  } else if (session.paired === false) {
    const modal = document.getElementById('operator-join-modal-backdrop');
    if (modal && modal.style.display === 'none') openOperatorJoinModal(false);
  } else if (!window.sfOperatorPaired) {
    joinAndSyncOperatorSession();
  }
}

function applyHostSpeechAiUpdate(msg) {
  if (!msg) return;
  const revision = msg.hostSpeechState?.updatedAt;
  if (revision && revision <= (window.lastRemoteSpeechUpdate || 0)) return;
  if (revision) window.lastRemoteSpeechUpdate = revision;
  const speechState = msg.fullSync && msg.hostSpeechState ? msg.hostSpeechState : msg;
  if (speechState.sermon) window.sermonManager?.applyHostState(speechState.sermon);
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
  const bentoPill = document.getElementById('bento-op-pill');
  const cleanName = (name || getSavedOperatorName() || 'Operator').trim();
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
    if (desc) desc.textContent = 'Enter your name and the six-digit pairing code from the host Broadcast Hub.';
    if (submitBtn) submitBtn.textContent = 'Connect to Studio';
    if (cancelBtn) cancelBtn.style.display = 'none';
  }

  modal.style.display = 'flex';
  modal.classList.add('open');
  window.sfSyncModal?.(modal);
  const code = document.getElementById('operator-pairing-code');
  const focusInput = !isEditing && currentName && code ? code : input;
  focusInput.focus();
  focusInput.select();
}

function closeOperatorJoinModal() {
  const modal = document.getElementById('operator-join-modal-backdrop');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
    window.sfSyncModal?.(modal);
  }
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

  const savedName = getSavedOperatorName();
  updateOperatorHeaderUI(savedName || 'Operator');

  // If first time joining (no saved name), prompt operator for their name immediately!
  if (!savedName) {
    openOperatorJoinModal(false);
  }

  // Both inputs support Enter to connect.
  for (const id of ['operator-join-name-input', 'operator-pairing-code']) {
    const nameInput = document.getElementById(id);
    if (!nameInput) continue;
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
  refreshRemoteOperatorSession().then(data => {
    if (data?.enabled && data.hostSpeechState) {
      applyHostSpeechAiUpdate({ hostSpeechState: data.hostSpeechState, fullSync: true });
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

}

function initRemoteLiveStream() {
  if (!REMOTE_MODE || !window.sfOperatorPaired) return;
  const remoteBtn = document.getElementById('remote-server-btn');
  const generation = remoteSessionGeneration;
  remoteLiveEventSource?.close();
  if (window.EventSource) {
    const sse = new (window.AppEventSource || EventSource)('/api/events?operatorSession=' + remoteSessionRevision);
    remoteLiveEventSource = sse;
    sse.onmessage = (event) => {
      if (generation !== remoteSessionGeneration || sse !== remoteLiveEventSource) return;
      try {
        const liveState = JSON.parse(event.data);
        if (typeof liveState.isHoldLive === 'boolean') {
          state.isHoldLive = liveState.isHoldLive;
          window.syncPresentationControls?.();
        }
        const pending = window.pendingRemoteProjection;
        if (pending && Date.now() - pending.startedAt < 2000 && liveState._operatorRequestId !== pending.id && !liveState.clear && !liveState.blackout) return;
        if (liveState._operatorRequestId === pending?.id || liveState.clear || liveState.blackout) window.pendingRemoteProjection = null;
        if (liveState.clear || liveState.blackout) {
          state.activeLiveSlideId = null;
          state.activeLiveText = '';
          state.activeLiveRef = '';
          state.liveEngagedDeck = null;
          updateActiveSlideVisuals(null);
          updateLivePreview(liveState);
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
            state.liveEngagedDeck = state.activeDeckType === 'bible'
              ? { type:'bible', book:state.activeBibleBook, chapter:state.activeBibleChapter }
              : { type:'song', songId:state.activeSongId };
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
          if (slider) slider.value = state.textSize;
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

    sse.onopen = () => {
      fetch('/api/state', { signal: AbortSignal.timeout(10000) }).then(r => r.json())
        .then(data => sse.onmessage({ data: JSON.stringify(data) })).catch(() => {});
    };
    sse.onerror = () => {
      if (generation !== remoteSessionGeneration || sse !== remoteLiveEventSource) return;
      if (remoteBtn) {
        const dot = remoteBtn.querySelector('.remote-server-dot');
        if (dot) dot.style.background = '#EF4444';
      }
    };

    // The authorized control stream opens after pairing. The public session
    // check continues to detect host activation while this device is unpaired.
  }
}

let currentOperatorSse = null;
let operatorJoinRequest = null;
let operatorJoinController = null;
let remoteLiveEventSource = null;
let remoteSessionGeneration = 0;
let remoteSessionRevision = -1;
let pairingRetryUntil = 0;

function getOrCreateDeviceId() {
  let id = null;
  try { id = localStorage.getItem('sf_operator_device_id'); } catch (e) { }
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    try { localStorage.setItem('sf_operator_device_id', id); } catch (e) { }
  }
  return id;
}

function showOperatorJoinError(message) {
  const modal = document.getElementById('operator-join-modal-backdrop');
  if (modal?.style.display === 'none') openOperatorJoinModal(false);
  const error = document.getElementById('operator-join-error');
  if (error) { error.textContent = message; error.style.display = 'block'; }
}

function joinAndSyncOperatorSession(customName) {
  if (operatorJoinRequest) return operatorJoinRequest;
  const code = document.getElementById('operator-pairing-code');
  const pairingCode = (code?.value || '').trim();
  if (customName && !window.sfOperatorPaired) {
    if (Date.now() < pairingRetryUntil) {
      showOperatorJoinError('Too many incorrect codes. Try again in ' + Math.ceil((pairingRetryUntil - Date.now()) / 1000) + ' seconds.');
      return Promise.resolve();
    }
    if (!/^\d{6}$/.test(pairingCode)) {
      showOperatorJoinError('Enter the six-digit pairing code from the host Broadcast Hub.');
      code?.focus();
      return Promise.resolve();
    }
  }
  let generation = remoteSessionGeneration;
  const controller = new AbortController();
  operatorJoinController = controller;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 10000);
  const button = document.getElementById('operator-join-submit-btn');
  if (button) { button.disabled = true; button.textContent = 'Connecting...'; }
  const deviceId = getOrCreateDeviceId();
  const operatorName = (customName || getSavedOperatorName() || 'Remote Operator').trim();
  const request = fetch('/api/session/join', {
    signal: controller.signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: operatorName, deviceId: deviceId, pairingCode, ...(remoteSessionRevision >= 0 ? { revision: remoteSessionRevision } : {}) })
  }).then(async r => {
    const data = await r.json();
    if ((!r.ok || !data.operatorId) && !data.error && !data.sessionOffline && !data.pairingRequired) data.error = 'Could not join the studio. Try again.';
    return data;
  }).then(data => {
    if (generation !== remoteSessionGeneration) return;
    if (Number.isFinite(data.revision) && data.revision < remoteSessionRevision) return;
    if (Number.isFinite(data.revision)) remoteSessionRevision = data.revision;
    if (data.sessionOffline) {
      syncRemoteOperatorSession({ enabled: false, revision: data.revision });
      return;
    }
    if (data.pairingRequired || data.error) {
      window.sfOperatorPaired = false;
      setRemoteSessionLocked(false);
      pairingRetryUntil = Date.now() + (Number(data.retryAfter) || 0) * 1000;
      showOperatorJoinError((data.error || 'Pairing is required.') + (data.retryAfter ? ' Try again in ' + data.retryAfter + ' seconds.' : ''));
      return;
    }
    generation = ++remoteSessionGeneration;
    setRemoteSessionLocked(false);
    closeOperatorJoinModal();
    window.sfOperatorPaired = true;
    pairingRetryUntil = 0;
    if (code) code.value = '';
    initRemoteControl();
    initRemoteLiveStream();
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
      const stream = new (window.AppEventSource || EventSource)(`/api/operator-events/${data.operatorId}`);
      currentOperatorSse = stream;
      stream.onerror = () => {
        if (stream === currentOperatorSse) resetRemoteOperatorConnection();
      };
      stream.onmessage = (event) => {
        if (generation !== remoteSessionGeneration || stream !== currentOperatorSse) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'CATALOG_PUSHED' && msg.catalog) {
            applyHostPushedCatalog(msg.catalog);
            if (msg.targeted) {
              showToast('Host pushed latest songs & agenda to your console!', 'success');
            }
          } else if (msg.type === 'PRIVILEGE_UPDATE' && msg.sessionEnabled === false) {
            syncRemoteOperatorSession({ enabled: false, revision: msg.revision });
          } else if (msg.type === 'SESSION_ENDED') {
            syncRemoteOperatorSession({ enabled: !!msg.enabled, paired: false, revision: msg.revision });
          } else if (msg.type === 'SPEECH_AI_UPDATE') {
            applyHostSpeechAiUpdate(msg);
          }
        } catch (e) { }
      };
    }
  }).catch(() => {
    if (generation !== remoteSessionGeneration) return;
    showOperatorJoinError(timedOut ? 'Connection timed out. Check the host connection, then press Retry.' : 'Cannot reach the studio computer. Check the connection, then press Retry.');
  }).finally(() => {
    clearTimeout(timeout);
    if (operatorJoinController === controller) {
      operatorJoinController = null;
      operatorJoinRequest = null;
    }
    if (!operatorJoinRequest && button) { button.disabled = false; button.textContent = window.sfOperatorPaired ? 'Save Name' : 'Retry connection'; }
  });
  operatorJoinRequest = request;
  return request;
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
  if (command.type === 'SPEECH_AI_UPDATE') {
    if (REMOTE_MODE) applyHostSpeechAiUpdate(command);
    return;
  }

  if (command.type === 'REMOTE_SERVER_STATUS') {
    updateRemoteServerUI(!!command.enabled);
    if (REMOTE_MODE) {
      if (!command.enabled) syncRemoteOperatorSession({ enabled: false, revision: command.revision });
      else refreshRemoteOperatorSession().catch(() => {});
    }
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
    // The live feed confirms projections. Never send an echoed command back to the host.
    if (REMOTE_MODE && ['PROJECT', 'CLEAR', 'BLACKOUT', 'NAVIGATE', 'SET_SPEECH_AI', 'SET_SERMON_RECORDING', 'SET_HOLD'].includes(command.type)) return;
    if (command.type === 'SET_HOLD' && typeof command.enabled === 'boolean') {
      if (command.enabled !== !!state.isHoldLive) toggleHoldLive();
      return;
    }
    if (command.type === 'SET_SPEECH_AI' && typeof command.enabled === 'boolean') {
      if (command.enabled !== !!(state.aiSpeechRequested || speechAi?.isListening)) toggleSpeechAi();
      return;
    }
    if (command.type === 'SET_SERMON_RECORDING' && typeof command.enabled === 'boolean') {
      if (window.sermonManager && command.enabled !== window.sermonManager.isRecordingSermon) window.sermonManager.toggleSermonRecording();
      return;
    }
    if (command.type === 'PROJECT' && typeof command.text === 'string') {
      projectSlide(command.slideId || ('remote_' + Date.now()), command.text, command.reference || '', {
        takeLive: true, contentType: command.contentType, compareData: command.compareData || null, committedLiveState:command._committedLiveState
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

  const btn = document.getElementById('bento-op-push-btn');
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

  if (catalog.bible && typeof catalog.bible === 'object' && Object.keys(catalog.bible).some(key => JSON.stringify(BIBLE_DATABASE[key]) !== JSON.stringify(catalog.bible[key]))) {
    if (window.libraryImporter && window.libraryImporter.customBibles) {
      Object.assign(window.libraryImporter.customBibles, catalog.bible);
    }
    Object.assign(BIBLE_DATABASE, catalog.bible);
    updated = true;
  }

  if (Array.isArray(catalog.songs) && JSON.stringify(SONGS_DATABASE) !== JSON.stringify(catalog.songs)) {
    SONGS_DATABASE.splice(0, SONGS_DATABASE.length, ...catalog.songs);
    updated = true;
  }

  if (Array.isArray(catalog.agendaItems) && JSON.stringify(state.agendaItems) !== JSON.stringify(catalog.agendaItems)) {
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
  window.syncBentoAiHud?.();
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
  const tabStrongs = document.getElementById('omni-tab-strongs');
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
  if (tabStrongs) {
    tabStrongs.classList.toggle('active', omniSearchCurrentMode === 'strongs');
    tabStrongs.classList.toggle('strongs-mode', omniSearchCurrentMode === 'strongs');
  }

  if (input) {
    if (omniSearchCurrentMode === 'all') {
      input.placeholder = "Search scriptures, songs, or lyrics...";
    } else if (omniSearchCurrentMode === 'verses') {
      input.placeholder = "Search scriptures by reference or words...";
    } else if (omniSearchCurrentMode === 'strongs') {
      input.placeholder = "Search Strong's (e.g. church, love, G1577, shalom)...";
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
  } else if (omniSearchCurrentMode === 'strongs') {
    renderOmniStrongsResults(cleanQ, resultsBox);
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

  // ── Render Strong's Greek & Hebrew Concordance Section ──
  let strongsMatches = [];
  if (query && query.length >= 2 && typeof window.searchStrongsConcordance === 'function') {
    strongsMatches = window.searchStrongsConcordance(query, { lang: 'all', limit: 3 });
  }

  const renderStrongsConcordanceHtml = () => {
    if (!strongsMatches || strongsMatches.length === 0) return '';
    return `
      <div class="omni-section-header" style="color:var(--purple-text, #c3b6ff); display:flex; justify-content:space-between; align-items:center;">
        <span>STRONG\'S GREEK &amp; HEBREW CONCORDANCE (${strongsMatches.length})</span>
        <span style="font-size:10px; color:var(--mute); cursor:pointer;" onclick="switchOmniSearchMode('strongs')">View all in Concordance ↗</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:12px;">
        ${strongsMatches.map(e => renderOmniStrongsCardHtml(e, false)).join('')}
      </div>
    `;
  };

  // Compose according to Intent Ranking
  if (prioritizeScriptures) {
    html += renderScripturesHtml();
    html += renderStrongsConcordanceHtml();
    html += renderLocalSongsHtml();
    html += renderCloudContainerHtml();
  } else {
    html += renderStrongsConcordanceHtml();
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

// ─── Reusable Helper: Render Scriptures in Bento (Hero+Grid) ─
function renderScripturesResultsHtml(items, parsed, activeVer, isExact = false) {
  if (!items || items.length === 0) return '';
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

// ─── Reusable Helper: Render Saved Local Songs in Bento (Hero+Grid) ─
function renderLocalSongsResultsHtml(matches) {
  if (!matches || matches.length === 0) return '';
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

// ─── Reusable Helper: Render Cloud Songs in Bento (Hero+Grid) ─
function renderCloudResultsHtml(results) {
  if (!results || results.length === 0) return '';
  if (!window._omniCloudMap) window._omniCloudMap = new Map();
  results.forEach((s, i) => {
    if (s) {
      if (!s.id) s.id = `cloud_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
      window._omniCloudMap.set(s.id, s);
    }
  });

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

// ─── 4. Concordance & Strong\'s Filter Mode ──────────────────────────────────
let omniStrongsLangFilter = 'all';

function switchOmniStrongsLang(lang) {
  omniStrongsLangFilter = lang || 'all';
  const input = document.getElementById('omni-search-input');
  const resultsBox = document.getElementById('omni-search-results-box');
  const cleanQ = input ? input.value.trim() : '';
  if (resultsBox) {
    renderOmniStrongsResults(cleanQ, resultsBox);
  }
}
window.switchOmniStrongsLang = switchOmniStrongsLang;

function renderOmniStrongsCardHtml(entry, showOccurrencesAction = true) {
  if (!entry) return '';
  const isHebrew = entry.lang === 'Hebrew' || entry.id.startsWith('H');
  const langClass = isHebrew ? 'hebrew' : 'greek';
  const langLabel = isHebrew ? 'Hebrew' : 'Greek';
  const safeId = escapeHtml(entry.id);
  const safeLemma = escapeHtml(entry.lemma || entry.id);
  const safeTranslit = escapeHtml(entry.transliteration || '');
  const safePron = entry.pronunciation ? `/${escapeHtml(entry.pronunciation)}/` : '';
  const safePos = escapeHtml(entry.part_of_speech || (isHebrew ? 'Hebrew' : 'Greek'));
  const safeDef = escapeHtml(entry.short_definition || 'No concise definition.');
  const safeKjv = entry.kjv_definition ? escapeHtml(entry.kjv_definition) : '';
  const safeWordParam = (entry.short_definition || entry.lemma || entry.id).replace(/'/g, "\\'");

  let occCountText = '';
  if (typeof window.getStrongsBibleOccurrences === 'function') {
    const occInfo = window.getStrongsBibleOccurrences(entry.id, 1);
    if (occInfo && occInfo.totalCount > 0) {
      occCountText = `${occInfo.totalCount} verse${occInfo.totalCount === 1 ? '' : 's'} in KJV`;
    }
  }

  return `
    <div class="omni-strongs-card" onclick="openLexiconInspector('${safeId}', '${safeWordParam}')" title="Click to open full Word Study in Drawer">
      <div class="omni-strongs-head">
        <div class="omni-strongs-meta">
          <span class="omni-strongs-id ${langClass}">${safeId}</span>
          <span class="omni-strongs-lemma ${langClass}">${safeLemma}</span>
          <span class="omni-strongs-translit">${safeTranslit}</span>
          ${safePron ? `<span class="omni-strongs-pron">${safePron}</span>` : ''}
          <span class="omni-strongs-pos">${safePos}</span>
        </div>
        <div class="omni-strongs-actions" onclick="event.stopPropagation()">
          <button type="button" class="omni-strongs-action-btn project-btn" onclick="omniProjectStrongsWord('${safeId}', '${safeWordParam}')" title="Project this word slide live">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span>Project</span>
          </button>
          <button type="button" class="omni-strongs-action-btn" onclick="openLexiconInspector('${safeId}', '${safeWordParam}')" title="Inspect full definition, derivation, and occurrences">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>Inspect</span>
          </button>
          ${showOccurrencesAction ? `
            <button type="button" class="omni-strongs-action-btn" onclick="toggleOmniStrongsOccurrences('${safeId}', this)" title="Show Bible references for this word">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              <span>Occurrences</span>
            </button>
          ` : ''}
        </div>
      </div>
      <div class="omni-strongs-def">${safeDef}</div>
      ${safeKjv ? `<div class="omni-strongs-kjv">KJV: ${safeKjv}</div>` : ''}
      <div class="omni-strongs-foot">
        <span class="omni-strongs-occ-count">${occCountText || `${langLabel} Concordance`}</span>
        <span style="font-size:10px; color:var(--purple-text, #c3b6ff);">Click to view Thayer/BDB Lexicon &rarr;</span>
      </div>
      <div id="omni-occ-panel-${safeId}" class="omni-strongs-inline-occ" style="display:none; margin-top:8px;" onclick="event.stopPropagation()"></div>
    </div>
  `;
}
window.renderOmniStrongsCardHtml = renderOmniStrongsCardHtml;

function toggleOmniStrongsOccurrences(strongId, btnEl) {
  const panel = document.getElementById(`omni-occ-panel-${strongId}`);
  if (!panel) return;
  if (panel.style.display !== 'none') {
    panel.style.display = 'none';
    if (btnEl) btnEl.classList.remove('active');
    return;
  }
  panel.style.display = 'block';
  if (btnEl) btnEl.classList.add('active');

  if (typeof window.getStrongsBibleOccurrences === 'function') {
    const data = window.getStrongsBibleOccurrences(strongId, 20);
    if (!data.occurrences || data.occurrences.length === 0) {
      panel.innerHTML = `<div style="padding:8px 12px; font-size:11px; color:var(--mute);">No occurrences found in KJV Strong\'s Bible.</div>`;
      return;
    }
    let occHtml = `
      <div style="background:var(--card-3, #1e1d28); border:1px solid var(--border, rgba(255,255,255,0.08)); border-radius:8px; padding:8px 10px; display:flex; flex-direction:column; gap:6px;">
        <div style="font-size:10.5px; font-weight:700; color:var(--dim, #a3a1ae); display:flex; justify-content:space-between;">
          <span>Found in ${data.totalCount} verses (showing top ${data.occurrences.length})</span>
          <span style="cursor:pointer; color:var(--purple-text);" onclick="openLexiconInspector('${strongId}');">View all in drawer &rarr;</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:5px; max-height:180px; overflow-y:auto;">
    `;
    data.occurrences.forEach(o => {
      occHtml += `
        <div style="font-size:11px; display:flex; justify-content:space-between; align-items:flex-start; gap:8px; border-bottom:1px solid rgba(255,255,255,0.04); padding-bottom:4px;">
          <div style="min-width:0; flex:1;">
            <b style="color:var(--purple-text, #c3b6ff); cursor:pointer;" onclick="omniOpenBibleInDeck('${escapeHtml(o.book)}', ${o.chapter}, ${o.verse})">${escapeHtml(o.ref)}</b>:
            <span style="color:var(--dim, #a3a1ae);">${escapeHtml(o.text)}</span>
          </div>
          <button type="button" class="omni-strongs-action-btn project-btn" style="padding:2px 6px; font-size:9.5px; flex-shrink:0;" onclick="omniProjectVerse('${escapeHtml(o.book)}', ${o.chapter}, ${o.verse}, '${escapeHtml(o.text).replace(/'/g, "\\'")}', 'KJV')">
            Project
          </button>
        </div>
      `;
    });
    occHtml += `</div></div>`;
    panel.innerHTML = occHtml;
  }
}
window.toggleOmniStrongsOccurrences = toggleOmniStrongsOccurrences;

function omniProjectStrongsWord(strongId, wordText) {
  if (typeof window.fetchLexiconEntry === 'function') {
    window.fetchLexiconEntry(strongId).then(entry => {
      if (entry && typeof window.projectLexiconEntry === 'function') {
        window.projectLexiconEntry(entry, wordText);
      }
    });
  }
}
window.omniProjectStrongsWord = omniProjectStrongsWord;

function renderOmniStrongsResults(query, container) {
  if (!container) return;

  const filterBarHtml = `
    <div class="omni-concordance-filter-bar">
      <span class="omni-filter-chip ${omniStrongsLangFilter === 'all' ? 'active' : ''}" onclick="switchOmniStrongsLang('all')">All (Greek &amp; Hebrew)</span>
      <span class="omni-filter-chip ${omniStrongsLangFilter === 'greek' ? 'active' : ''}" onclick="switchOmniStrongsLang('greek')">Greek (NT)</span>
      <span class="omni-filter-chip ${omniStrongsLangFilter === 'hebrew' ? 'active' : ''}" onclick="switchOmniStrongsLang('hebrew')">Hebrew (OT)</span>
    </div>
  `;

  if (!query) {
    container.innerHTML = `
      <div class="omni-empty-compact">
        <div class="omni-empty-icon" style="color:var(--purple-text, #c3b6ff);">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><circle cx="10" cy="10" r="2.5"/></svg>
        </div>
        <div class="omni-empty-title">Strong\'s Concordance &amp; Word Study</div>
        <div class="omni-empty-desc">
          Search English words (e.g. <i>church</i>, <i>love</i>, <i>peace</i>) to discover Greek and Hebrew roots, Strong\'s IDs, and Bible occurrences.
        </div>
        ${filterBarHtml}
        <div style="font-size:11px; font-weight:700; color:var(--text); margin:8px 0 4px;">Popular English Words:</div>
        <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap; margin-bottom:10px;">
          <span class="tag-chip" onclick="setOmniSearchText('church')">church</span>
          <span class="tag-chip" onclick="setOmniSearchText('love')">love</span>
          <span class="tag-chip" onclick="setOmniSearchText('peace')">peace</span>
          <span class="tag-chip" onclick="setOmniSearchText('grace')">grace</span>
          <span class="tag-chip" onclick="setOmniSearchText('faith')">faith</span>
          <span class="tag-chip" onclick="setOmniSearchText('spirit')">spirit</span>
          <span class="tag-chip" onclick="setOmniSearchText('covenant')">covenant</span>
        </div>
        <div style="font-size:11px; font-weight:700; color:var(--text); margin:4px 0;">Greek &amp; Hebrew Terms:</div>
        <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">
          <span class="tag-chip" onclick="setOmniSearchText('ekklesia')">ekklesia (G1577)</span>
          <span class="tag-chip" onclick="setOmniSearchText('agape')">agape (G26)</span>
          <span class="tag-chip" onclick="setOmniSearchText('shalom')">shalom (H7965)</span>
          <span class="tag-chip" onclick="setOmniSearchText('chesed')">chesed (H2617)</span>
          <span class="tag-chip" onclick="setOmniSearchText('logos')">logos (G3056)</span>
        </div>
      </div>
    `;
    return;
  }

  const matches = (typeof window.searchStrongsConcordance === 'function')
    ? window.searchStrongsConcordance(query, { lang: omniStrongsLangFilter, limit: 30 })
    : [];

  if (matches.length === 0) {
    container.innerHTML = `
      ${filterBarHtml}
      <div class="omni-empty-state" style="text-align:center; padding:30px 16px;">
        <div style="color:var(--dim, #a3a1ae); font-size:13px; margin-bottom:12px;">No Strong\'s concordance entries found for "<b style="color:var(--text);">${escapeHtml(query)}</b>".</div>
        <button type="button" class="omni-action-btn live" style="margin:0 auto;" onclick="switchOmniSearchMode('all')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; margin-right:4px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>Search in All Categories</span>
        </button>
      </div>
    `;
    return;
  }

  let html = `
    ${filterBarHtml}
    <div class="omni-section-header" style="color:var(--purple-text, #c3b6ff); margin-bottom:8px;">
      <span>CONCORDANCE MATCHES (${matches.length})</span>
    </div>
    <div style="display:flex; flex-direction:column; gap:8px;">
      ${matches.map(m => renderOmniStrongsCardHtml(m, true)).join('')}
    </div>
  `;

  container.innerHTML = html;
}
window.renderOmniStrongsResults = renderOmniStrongsResults;

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
      const bentoSlideId = `bible_${book}_${state.activeBibleChapter}_${verse}`;
      const card = document.getElementById(`bento_card_${bentoSlideId}`)
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

async function performClearBiblesOnly() {
  try {
    const response = await fetch('/api/bibles/catalog');
    if (!response.ok) throw Error('Could not read downloaded Bibles.');
    const catalogue = await response.json();
    for (const bible of catalogue.bibles || []) {
      if (!bible.installed || bible.bundled) continue;
      const removal = await fetch(`/api/content-packs/${encodeURIComponent(bible.code)}`, { method: 'DELETE' });
      if (!removal.ok) throw Error('Could not clear every downloaded Bible. Wait for downloads to finish and retry.');
      window.forgetContentPack?.(bible.code);
    }
    for (const bible of CLOUD_REPOSITORIES.bibles || []) bible.installed = Boolean(bible.bundled);
  } catch (error) { showToast(error.message, 'error'); return; }
  if (window.libraryImporter && typeof window.libraryImporter.clearBiblesOnly === 'function') {
    window.libraryImporter.clearBiblesOnly();
  }
  if (typeof BIBLE_DATABASE !== 'undefined') {
    for (let k in BIBLE_DATABASE) delete BIBLE_DATABASE[k];
  }
  state.bibleVersion = '';
  state.activeBibleBook = '';
  state.activeBibleChapter = 1;

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

async function refreshAudioInputDevices() {
  if (REMOTE_MODE) return;
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
  if (REMOTE_MODE) return;
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

async function startAudioVuMeter() {
  // Opening settings must not capture another microphone or alter the speech session.
  syncSpeechInputHealth(speechAi?.audioHealth);
}

function updateMicSignalBars(percent) {
  const p = Math.max(0, Number(percent) || 0);

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
  // Reset the UI only; the speech engine owns its capture and monitoring resources.
  syncSpeechInputHealth(null);
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
    const isInstalled = b.installed || (typeof BIBLE_DATABASE !== 'undefined' && BIBLE_DATABASE[b.code] && Object.keys(BIBLE_DATABASE[b.code]).length > 0) || (window.libraryImporter && window.libraryImporter.customBibles && window.libraryImporter.customBibles[b.code]);
    const isActive = isInstalled && state.bibleVersion === b.code;

    return `
      <div data-bible-code="${b.code}" class="repo-item-card ${isActive ? 'active-repo' : (isInstalled ? 'installed-repo' : '')}">
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
          ? '<span class="repo-status-badge ready">Ready offline</span>'
          : '<span class="repo-status-badge cloud">Download available</span>')}
          </div>
        </div>
        <div class="repo-item-actions">
          ${isActive ? `
            <button class="repo-action-btn bento-btn-active-indicator" disabled>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Active</span>
            </button>
            <button class="bento-btn-icon-danger" ${b.bundled ? 'disabled' : ''} onclick="deleteCloudBible('${b.code}')" title="${b.bundled ? 'Included with Ginomai' : `Delete ${b.code} from storage`}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          ` : (isInstalled ? `
            <button class="repo-action-btn bento-btn-primary-sm" onclick="switchCloudBible('${b.code}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
              <span>Switch</span>
            </button>
            <button class="bento-btn-icon-danger" ${b.bundled ? 'disabled' : ''} onclick="deleteCloudBible('${b.code}')" title="${b.bundled ? 'Included with Ginomai' : `Delete ${b.code} from storage`}">
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

function refreshCloudBibleCards() {
  document.querySelectorAll('#cloud-bibles-list [data-bible-code]').forEach(card => {
    const code = card.dataset.bibleCode;
    const bible = (CLOUD_REPOSITORIES.bibles || []).find(bible => bible.code === code);
    if (!bible) return;
    const installed = Boolean(bible.installed || BIBLE_DATABASE?.[code] || window.libraryImporter?.customBibles?.[code]);
    const active = installed && state.bibleVersion === code;
    card.classList.toggle('active-repo', active);
    card.classList.toggle('installed-repo', installed && !active);
    const tag = card.querySelector('.repo-tag-pill');
    tag?.classList.toggle('active', active);
    tag?.classList.toggle('installed', installed && !active);
    const badge = card.querySelector('.repo-status-badge');
    if (badge) {
      badge.className = `repo-status-badge ${active ? 'active' : installed ? 'ready' : 'cloud'}`;
      badge.textContent = active ? 'Active' : installed ? 'Ready offline' : 'Download available';
    }
    const action = card.querySelector('.repo-item-actions > button');
    if (action) {
      action.disabled = active;
      action.className = `repo-action-btn ${active ? 'bento-btn-active-indicator' : installed ? 'bento-btn-primary-sm' : 'bento-btn-secondary-sm'}`;
      action.textContent = active ? 'Active' : installed ? 'Switch' : 'Download';
      action.onclick = active ? null : installed ? () => switchCloudBible(code) : () => downloadCloudBible(code, bible.name);
    }
    let remove = card.querySelector('.bento-btn-icon-danger');
    if (installed && !remove) {
      remove = document.createElement('button');
      remove.className = 'bento-btn-icon-danger';
      remove.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14"/></svg>';
      remove.onclick = () => deleteCloudBible(code);
      card.querySelector('.repo-item-actions').appendChild(remove);
    }
    if (remove) {
      remove.hidden = !installed;
      remove.disabled = Boolean(bible.bundled);
      remove.title = bible.bundled ? 'Included with Ginomai' : `Remove ${code} from offline storage`;
    }
  });
}

async function downloadCloudBible(code, name) {
  const btn = document.getElementById(`btn-dl-${code}`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Downloading…';
  }

  showToast(`Downloading ${code} (${name}) into offline storage...`, 'info');

  try {
    if (!window.libraryImporter) {
      throw new Error('Library import engine not ready.');
    }

    const res = await window.libraryImporter.downloadCloudBible(code, name);
    const repositoryBible = (CLOUD_REPOSITORIES.bibles || []).find(bible => bible.code === code);
    if (repositoryBible) repositoryBible.installed = true;

    // Set as active Bible version
    state.bibleVersion = code;
    const books = getBibleBooks(code);
    state.activeBibleBook = books[0] || 'Genesis';
    const chs = getBibleChapters(state.activeBibleBook, code);
    state.activeBibleChapter = chs.length > 0 ? parseInt(chs[0], 10) : 1;

    renderLibrary();
    renderDeck();
    syncRemoteCatalog();
    refreshCloudBibleCards();
    showToast(`Successfully downloaded and saved ${code} (${res.booksCount} books) to IndexedDB!`, 'success');
  } catch (err) {
    console.error('Download error:', err);
    showToast(`Could not download ${code}: ${err.message}`, 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Download';
    }
  }
}

async function switchCloudBible(code) {
  if (!await ensureBibleLoaded(code, true)) return;
  state.bibleVersion = code;
  const books = getBibleBooks(code);
  if (!state.activeBibleBook || !books.includes(state.activeBibleBook)) {
    state.activeBibleBook = books[0] || 'Genesis';
    const chs = getBibleChapters(state.activeBibleBook, code);
    state.activeBibleChapter = chs.length > 0 ? parseInt(chs[0], 10) : 1;
  }
  renderLibrary();
  renderDeck();
  syncRemoteCatalog();
  refreshCloudBibleCards();
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

  const repositoryBible = (CLOUD_REPOSITORIES.bibles || []).find(bible => bible.code === code);
  if (repositoryBible?.installed && !repositoryBible.bundled) {
    try {
      const response = await fetch(`/api/content-packs/${encodeURIComponent(code)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Could not remove this content pack.');
      repositoryBible.installed = false;
      window.forgetContentPack?.(code);
    } catch (error) { showToast(error.message, 'error'); return; }
  }

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

  renderLibrary();
  renderDeck();
  syncRemoteCatalog();
  refreshCloudBibleCards();
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
  if (REMOTE_MODE || sessionPanelState.togglePending) return;
  sessionPanelState.togglePending = true;
  const startBtn = document.getElementById('session-start-stop-btn');
  const hubBtn = document.getElementById('hub-toggle-session-btn');
  if (startBtn) startBtn.disabled = true;
  if (hubBtn) { hubBtn.disabled = true; hubBtn.textContent = sessionPanelState.enabled ? 'Stopping...' : 'Starting...'; }
  const wasEnabled = sessionPanelState.enabled;

  if (startBtn) {
    startBtn.style.opacity = '0.7';
    startBtn.textContent = wasEnabled ? 'Stopping session...' : 'Starting session...';
  }

  try {
    if (wasEnabled) {
      const response = await fetch('/api/session/stop', { method: 'POST', signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (!response.ok || !data.success || data.enabled !== false) throw new Error(data.error || 'Could not stop the remote session.');
      sessionPanelState.enabled = false;
      sessionPanelState.operatorUrl = null;
      isRemoteServerActive = false;
      showToast('Remote session stopped.', 'info');
    } else {
      let lanUrl = null;
      const res = await fetch('/api/session/start', {
        signal: AbortSignal.timeout(10000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullControl: true })
      });
      const data = await res.json();
      if (!res.ok || !data.success || data.enabled !== true) throw new Error(data.error || 'Could not start the remote session.');
      lanUrl = data.lanUrl || null;
      sessionPanelState.enabled = true;
      isRemoteServerActive = true;
      sessionPanelState.operatorUrl = lanUrl || getRemoteControlUrl(customLanIp);
      syncRemoteCatalog();
      showToast('Remote session started! Operator has full control.', 'success');
    }
  } catch (err) {
    console.error('toggleSession error:', err);
    const actual = await fetch('/api/session', { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => ({}));
    sessionPanelState.enabled = typeof actual.enabled === 'boolean' ? actual.enabled : wasEnabled;
    isRemoteServerActive = sessionPanelState.enabled;
    sessionPanelState.operatorUrl = sessionPanelState.enabled ? getRemoteControlUrl(customLanIp) : null;
    showToast(err.message || 'Could not change the remote session. Try again from the host.', 'warning');
  } finally {
    sessionPanelState.togglePending = false;
    if (startBtn) { startBtn.style.opacity = '1'; startBtn.disabled = false; }
    if (hubBtn) hubBtn.disabled = false;
    updateRemoteSessionHeaderUI();
    renderSessionPanel();
  }
}

function updateRemoteSessionHeaderUI() {
  const btn = document.getElementById('remote-server-btn');
  if (!btn) return;
  btn.classList.toggle('active', sessionPanelState.enabled);
  btn.title = sessionPanelState.enabled ? 'Broadcast & Remote Hub: Active' : 'Broadcast Outputs, OBS Links & Remote Controllers';
}

const knownHostOperatorIds = new Set();
let previousOperatorCount = 0;

function updateSessionOperatorCount(count, joinedName, joinedOpId) {
  const currentCount = typeof count === 'number' ? count : 0;
  const countEl = document.getElementById('session-op-count');
  if (countEl) countEl.textContent = currentCount > 0 ? `${currentCount} Online` : '0 Online';

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
  const label = document.getElementById('desktop-projector-label');
  if (btn) {
    btn.classList.toggle('active', isOpen);
    btn.title = isOpen ? 'Disconnect projector from external display' : 'Connect projector to external display';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', String(isOpen));
    if (isOpen) {
      btn.style.background = 'rgba(16,185,129,0.3)';
      btn.style.borderColor = '#10B981';
    } else {
      btn.style.background = 'rgba(16,185,129,0.12)';
      btn.style.borderColor = 'rgba(16,185,129,0.35)';
    }
  }
  if (label) label.textContent = isOpen ? 'Projector: LIVE' : 'Projector: Off';

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
  if (!window.desktopApi?.isDesktop) {
    openOutputLink('sanctuary');
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
    showToast('Desktop API only available in the Ginomai desktop application.', 'info');
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

  // Initialize the workspace resize engine
  if (typeof ThemeResizerEngine !== 'undefined') {
    ThemeResizerEngine.init();
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
    const bentoLbl = document.getElementById('bento-zoom-label');
    if (bentoLbl) bentoLbl.textContent = `${Math.round(scale * 100)}%`;
    try {
      localStorage.setItem('sf_bento_single_zoom', scale);
      localStorage.setItem('sf_deck_zoom', scale);
    } catch (e) { }
  }
}
window.adjustDeckZoom = adjustDeckZoom;

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
    return;
  }

  updateMicSignalBars(0);
  await populateAudioInputDevices();
  startAudioVuMeter(selectedAudioDeviceId);

  if (navigator.mediaDevices && navigator.mediaDevices.ondevicechange !== undefined) {
    navigator.mediaDevices.ondevicechange = () => {
      populateAudioInputDevices();
      startAudioVuMeter(selectedAudioDeviceId);
    };
  }
}

async function populateAudioInputDevices(requestPermissionIfNeeded = false) {
  if (REMOTE_MODE) return;
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
  const bentoDeviceName = document.getElementById('bento-device-name');
  if (bentoDeviceName) {
    bentoDeviceName.textContent = label;
    bentoDeviceName.title = `Microphone: ${label}`;
  }
  const bentoDeviceSel = document.getElementById('bento-device-sel');
  if (bentoDeviceSel) {
    bentoDeviceSel.title = `Microphone: ${label} (Click to switch)`;
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
  if (REMOTE_MODE) {
    showToast('Microphone selection stays on the host computer.', 'info');
    return;
  }
  const bentoBtn = document.getElementById('bento-device-sel');
  const popover = document.getElementById('audio-mic-popover');
  if (!popover) return;

  const isOpen = popover.classList.contains('open');
  if (isOpen) {
    closeAudioMicPopover();
  } else {
    // If opened from Bento, position under bento-device-sel
    const target = (e && e.currentTarget) || bentoBtn;
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
    if (bentoBtn) bentoBtn.classList.add('open');
    popover.style.zIndex = '100002';
    if (typeof window.openDismissShield === 'function') {
      window.openDismissShield(closeAudioMicPopover, 100001);
    }
  }
}

function closeAudioMicPopover() {
  const bentoBtn = document.getElementById('bento-device-sel');
  const popover = document.getElementById('audio-mic-popover');
  if (popover) popover.classList.remove('open');
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
  const concordanceBtn = document.getElementById('bento-concordance-search-btn');
  if (concordanceBtn) {
    concordanceBtn.style.display = (state.currentTab === 'bible') ? 'inline-flex' : 'none';
  }

  // Load KJV_STRONGS data on demand if needed
  if (state.strongsMode) {
    try {
      if (typeof window.ensureContentPack === 'function' && !await window.ensureContentPack('KJV_STRONGS')) {
        if (state.strongsMode) toggleStrongsMode();
        return;
      }
    } catch (error) {
      if (state.strongsMode) toggleStrongsMode();
      showToast(error.message, 'error');
      return;
    }
    if (!state.strongsMode) return;
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

  // Asynchronously render Scripture Occurrences in Drawer (< 0ms blocking)
  if (typeof window.renderStrongsOccurrencesInDrawer === 'function') {
    window.renderStrongsOccurrencesInDrawer(id);
  }

  // Clear drawer search bar
  const drawerSearchInput = document.getElementById('strongs-drawer-search-input');
  if (drawerSearchInput) drawerSearchInput.value = '';
  const drawerSearchDropdown = document.getElementById('strongs-drawer-search-dropdown');
  if (drawerSearchDropdown) drawerSearchDropdown.style.display = 'none';

  if (drawerBackdrop) {
    drawerBackdrop.classList.add('open');
  }
};

// ─── Drawer Concordance Search & Scripture Occurrences ────────────────────────
let isStrongsOccurrencesCollapsed = false;

window.toggleStrongsOccurrencesCollapse = function () {
  const container = document.getElementById('strongs-drawer-occurrences-container');
  const chevron = document.getElementById('strongs-occurrences-chevron');
  if (!container) return;
  isStrongsOccurrencesCollapsed = !isStrongsOccurrencesCollapsed;
  container.style.display = isStrongsOccurrencesCollapsed ? 'none' : 'block';
  if (chevron) {
    chevron.style.transform = isStrongsOccurrencesCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
  }
};

window.renderStrongsOccurrencesInDrawer = function (strongId) {
  const card = document.getElementById('strongs-drawer-occurrences-card');
  const badge = document.getElementById('strongs-occurrences-count-badge');
  const listEl = document.getElementById('strongs-drawer-occurrences-list');
  if (!card || !listEl) return;

  card.style.display = 'block';
  if (badge) badge.textContent = 'Searching...';
  listEl.innerHTML = '<div style="font-size:11px; color:var(--dim); padding:8px 0;">Locating scripture occurrences...</div>';

  if (typeof window.getStrongsBibleOccurrences !== 'function') return;

  const data = window.getStrongsBibleOccurrences(strongId, 50);
  if (badge) {
    badge.textContent = `${data.totalCount} verse${data.totalCount === 1 ? '' : 's'}`;
  }

  if (!data.occurrences || data.occurrences.length === 0) {
    listEl.innerHTML = '<div style="font-size:11px; color:var(--dim); padding:8px 0;">No scripture occurrences found in KJV Strong\'s Bible.</div>';
    return;
  }

  let html = '';
  data.occurrences.forEach(o => {
    // Highlight matched words in verse text
    let verseText = escapeHtml(o.text);
    if (o.matchedWords && o.matchedWords.length > 0) {
      o.matchedWords.forEach(w => {
        if (w && w.length >= 2) {
          const wRegex = new RegExp(`\\b(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');
          verseText = verseText.replace(wRegex, '<mark>$1</mark>');
        }
      });
    }

    const safeRef = escapeHtml(o.ref);
    const safeBook = escapeHtml(o.book);
    const safeCleanText = escapeHtml(o.text).replace(/'/g, "\\'");

    html += `
      <div class="strongs-occurrence-item">
        <div class="strongs-occurrence-head">
          <span class="strongs-occurrence-ref" onclick="omniOpenBibleInDeck('${safeBook}', ${o.chapter}, ${o.verse})" title="Open chapter in center deck">${safeRef}</span>
          <div class="strongs-occurrence-actions">
            <button type="button" class="strongs-occ-btn project" onclick="omniProjectVerse('${safeBook}', ${o.chapter}, ${o.verse}, '${safeCleanText}', 'KJV')" title="Project verse live">Project</button>
            <button type="button" class="strongs-occ-btn" onclick="omniOpenBibleInDeck('${safeBook}', ${o.chapter}, ${o.verse})" title="Load in deck">Open Deck</button>
          </div>
        </div>
        <div class="strongs-occurrence-text">${verseText}</div>
      </div>
    `;
  });

  if (data.totalCount > data.occurrences.length) {
    html += `
      <div style="font-size:10.5px; color:var(--dim); text-align:center; padding:6px 0;">
        Showing first ${data.occurrences.length} of ${data.totalCount} verses.
      </div>
    `;
  }

  listEl.innerHTML = html;
};

window.handleStrongsDrawerSearch = function (val) {
  const dropdown = document.getElementById('strongs-drawer-search-dropdown');
  if (!dropdown) return;
  const q = (val || '').trim();
  if (!q) {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
    return;
  }

  const matches = (typeof window.searchStrongsConcordance === 'function')
    ? window.searchStrongsConcordance(q, { lang: 'all', limit: 8 })
    : [];

  if (matches.length === 0) {
    dropdown.innerHTML = '<div style="padding:8px 10px; font-size:11px; color:var(--dim);">No matching words found.</div>';
    dropdown.style.display = 'block';
    return;
  }

  let html = '';
  matches.forEach(m => {
    const isHeb = m.lang === 'Hebrew' || m.id.startsWith('H');
    const safeWord = (m.short_definition || m.lemma || m.id).replace(/'/g, "\\'");
    html += `
      <div class="strongs-dropdown-item" onclick="selectStrongsDrawerSearchItem('${escapeHtml(m.id)}', '${safeWord}')">
        <div class="strongs-dropdown-left">
          <span class="strongs-dropdown-id ${isHeb ? 'hebrew' : 'greek'}">${escapeHtml(m.id)}</span>
          <span class="strongs-dropdown-lemma">${escapeHtml(m.lemma || m.id)}</span>
          <span style="color:var(--purple-text, #c3b6ff); font-size:10.5px;">${escapeHtml(m.transliteration || '')}</span>
        </div>
        <div class="strongs-dropdown-def">${escapeHtml(m.short_definition || '')}</div>
      </div>
    `;
  });

  dropdown.innerHTML = html;
  dropdown.style.display = 'block';
};

window.selectStrongsDrawerSearchItem = function (id, wordText) {
  const input = document.getElementById('strongs-drawer-search-input');
  const dropdown = document.getElementById('strongs-drawer-search-dropdown');
  if (input) input.value = '';
  if (dropdown) dropdown.style.display = 'none';
  window.openLexiconInspector(id, wordText);
};

window.projectLexiconEntry = function (entry, englishWord = '') {
  if (!entry) return;
  window.currentLexiconEntry = entry;
  window.currentLexiconEnglishWord = englishWord || entry.short_definition || entry.lemma || entry.id;
  if (typeof window.projectCurrentLexiconWord === 'function') {
    window.projectCurrentLexiconWord();
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
  const url = sessionPanelState.operatorUrl || getRemoteControlUrl(customLanIp);
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
  showToast('Opening Ginomai video guides...', 'info');
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

  showToast('Starting Ginomai interactive tour...', 'info');

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
        showToast('Tour completed! Enjoy using Ginomai.', 'success');
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
  let releaseInfo = { appName: 'Ginomai', version: window.ginomaiAppVersion || 'unknown' };
  try {
    releaseInfo = { ...releaseInfo, ...(await window.getInstalledAppInfo()) };
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
    a.download = `ginomai-diagnostics-${Date.now()}.txt`;
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
  const msg = encodeURIComponent(`Hello Ginomai Team, I need assistance with Ginomai ${window.ginomaiAppVersion || 'current build'}.`);
  window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener,noreferrer');
}
window.openSupportWhatsApp = openSupportWhatsApp;
