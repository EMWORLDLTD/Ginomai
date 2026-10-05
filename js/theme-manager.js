// Ginomia - Theme & Display Customizer Engine
'use strict';

// Early Theme Hydration (Prevents Layout Stacking and Flash of Unstyled Theme on Refresh)
(function() {
  let savedStyle = (typeof localStorage !== 'undefined' && localStorage.getItem('sf_ui_style')) || 'bento';
  if (savedStyle !== 'bento') {
    savedStyle = 'bento';
    try { localStorage.setItem('sf_ui_style', 'bento'); } catch(e) {}
  }
  const savedMode = (typeof localStorage !== 'undefined' && localStorage.getItem('sf_ui_mode')) || 'dark';
  if (typeof document !== 'undefined') {
    if (document.documentElement) {
      document.documentElement.setAttribute('data-theme-style', 'bento');
      document.documentElement.setAttribute('data-theme-mode', savedMode);
    }
    if (document.body) {
      document.body.setAttribute('data-theme-style', savedStyle);
      document.body.setAttribute('data-theme-mode', savedMode);
    } else if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
          document.body.setAttribute('data-theme-style', savedStyle);
          document.body.setAttribute('data-theme-mode', savedMode);
        }
      });
    }
  }
})();

const UI_STYLES = {
  bento: {
    id: 'bento',
    name: 'Bento Studio Pro',
    description: 'Modern bento grid with modular cards, smooth curves, and dense workspace ergonomics.'
  },
  classic: {
    id: 'classic',
    name: 'Classic Studio Pro',
    description: 'Classic high-contrast dark slate broadcast studio console.'
  }
};

const UI_MODES = {
  dark: {
    id: 'dark',
    name: 'Dark Mode'
  },
  light: {
    id: 'light',
    name: 'Light Mode'
  }
};

const THEME_PRESETS = {
  classic_lt: {
    name: 'Classic Lower Third',
    bg: '#0F172A',
    mode: 'lt',
    font: 'Montserrat',
    primaryColor: '#3B82F6'
  },
  modern_broadcast: {
    name: 'Modern Broadcast',
    bg: '#1E1B4B',
    mode: 'lt',
    font: 'Inter',
    primaryColor: '#8B5CF6'
  },
  emerald_church: {
    name: 'Emerald Sanctuary',
    bg: '#064E3B',
    mode: 'full',
    font: 'Montserrat',
    primaryColor: '#10B981'
  },
  deep_dark: {
    name: 'Deep Night Fullscreen',
    bg: '#090D16',
    mode: 'full',
    font: 'Inter',
    primaryColor: '#60A5FA'
  }
};

