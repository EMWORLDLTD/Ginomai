(() => {
  'use strict';

  const slides = {
    psalm: ['Be still, and know that I am God.', 'PSALM 46:10 · KJV'],
    john: ['For God so loved the world, that he gave his only begotten Son.', 'JOHN 3:16 · KJV'],
    philippians: ['I can do all things through Christ which strengtheneth me.', 'PHILIPPIANS 4:13 · KJV'],
    'grace-one': ['Amazing grace! How sweet the sound\nThat saved a wretch like me!', 'AMAZING GRACE · VERSE 1'],
    'grace-two': ["'Twas grace that taught my heart to fear,\nAnd grace my fears relieved.", 'AMAZING GRACE · VERSE 2'],
    'grace-three': ['Through many dangers, toils and snares,\nI have already come.', 'AMAZING GRACE · VERSE 3'],
    welcome: ["There's a place for you here.", 'WELCOME HOME · WE’RE GLAD YOU’RE HERE'],
    prayer: ["Let's gather. Let's pray.", 'MIDWEEK PRAYER · WEDNESDAY, 6 PM · SAMPLE'],
    community: ['Life is better together.', 'FIND YOUR COMMUNITY · SAMPLE ANNOUNCEMENT']
  };
  const firstSlides = { scripture: 'psalm', lyrics: 'grace-one', announcements: 'welcome' };
  const planIndexes = { scripture: 1, lyrics: 0, announcements: 3 };
  const tabs = Array.from(document.querySelectorAll('[data-demo]'));
  const cards = Array.from(document.querySelectorAll('[data-slide]'));
  const panels = Array.from(document.querySelectorAll('.demo-panel'));
  const planItems = Array.from(document.querySelectorAll('.plan-item'));
  const outputText = document.getElementById('output-text');
  const outputReference = document.getElementById('output-reference');
  let activeCard = cards[0];

  function selectSlide(card) {
    if (activeCard !== card) {
      activeCard.classList.remove('active');
      activeCard.setAttribute('aria-pressed', 'false');
      card.classList.add('active');
      card.setAttribute('aria-pressed', 'true');
      activeCard = card;
    }
    const content = slides[card.dataset.slide];
    outputText.textContent = content[0];
    outputReference.textContent = content[1];
  }

  function selectTab(tab) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    panels.forEach(panel => { panel.hidden = panel.id !== tab.getAttribute('aria-controls'); });
    planItems.forEach((item, index) => item.classList.toggle('selected', index === planIndexes[tab.dataset.demo]));
    selectSlide(cards.find(card => card.dataset.slide === firstSlides[tab.dataset.demo]));
  }

  cards.forEach(card => card.addEventListener('click', () => selectSlide(card)));
  tabs.forEach(tab => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      let index = tabs.indexOf(tab);
      if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') index = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = tabs.length - 1;
      else return;
      event.preventDefault();
      selectTab(tabs[index]);
      tabs[index].focus();
    });
  });

  const menuButton = document.querySelector('.menu-button');
  const mobileNav = document.querySelector('.mobile-nav');
  const shield = document.querySelector('.mobile-nav-shield');
  const behindMenu = [document.querySelector('main'), document.querySelector('footer'), document.querySelector('.site-header .brand'), document.querySelector('.header-cta')];
  function setMenu(open, restoreFocus = false) {
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    mobileNav.hidden = !open;
    shield.hidden = !open;
    behindMenu.forEach(element => { element.inert = open; });
    if (restoreFocus) menuButton.focus();
  }
  menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
  shield.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    setMenu(false, true);
  });
  mobileNav.addEventListener('click', event => {
    if (event.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab' && !mobileNav.hidden) {
      const links = mobileNav.querySelectorAll('a');
      if (event.shiftKey && document.activeElement === menuButton) {
        event.preventDefault();
        links[links.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === links[links.length - 1]) {
        event.preventDefault();
        menuButton.focus();
      }
    }
    if (event.key === 'Escape' && !mobileNav.hidden) {
      event.preventDefault();
      setMenu(false, true);
    }
  });
  const mobileViewport = window.matchMedia('(max-width: 700px)');
  mobileViewport.addEventListener('change', () => setMenu(false));
})();
