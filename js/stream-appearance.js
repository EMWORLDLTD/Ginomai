/* Shared by the studio and production output, including embedded previews. */
(() => {
  const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
  window.normalizeStreamAppearance = (value = {}) => ({
    referenceStyle: value.referenceStyle === 'tab' ? 'tab' : 'inline',
    surface: ['solid', 'image', 'none'].includes(value.surface) ? value.surface : 'solid',
    opacity: clamp(value.opacity, 0, 100, 90),
    height: [20, 28, 35].includes(Number(value.height)) ? Number(value.height) : 28,
    position: clamp(value.position, 0, 100, 50),
    imageUrl: /^\/media\/uploads\/[a-zA-Z0-9_.-]+$/.test(value.imageUrl || '') ? value.imageUrl : ''
  });
  window.applyStreamAppearance = (box, data, enabled) => {
    const active = enabled && !!data.streamAppearance && !data.isLexicon && data.contentType !== 'lexicon';
    box.classList.toggle('broadcast-card', active);
    box.classList.toggle('broadcast-text-only', active && (data.transparentBg || data.streamAppearance.surface==='none'));
    box.classList.remove('broadcast-reference-tab');
    delete box.dataset.bandHeight;
    if (!active) return;
    const style = window.normalizeStreamAppearance(data.streamAppearance);
    box.classList.toggle('broadcast-reference-tab', style.referenceStyle === 'tab');
    box.dataset.bandHeight = style.height;
    // Alpha removes the complete surface, as the existing Stream alpha control promises.
    const alpha = data.transparentBg || style.surface === 'none';
    const shade = `rgba(15,23,42,${style.opacity / 100})`;
    const image = style.surface === 'image' && style.imageUrl;
    const opacity=style.opacity / 100;
    const solid=`linear-gradient(120deg,rgba(38,36,52,${opacity}),rgba(22,24,33,${opacity}) 55%,rgba(13,17,24,${opacity}))`;
    box.style.setProperty('--broadcast-surface', alpha ? 'transparent' : image ? `linear-gradient(${shade},${shade}),url("${style.imageUrl}")` : solid);
    box.style.setProperty('--broadcast-image-position', `center ${style.position}%`);
  };
})();