const SANCTUARY_THEMES = {
  // Motion Video Themes (WebM)
  celestial_motion: {
    id: 'celestial_motion',
    name: 'Celestial Worship',
    type: 'video',
    badge: 'WEBM',
    category: 'motion',
    description: 'Seamless looping motion: deep celestial rays & atmospheric starlight',
    videoUrl: 'Themes/celestial_worship_loop.webm',
    imageUrl: 'Themes/celestial_worship.webp',
    previewGradient: 'radial-gradient(circle at 50% 25%, #2563eb 0%, #0a1128 85%)',
    textColor: '#FFFFFF',
    textShadow: '0 4px 16px rgba(0, 0, 0, 0.95), 0 1px 3px rgba(0, 0, 0, 0.98)',
    headerColor: '#60A5FA',
    font: 'Outfit'
  },
  golden_motion: {
    id: 'golden_motion',
    name: 'Golden Sunrise',
    type: 'video',
    badge: 'WEBM',
    category: 'motion',
    description: 'Seamless looping motion: cathedral golden god-rays and warm light dust',
    videoUrl: 'Themes/golden_sunrise_loop.webm',
    imageUrl: 'Themes/golden_sunrise.webp',
    previewGradient: 'radial-gradient(circle at 50% 20%, #d97706 0%, #1c0e04 80%)',
    textColor: '#FFFBEB',
    textShadow: '0 4px 18px rgba(0, 0, 0, 0.95), 0 1px 4px rgba(0, 0, 0, 0.98)',
    headerColor: '#FBBF24',
    font: 'Cormorant Garamond'
  },
  ember_motion: {
    id: 'ember_motion',
    name: 'Atmospheric Ember',
    type: 'video',
    badge: 'WEBM',
    category: 'motion',
    description: 'Seamless looping motion: modern plum worship stage & drifting golden bokeh',
    videoUrl: 'Themes/atmospheric_ember_loop.webm',
    imageUrl: 'Themes/atmospheric_ember.webp',
    previewGradient: 'radial-gradient(circle at 50% 30%, #7e22ce 0%, #180224 80%)',
    textColor: '#FAF5FF',
    textShadow: '0 4px 16px rgba(0, 0, 0, 0.95), 0 1px 3px rgba(0, 0, 0, 0.98)',
    headerColor: '#C084FC',
    font: 'Outfit'
  },
  emerald_motion: {
    id: 'emerald_motion',
    name: 'Emerald Ambient',
    type: 'video',
    badge: 'WEBM',
    category: 'motion',
    description: 'Seamless looping motion: velvet dark emerald waves with charcoal vignette',
    videoUrl: 'Themes/emerald_ambient_loop.webm',
    imageUrl: 'Themes/emerald_ambient.webp',
    previewGradient: 'radial-gradient(circle at 50% 25%, #059669 0%, #02221b 80%)',
    textColor: '#ECFDF5',
    textShadow: '0 4px 16px rgba(0, 0, 0, 0.95), 0 1px 3px rgba(0, 0, 0, 0.98)',
    headerColor: '#34D399',
    font: 'Outfit'
  },

  // Still Image Themes (WebP)
  celestial_still: {
    id: 'celestial_still',
    name: 'Celestial (Still)',
    type: 'image',
    badge: 'WEBP',
    category: 'still',
    description: 'Crisp 1080p high-res still image: deep celestial rays & atmospheric mist',
    imageUrl: 'Themes/celestial_worship.webp',
    previewGradient: 'radial-gradient(circle at 50% 25%, #2563eb 0%, #0a1128 85%)',
    textColor: '#FFFFFF',
    textShadow: '0 4px 16px rgba(0, 0, 0, 0.95), 0 1px 3px rgba(0, 0, 0, 0.98)',
    headerColor: '#60A5FA',
    font: 'Outfit'
  },
  golden_still: {
    id: 'golden_still',
    name: 'Golden Sunrise (Still)',
    type: 'image',
    badge: 'WEBP',
    category: 'still',
    description: 'Crisp 1080p high-res still image: sacred cathedral amber rays',
    imageUrl: 'Themes/golden_sunrise.webp',
    previewGradient: 'radial-gradient(circle at 50% 20%, #d97706 0%, #1c0e04 80%)',
    textColor: '#FFFBEB',
    textShadow: '0 4px 18px rgba(0, 0, 0, 0.95), 0 1px 4px rgba(0, 0, 0, 0.98)',
    headerColor: '#FBBF24',
    font: 'Cormorant Garamond'
  },
  ember_still: {
    id: 'ember_still',
    name: 'Atmospheric Ember (Still)',
    type: 'image',
    badge: 'WEBP',
    category: 'still',
    description: 'Crisp 1080p high-res still image: worship stage with golden bokeh',
    imageUrl: 'Themes/atmospheric_ember.webp',
    previewGradient: 'radial-gradient(circle at 50% 30%, #7e22ce 0%, #180224 80%)',
    textColor: '#FAF5FF',
    textShadow: '0 4px 16px rgba(0, 0, 0, 0.95), 0 1px 3px rgba(0, 0, 0, 0.98)',
    headerColor: '#C084FC',
    font: 'Outfit'
  },
  emerald_still: {
    id: 'emerald_still',
    name: 'Emerald Ambient (Still)',
    type: 'image',
    badge: 'WEBP',
    category: 'still',
    description: 'Crisp 1080p high-res still image: minimalist jade silk ribbons',
    imageUrl: 'Themes/emerald_ambient.webp',
    previewGradient: 'radial-gradient(circle at 50% 25%, #059669 0%, #02221b 80%)',
    textColor: '#ECFDF5',
    textShadow: '0 4px 16px rgba(0, 0, 0, 0.95), 0 1px 3px rgba(0, 0, 0, 0.98)',
    headerColor: '#34D399',
    font: 'Outfit'
  },

  // Minimal / LED Themes
  obsidian_dark: {
    id: 'obsidian_dark',
    name: 'Obsidian Dark (LED)',
    type: 'gradient',
    badge: 'LED',
    category: 'minimal',
    description: 'Pure 100% black AMOLED & stage LED wall high-contrast mode',
    bgCss: '#000000',
    previewGradient: 'linear-gradient(180deg, #18181b 0%, #000000 100%)',
    textColor: '#FFFFFF',
    textShadow: 'none',
    headerColor: '#E4E4E7',
    font: 'Outfit'
  },
  cathedral_slate: {
    id: 'cathedral_slate',
    name: 'Cathedral Slate',
    type: 'gradient',
    badge: 'GRADIENT',
    category: 'minimal',
    description: 'Architectural charcoal stone & deep graphite for sermon clarity',
    bgCss: 'linear-gradient(180deg, #1e293b 0%, #0f172a 60%, #070b14 100%)',
    previewGradient: 'linear-gradient(180deg, #334155 0%, #0f172a 100%)',
    textColor: '#F8FAFC',
    textShadow: '0 4px 16px rgba(0, 0, 0, 0.88), 0 1px 3px rgba(0, 0, 0, 0.95)',
    headerColor: '#94A3B8',
    font: 'Cinzel'
  },

  // Backward compatibility aliases
  deep_celestial: {
    id: 'deep_celestial',
    name: 'Celestial Worship',
    type: 'video',
    badge: 'WEBM',
    category: 'motion',
    description: 'Seamless looping motion: deep celestial rays & atmospheric starlight',
    videoUrl: 'Themes/celestial_worship_loop.webm',
    imageUrl: 'Themes/celestial_worship.webp',
    previewGradient: 'radial-gradient(circle at 50% 25%, #2563eb 0%, #0a1128 85%)',
    textColor: '#FFFFFF',
    textShadow: '0 4px 16px rgba(0, 0, 0, 0.95), 0 1px 3px rgba(0, 0, 0, 0.98)',
    headerColor: '#60A5FA',
    font: 'Outfit'
  }
};

// Keep the thumbnail fallback palettes available as independent, media-free themes.
for (const [id, source, name] of [
  ['celestial_color', 'celestial_motion', 'Celestial Blue (Gradient)'],
  ['golden_color', 'golden_motion', 'Sunrise Amber (Gradient)'],
  ['ember_color', 'ember_motion', 'Ember Purple (Gradient)'],
  ['emerald_color', 'emerald_motion', 'Emerald Green (Gradient)']
]) {
  const base = SANCTUARY_THEMES[source];
  SANCTUARY_THEMES[id] = {
    id, name, type:'gradient', badge:'GRADIENT', category:'colors',
    bgCss:base.previewGradient, previewGradient:base.previewGradient,
    textColor:base.textColor, headerColor:base.headerColor, textShadow:base.textShadow, font:base.font
  };
}
for (const [id, name, color] of [
  ['solid_blue', 'Midnight Blue (Solid)', '#163a70'],
  ['solid_amber', 'Warm Amber (Solid)', '#714000'],
  ['solid_purple', 'Deep Purple (Solid)', '#4c216a'],
  ['solid_emerald', 'Forest Green (Solid)', '#0c5141']
]) {
  SANCTUARY_THEMES[id] = {
    id, name, type:'gradient', badge:'SOLID', category:'colors',
    bgCss:color, previewGradient:color, textColor:'#FFFFFF', headerColor:'#FFFFFF', textShadow:'none', font:'Outfit'
  };
}

const THEME_ICONS = {
  sun: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  moon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
};

// ── Theme Layout Resizing Specifications Registry ────────────────────────────
// Every existing theme and every new theme added going forward registers its
// layout structure and resizable elements here for universal resize ergonomics.
const THEME_LAYOUT_SPECS = {
  bento: {
    containerSelector: '#bento-layout-root .bento-grid, #bento-grid-workspace, .bento-grid',
    resizers: [
      {
        id: 'bento-resizer-left',
        type: 'column',
        targetSelector: '#bento-col-left, .bento-col-left',
        cssVar: '--bento-sidebar-width',
        storageKey: 'sf_bento_sidebar_width',
        defaultVal: 260,
        min: 180,
        max: 900,
        direction: 'start'
      },
      {
        id: 'bento-resizer-right',
        type: 'column',
        targetSelector: '#bento-col-right, .bento-col-right',
        cssVar: '--bento-preview-width',
        storageKey: 'sf_bento_preview_width',
        defaultVal: 300,
        min: 220,
        max: 700,
        direction: 'end'
      },
      {
        id: 'bento-resizer-agenda',
        type: 'row',
        targetSelector: '#bento-agenda-card, .bento-agenda-card',
        cssVar: '--bento-agenda-height',
        storageKey: 'sf_bento_agenda_height',
        defaultVal: 220,
        min: 80,
        max: 520
      },
      {
        id: 'bento-resizer-preview',
        type: 'row',
        targetSelector: '#bento-prev-card, .bento-prev-card',
        cssVar: '--bento-preview-height',
        storageKey: 'sf_bento_preview_height',
        defaultVal: 250,
        min: 160,
        max: 520
      }
    ]
  },
  classic: {
    containerSelector: '#app-workspace',
    resizers: [
      {
        id: 'resizer-left',
        type: 'column',
        targetSelector: '#zone-library',
        cssVar: '--sidebar-width',
        storageKey: 'sf_sidebar_width',
        defaultVal: 300,
        min: 180,
        max: 600,
        direction: 'start'
      },
      {
        id: 'resizer-right',
        type: 'column',
        targetSelector: '#zone-preview',
        cssVar: '--preview-width',
        storageKey: 'sf_preview_width',
        defaultVal: 370,
        min: 220,
        max: 700,
        direction: 'end'
      },
      {
        id: 'resizer-agenda',
        type: 'row',
        targetSelector: '.sidebar-agenda-card',
        cssVar: '--agenda-height',
        storageKey: 'sf_agenda_height',
        defaultVal: 220,
        min: 80,
        max: 520
      }
    ]
  }
};

// ── Universal Theme Resizing Engine ──────────────────────────────────────────
class ThemeResizerEngine {
  static specs = THEME_LAYOUT_SPECS;
  static boundElements = new WeakSet();

  /**
   * Register a new theme's layout specifications
   * @param {string} themeKey - Key matching UI_STYLES
   * @param {object} layoutSpec - Layout configuration
   */
  static registerThemeLayout(themeKey, layoutSpec) {
    if (!themeKey || !layoutSpec) return;
    this.specs[themeKey] = layoutSpec;
    this.applySavedThemeDimensions(themeKey);
    this.init();
  }

  /**
   * Calculate responsive default value based on current window aspect ratio & size
   */
  static getResponsiveDefault(resizer) {
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 720;
    const isSmallW = winW <= 1280;
    const isShortH = winH <= 760;

    if (resizer.cssVar === '--bento-sidebar-width') {
      return isSmallW ? 220 : 250;
    }
    if (resizer.cssVar === '--bento-preview-width') {
      return isSmallW ? 250 : 285;
    }
    if (resizer.cssVar === '--bento-agenda-height') {
      return isShortH ? Math.max(130, Math.floor(winH * 0.28)) : 220;
    }
    if (resizer.cssVar === '--bento-preview-height') {
      return isShortH ? Math.max(150, Math.floor(winH * 0.32)) : 250;
    }
    if (resizer.cssVar === '--sidebar-width') {
      return isSmallW ? 250 : 300;
    }
    if (resizer.cssVar === '--preview-width') {
      return isSmallW ? 300 : 370;
    }
    if (resizer.cssVar === '--agenda-height') {
      return isShortH ? 160 : 220;
    }
    return resizer.defaultVal;
  }

  /**
   * Apply all saved layout dimensions from localStorage into CSS Custom Properties
   * @param {string} [themeKey] - Specific theme or all registered themes
   */
  static applySavedThemeDimensions(themeKey) {
    const isFormatted = localStorage.getItem('sf_system_formatted') === 'true';
    const themesToApply = themeKey ? [themeKey] : Object.keys(this.specs);
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 720;

    themesToApply.forEach(key => {
      const spec = this.specs[key];
      if (!spec || !spec.resizers) return;

      spec.resizers.forEach(resizer => {
        let val = this.getResponsiveDefault(resizer);
        if (!isFormatted) {
          const saved = localStorage.getItem(resizer.storageKey);
          if (saved !== null && saved !== undefined) {
            const num = parseInt(saved, 10);
            const dynamicMax = resizer.type === 'column' 
              ? Math.min(resizer.max || 700, Math.floor(winW * 0.45)) 
              : Math.min(resizer.max || 520, Math.floor(winH * 0.65));
            if (!isNaN(num) && num >= (resizer.min || 50) && num <= dynamicMax) {
              val = num;
            }
          }
        }
        if (typeof document !== 'undefined' && document.documentElement) {
          document.documentElement.style.setProperty(resizer.cssVar, `${val}px`);
        }
      });
    });

    if (typeof window !== 'undefined' && typeof window.scalePreviewIframe === 'function') {
      window.scalePreviewIframe();
    }
  }

  /**
   * Reset dimensions for a specific theme or all themes to default values
   */
  static resetThemeDimensions(themeKey) {
    const themesToReset = themeKey ? [themeKey] : Object.keys(this.specs);

    themesToReset.forEach(key => {
      const spec = this.specs[key];
      if (!spec || !spec.resizers) return;

      spec.resizers.forEach(resizer => {
        try {
          localStorage.removeItem(resizer.storageKey);
        } catch (e) {}
        const defaultVal = this.getResponsiveDefault(resizer);
        if (typeof document !== 'undefined' && document.documentElement) {
          document.documentElement.style.setProperty(resizer.cssVar, `${defaultVal}px`);
        }
      });
    });

    if (typeof window !== 'undefined' && typeof window.scalePreviewIframe === 'function') {
      window.scalePreviewIframe();
    }
  }

  /**
   * Initialize and attach event listeners to all resizer elements across layouts
   */
  static init() {
    if (typeof document === 'undefined') return;

    this.applySavedThemeDimensions();

    Object.keys(this.specs).forEach(themeKey => {
      const spec = this.specs[themeKey];
      if (!spec || !spec.resizers) return;

      spec.resizers.forEach(resizerConfig => {
        this.bindResizerElement(spec, resizerConfig);
      });
    });

    if (!this._resizeListenerAttached && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this._resizeListenerAttached = true;
      let resizeTimeout = null;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          this.applySavedThemeDimensions();
          if (typeof window.syncBentoStagePreview === 'function') window.syncBentoStagePreview();
        }, 100);
      });
    }
  }

  /**
   * Bind drag and double-click handlers to a single resizer handle
   */
  static bindResizerElement(spec, config) {
    const resizerEl = document.getElementById(config.id) || (config.selector ? document.querySelector(config.selector) : null);
    if (!resizerEl || this.boundElements.has(resizerEl)) return;

    this.boundElements.add(resizerEl);

    // Double-click to restore default size
    resizerEl.ondblclick = (e) => {
      e.preventDefault();
      const defaultVal = this.getResponsiveDefault(config);
      document.documentElement.style.setProperty(config.cssVar, `${defaultVal}px`);
      try {
        localStorage.removeItem(config.storageKey);
      } catch (err) {}
      if (typeof window.scalePreviewIframe === 'function') window.scalePreviewIframe();
      if (typeof window.syncBentoStagePreview === 'function') window.syncBentoStagePreview();
    };

    // Pointerdown to start drag resizing
    resizerEl.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();

      const targetEl = config.targetSelector ? document.querySelector(config.targetSelector) : null;

      resizerEl.classList.add('dragging');
      const isCol = config.type === 'column';
      document.body.style.cursor = isCol ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';

      // Temporarily disable iframe pointer events during drag to prevent mouse capture loss
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(f => { f.style.pointerEvents = 'none'; });

      const pointerId = e.pointerId;
      if (typeof resizerEl.setPointerCapture === 'function' && pointerId !== undefined) {
        try { resizerEl.setPointerCapture(pointerId); } catch (err) {}
      }

      const startX = e.clientX;
      const startY = e.clientY;
      const initialTargetRect = targetEl ? targetEl.getBoundingClientRect() : null;
      let initialTargetSize = this.getResponsiveDefault(config);

      if (initialTargetRect) {
        initialTargetSize = isCol ? initialTargetRect.width : initialTargetRect.height;
      } else {
        const curVal = getComputedStyle(document.documentElement).getPropertyValue(config.cssVar).trim();
        const parsed = parseInt(curVal, 10);
        if (!isNaN(parsed) && parsed > 0) initialTargetSize = parsed;
      }

      const onMove = (moveEvt) => {
        let newSize;

        if (isCol) {
          const deltaX = moveEvt.clientX - startX;
          if (config.direction === 'end') {
            newSize = initialTargetSize - deltaX;
          } else {
            newSize = initialTargetSize + deltaX;
          }
          const winW = window.innerWidth;
          const maxAllowed = Math.min(config.max || 700, Math.floor(winW * 0.45));
          newSize = Math.max(config.min || 180, Math.min(newSize, maxAllowed));
        } else {
          // Row / Height resize
          const deltaY = moveEvt.clientY - startY;
          newSize = initialTargetSize + deltaY;
          const winH = window.innerHeight;
          const maxAllowed = Math.min(config.max || 520, Math.floor(winH * 0.65));
          newSize = Math.max(config.min || 80, Math.min(newSize, maxAllowed));
        }

        document.documentElement.style.setProperty(config.cssVar, `${newSize}px`);
        if (typeof window.scalePreviewIframe === 'function') window.scalePreviewIframe();
        if (typeof window.syncBentoStagePreview === 'function') window.syncBentoStagePreview();
      };

      const onUp = (upEvt) => {
        resizerEl.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        iframes.forEach(f => { f.style.pointerEvents = ''; });

        if (typeof resizerEl.releasePointerCapture === 'function' && pointerId !== undefined) {
          try { resizerEl.releasePointerCapture(pointerId); } catch (err) {}
        }

        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);

        const currentComputed = getComputedStyle(document.documentElement).getPropertyValue(config.cssVar).trim();
        const finalNum = parseInt(currentComputed, 10);
        if (!isNaN(finalNum)) {
          try {
            localStorage.setItem(config.storageKey, finalNum);
          } catch (err) {}
        }

        if (typeof window.scalePreviewIframe === 'function') window.scalePreviewIframe();
        if (typeof window.syncBentoStagePreview === 'function') window.syncBentoStagePreview();
      };

      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      }
    };
  }
}

class ThemeManager {
  constructor(appState, broadcastCallback) {
    this.state = appState || {};
    this.broadcast = broadcastCallback || null;
    this.currentPreset = 'classic_lt';
    
    // Restore UI Style & Mode from localStorage
    let storedStyle = localStorage.getItem('sf_ui_style') || 'bento';
    if (storedStyle !== 'bento') {
      storedStyle = 'bento';
      try { localStorage.setItem('sf_ui_style', 'bento'); } catch(e) {}
    }
    this.currentStyle = storedStyle;
    this.currentMode = localStorage.getItem('sf_ui_mode') || 'dark';

    // Restore Sanctuary Theme Settings
    this.activeSanctuaryTheme = localStorage.getItem('sf_sanctuary_theme') || 'celestial_motion';
    if (!SANCTUARY_THEMES[this.activeSanctuaryTheme] && !this.activeSanctuaryTheme.startsWith('upload_')) {
      this.activeSanctuaryTheme = 'celestial_motion';
    }
    this.sanctuaryDimmer = parseInt(localStorage.getItem('sf_sanctuary_dimmer') || '30', 10);
    this.sanctuaryFont = localStorage.getItem('sf_sanctuary_font') || 'Outfit';
    this.obsModeRule = localStorage.getItem('sf_obs_mode_rule') || 'follow';
    try { this.sanctuaryFits = JSON.parse(localStorage.getItem('sf_sanctuary_fits') || '{}') || {}; } catch { this.sanctuaryFits = {}; }

    this.applyUiTheme();
    ThemeResizerEngine.applySavedThemeDimensions(this.currentStyle);
  }

  beginSanctuaryDraft() {
    this.sanctuaryDraft = {
      activeSanctuaryTheme: this.activeSanctuaryTheme,
      sanctuaryFits: { ...this.sanctuaryFits },
      sanctuaryDimmer: this.sanctuaryDimmer,
      sanctuaryFont: this.sanctuaryFont,
      obsModeRule: this.obsModeRule
    };
  }

  hasSanctuaryDraftChanges() {
    const draft = this.sanctuaryDraft;
    if (!draft) return false;
    return ['activeSanctuaryTheme', 'sanctuaryDimmer', 'sanctuaryFont', 'obsModeRule'].some(key => draft[key] !== this[key]) ||
      Object.keys(draft.sanctuaryFits).some(key => (draft.sanctuaryFits[key] || 'cover') !== (this.sanctuaryFits[key] || 'cover'));
  }

  cancelSanctuaryDraft() {
    this.sanctuaryDraft = null;
    this.updateSanctuaryUi();
  }

  applySanctuaryDraft() {
    if (!this.hasSanctuaryDraftChanges()) return;
    const draft = this.sanctuaryDraft;
    Object.assign(this, draft);
    const saved = {
      sf_sanctuary_theme: this.activeSanctuaryTheme,
      sf_sanctuary_fits: JSON.stringify(this.sanctuaryFits),
      sf_sanctuary_dimmer: this.sanctuaryDimmer,
      sf_sanctuary_font: this.sanctuaryFont,
      sf_obs_mode_rule: this.obsModeRule
    };
    try { Object.entries(saved).forEach(([key, value]) => localStorage.setItem(key, value)); } catch (_) {}
    this.beginSanctuaryDraft();
    this.updateSanctuaryUi();
    this.broadcastSanctuaryTheme();
  }

  setSanctuaryTheme(themeId, broadcast = true) {
    if (!SANCTUARY_THEMES[themeId]) return;
    if (this.sanctuaryDraft) { this.sanctuaryDraft.activeSanctuaryTheme = themeId; this.updateSanctuaryUi(); return; }
    this.activeSanctuaryTheme = themeId;
    try { localStorage.setItem('sf_sanctuary_theme', themeId); } catch(e) {}
    if (broadcast) this.broadcastSanctuaryTheme();
    this.updateSanctuaryUi();
  }

  setSanctuaryFit(value) {
    if (!['cover', 'contain', 'fill'].includes(value)) return;
    if (this.sanctuaryDraft) { this.sanctuaryDraft.sanctuaryFits[this.sanctuaryDraft.activeSanctuaryTheme] = value; this.updateSanctuaryUi(); return; }
    this.sanctuaryFits[this.activeSanctuaryTheme] = value;
    try { localStorage.setItem('sf_sanctuary_fits', JSON.stringify(this.sanctuaryFits)); } catch (_) {}
    this.updateSanctuaryUi();
    this.broadcastSanctuaryTheme();
  }

  setSanctuaryDimmer(dimmerVal) {
    const val = Math.max(0, Math.min(80, parseInt(dimmerVal, 10) || 0));
    if (this.sanctuaryDraft) { this.sanctuaryDraft.sanctuaryDimmer = val; this.updateSanctuaryUi(); return; }
    this.sanctuaryDimmer = val;
    try { localStorage.setItem('sf_sanctuary_dimmer', val); } catch(e) {}
    this.broadcastSanctuaryTheme();
    this.updateSanctuaryUi();
  }

  setSanctuaryFont(fontFamily) {
    if (this.sanctuaryDraft) { this.sanctuaryDraft.sanctuaryFont = fontFamily; this.updateSanctuaryUi(); return; }
    this.sanctuaryFont = fontFamily;
    try { localStorage.setItem('sf_sanctuary_font', fontFamily); } catch(e) {}
    this.broadcastSanctuaryTheme();
    this.updateSanctuaryUi();
  }

  setObsModeRule(rule) {
    const valid = ['follow', 'always_full', 'always_lt'];
    if (this.sanctuaryDraft) { this.sanctuaryDraft.obsModeRule = valid.includes(rule) ? rule : 'follow'; this.updateSanctuaryUi(); return; }
    this.obsModeRule = valid.includes(rule) ? rule : 'follow';
    try { localStorage.setItem('sf_obs_mode_rule', this.obsModeRule); } catch(e) {}
    this.broadcastSanctuaryTheme();
    if (typeof window.broadcastState === 'function') {
      window.broadcastState();
    }
  }

  getSanctuaryPayload(settings = this) {
    const theme = SANCTUARY_THEMES[settings.activeSanctuaryTheme] || SANCTUARY_THEMES.celestial_motion || SANCTUARY_THEMES.deep_celestial;
    return {
      id: settings.activeSanctuaryTheme,
      name: theme.name,
      type: theme.type || 'gradient',
      badge: theme.badge || '',
      category: theme.category,
      fit: ['cover', 'contain', 'fill'].includes(settings.sanctuaryFits[settings.activeSanctuaryTheme]) ? settings.sanctuaryFits[settings.activeSanctuaryTheme] : 'cover',
      width: theme.width || null,
      height: theme.height || null,
      videoUrl: theme.videoUrl || '',
      imageUrl: theme.imageUrl || '',
      bgCss: theme.bgCss || '',
      textColor: theme.textColor,
      textShadow: theme.textShadow,
      headerColor: theme.headerColor,
      font: settings.sanctuaryFont || theme.font,
      dimmer: settings.sanctuaryDimmer,
      obsModeRule: settings.obsModeRule || 'follow'
    };
  }

  broadcastSanctuaryTheme() {
    const payload = this.getSanctuaryPayload();
    if (window.state) {
      window.state.sanctuaryTheme = payload;
    }
    if (typeof window.broadcastState === 'function') {
      window.broadcastState();
    }
    try {
      const ch = new BroadcastChannel('scriptureflow_sync');
      ch.postMessage({ type: 'sanctuary_theme_sync', sanctuaryTheme: payload });
    } catch(e) {}

    if (typeof window.syncBentoStagePreview === 'function') {
      window.syncBentoStagePreview();
    }
  }

  updateSanctuaryUi() {
    const settings = this.sanctuaryDraft || this;
    if (typeof window.updateSanctuaryFramingPreview === 'function') window.updateSanctuaryFramingPreview();
    const curTheme = SANCTUARY_THEMES[this.activeSanctuaryTheme] || SANCTUARY_THEMES.deep_celestial;
    const btnLabel = document.getElementById('bento-sanctuary-theme-name');
    if (btnLabel) {
      btnLabel.textContent = curTheme.name;
    }
    const dimmerLabel = document.getElementById('sanctuary-dimmer-val');
    if (dimmerLabel) {
      dimmerLabel.textContent = `${settings.sanctuaryDimmer}%`;
    }
    const dimmerSlider = document.getElementById('sanctuary-dimmer-slider');
    if (dimmerSlider) {
      dimmerSlider.value = settings.sanctuaryDimmer;
    }

    // Update active highlight in theme popover cards
    document.querySelectorAll('.sanctuary-theme-card').forEach(card => {
      const tid = card.getAttribute('data-theme-id');
      const selected = tid === settings.activeSanctuaryTheme || (settings.activeSanctuaryTheme === 'deep_celestial' && tid === 'celestial_motion');
      card.classList.toggle('active', selected);
      card.classList.toggle('is-applied', tid === this.activeSanctuaryTheme || (this.activeSanctuaryTheme === 'deep_celestial' && tid === 'celestial_motion'));
      card.setAttribute('aria-pressed', String(selected));
    });

    // Update font buttons in popover
    document.querySelectorAll('.sanctuary-font-btn').forEach(btn => {
      const font = btn.getAttribute('data-font');
      btn.classList.toggle('active', font === settings.sanctuaryFont);
      btn.setAttribute('aria-pressed', String(font === settings.sanctuaryFont));
    });

    // Update OBS mode rule select
    const obsRuleSelect = document.getElementById('obs-mode-rule-select');
    if (obsRuleSelect) {
      obsRuleSelect.value = settings.obsModeRule || 'follow';
    }
  }

  setStyle(styleKey) {
    if (!UI_STYLES[styleKey]) return;
    this.currentStyle = styleKey;
    localStorage.setItem('sf_ui_style', styleKey);
    this.applyUiTheme();
    ThemeResizerEngine.applySavedThemeDimensions(styleKey);
    this.updateSettingsUi();
  }

  setMode(modeKey) {
    if (!UI_MODES[modeKey]) return;
    this.currentMode = modeKey;
    localStorage.setItem('sf_ui_mode', modeKey);
    this.applyUiTheme();
    this.updateSettingsUi();
  }

  toggleMode() {
    const nextMode = this.currentMode === 'dark' ? 'light' : 'dark';
    this.setMode(nextMode);
    return nextMode;
  }

  applyUiTheme() {
    const root = document.documentElement;
    const body = document.body;
    
    if (body) {
      body.setAttribute('data-theme-style', this.currentStyle);
      body.setAttribute('data-theme-mode', this.currentMode);
    }
    if (root) {
      root.setAttribute('data-theme-style', this.currentStyle);
      root.setAttribute('data-theme-mode', this.currentMode);
    }

    this.updateHeaderThemeButtons();
  }

  updateHeaderThemeButtons() {
    const isDark = this.currentMode === 'dark';
    // In dark mode, show sun icon to switch to light mode; in light mode, show moon icon to switch to dark mode
    const iconSvg = isDark ? THEME_ICONS.sun : THEME_ICONS.moon;
    const tooltipText = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    const labelText = isDark ? 'Light Mode' : 'Dark Mode';

    const bentoBtn = document.getElementById('bento-theme-mode-toggle');
    if (bentoBtn) {
      bentoBtn.title = tooltipText;
      bentoBtn.setAttribute('aria-label', tooltipText);
      const iconWrap = bentoBtn.querySelector('.sf-menu-icon');
      const labelSpan = bentoBtn.querySelector('.sf-menu-label') || bentoBtn.querySelector('span');
      if (iconWrap && labelSpan) {
        iconWrap.innerHTML = iconSvg;
        labelSpan.textContent = labelText;
      } else if (labelSpan) {
        labelSpan.textContent = labelText;
        const svg = bentoBtn.querySelector('svg');
        if (svg) svg.outerHTML = iconSvg;
        else bentoBtn.insertAdjacentHTML('afterbegin', iconSvg);
      } else {
        bentoBtn.innerHTML = iconSvg;
      }
    }

    const classicBtn = document.getElementById('classic-theme-mode-toggle');
    if (classicBtn) {
      classicBtn.innerHTML = iconSvg;
      classicBtn.title = tooltipText;
      classicBtn.setAttribute('aria-label', tooltipText);
    }
  }

  updateSettingsUi() {
    // Update active state on Theme Style selection cards
    const styleCards = document.querySelectorAll('.theme-style-card');
    styleCards.forEach(card => {
      const styleId = card.getAttribute('data-style-id');
      if (styleId === this.currentStyle) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    // Update active state on Theme Mode buttons
    const modeBtns = document.querySelectorAll('.theme-mode-btn');
    modeBtns.forEach(btn => {
      const modeId = btn.getAttribute('data-mode-id');
      if (modeId === this.currentMode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    this.updateHeaderThemeButtons();
  }

  applyPreset(presetKey) {
    if (!THEME_PRESETS[presetKey]) return;
    const preset = THEME_PRESETS[presetKey];
    this.currentPreset = presetKey;
    if (this.state) {
      this.state.background = preset.bg;
      this.state.currentMode = preset.mode;
    }

    if (this.broadcast) {
      this.broadcast({
        bg: preset.bg,
        mode: preset.mode,
        theme: preset
      });
    }
  }
}

window.UI_STYLES = UI_STYLES;
window.UI_MODES = UI_MODES;
window.THEME_PRESETS = THEME_PRESETS;
window.SANCTUARY_THEMES = SANCTUARY_THEMES;
window.THEME_LAYOUT_SPECS = THEME_LAYOUT_SPECS;
window.ThemeResizerEngine = ThemeResizerEngine;
window.ThemeManager = ThemeManager;

// Auto-bind resizers on DOMContentLoaded or immediate execution
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', () => ThemeResizerEngine.init());
  } else if (document.body) {
    ThemeResizerEngine.init();
  }
}

// ─── Song Theme Binding Functions ─────────────────────────────────────────
function getSongBoundTheme(songId) {
  if (!songId) return null;
  const song = (window.SONGS_DATABASE || []).find(s => s.id === songId);
  if (song && song.themeId) return song.themeId;
  try {
    const bindings = JSON.parse(localStorage.getItem('sf_song_theme_bindings') || '{}');
    return bindings[songId] || null;
  } catch (e) {
    return null;
  }
}
window.getSongBoundTheme = getSongBoundTheme;

function setSongBoundTheme(songId, themeId) {
  if (!songId) return;
  const song = (window.SONGS_DATABASE || []).find(s => s.id === songId);
  if (song) {
    song.themeId = themeId || null;
  }
  try {
    const bindings = JSON.parse(localStorage.getItem('sf_song_theme_bindings') || '{}');
    if (themeId) {
      bindings[songId] = themeId;
    } else {
      delete bindings[songId];
    }
    localStorage.setItem('sf_song_theme_bindings', JSON.stringify(bindings));
  } catch (e) {}

  if (themeId && window.themeManager) {
    window.themeManager.setSanctuaryTheme(themeId);
  }
  const themeName = (themeId && SANCTUARY_THEMES[themeId]) ? SANCTUARY_THEMES[themeId].name : 'Default';
  if (typeof window.showToast === 'function') {
    window.showToast(`Bound "${themeName}" theme to "${song ? song.title : 'song'}"`, 'success');
  }
}
window.setSongBoundTheme = setSongBoundTheme;

function openSongThemeBindingModal(songId) {
  const song = (window.SONGS_DATABASE || []).find(s => s.id === songId);
  if (!song) return;
  const modal = document.getElementById('song-theme-picker-modal-backdrop');
  const targetIdInput = document.getElementById('song-theme-target-song-id');
  const heading = document.getElementById('song-theme-picker-heading');
  const grid = document.getElementById('song-theme-picker-grid');
  if (!modal || !grid) return;

  if (targetIdInput) targetIdInput.value = songId;
  if (heading) heading.textContent = `Attach Theme to "${song.title}"`;

  const boundTheme = getSongBoundTheme(songId);

  const themeKeys = Object.keys(SANCTUARY_THEMES);
  const escapeStr = (s) => (s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '');

  grid.innerHTML = themeKeys.map(k => {
    const t = SANCTUARY_THEMES[k];
    const isSelected = (boundTheme === k);
    const bgStyle = t.previewGradient || '#1e293b';
    const preview = t.imageUrl
      ? `<img class="song-theme-preview-media" src="${escapeStr(t.imageUrl)}" alt="" loading="lazy" decoding="async">`
      : t.videoUrl
        ? `<video class="song-theme-preview-media" src="${escapeStr(t.videoUrl)}" muted playsinline preload="metadata" aria-hidden="true"></video>`
        : '';
    return `
      <div class="song-theme-option-card ${isSelected ? 'active' : ''}" onclick="window.selectSongThemeFromModal('${k}')">
        <div class="song-theme-option-thumb" style="background: ${escapeStr(bgStyle)}; background-size: cover;">
          ${preview}
          <span class="song-theme-thumb-badge">${escapeStr(t.badge || t.category || 'THEME')}</span>
        </div>
        <div class="song-theme-option-title">${escapeStr(t.name)}</div>
      </div>
    `;
  }).join('');

  modal.style.display = 'flex';
}
window.openSongThemeBindingModal = openSongThemeBindingModal;

function closeSongThemeBindingModal() {
  const modal = document.getElementById('song-theme-picker-modal-backdrop');
  if (modal) modal.style.display = 'none';
}
window.closeSongThemeBindingModal = closeSongThemeBindingModal;

function selectSongThemeFromModal(themeId) {
  const targetIdInput = document.getElementById('song-theme-target-song-id');
  const songId = targetIdInput ? targetIdInput.value : null;
  if (songId) {
    setSongBoundTheme(songId, themeId);
  }
  closeSongThemeBindingModal();
}
window.selectSongThemeFromModal = selectSongThemeFromModal;

function detachSongTheme(targetSongId = null) {
  const targetIdInput = document.getElementById('song-theme-target-song-id');
  const songId = targetSongId || (targetIdInput ? targetIdInput.value : null);
  if (songId) {
    setSongBoundTheme(songId, null);
    if (typeof window.showToast === 'function') {
      window.showToast('Reset to global sanctuary theme', 'info');
    }
  }
  closeSongThemeBindingModal();
}
window.detachSongTheme = detachSongTheme;

ThemeManager.prototype.getSongBoundTheme = function(songId) {
  return getSongBoundTheme(songId);
};
ThemeManager.prototype.setSongBoundTheme = function(songId, themeId) {
  return setSongBoundTheme(songId, themeId);
};
ThemeManager.prototype.detachSongTheme = function(songId) {
  return detachSongTheme(songId);
};
