// content.js — aggressive detection for MusicPlus

let musicState = { title: '', artist: '', albumArt: '', isPlaying: false };
let isInitialized = false;

/**
 * Deep query selector that penetrates all shadow roots.
 */
function querySelectorDeep(selector, root = document) {
  let el = root.querySelector(selector);
  if (el) return el;
  
  const all = root.querySelectorAll('*');
  for (const item of all) {
    if (item.shadowRoot) {
      el = querySelectorDeep(selector, item.shadowRoot);
      if (el) return el;
    }
  }
  return null;
}

// Aggressive selector lists
const SELECTORS = {
  title: [
    '[data-testid="player-lcd-metadata"] [data-testid="marquee-text-item"]',
    '[data-testid="player-lcd-metadata"] .title',
    '.web-chrome-playback-lcd__song-name-wrapper',
    '.lcd__title',
    '.marquee-label'
  ],
  artist: [
    '[data-testid="player-lcd-metadata"] [data-testid="marquee-text-item-button"]',
    '[data-testid="player-lcd-metadata"] .artist',
    '.web-chrome-playback-lcd__artist-name-wrapper',
    '.lcd__artist'
  ],
  artwork: [
    '[data-testid="player-lcd-artwork"] source',
    '[data-testid="player-lcd-artwork"] img',
    'img.web-chrome-playback-lcd__artwork',
    '.artwork-component img'
  ],
  play: 'button[aria-label="Play"], button.playback-play__play',
  pause: 'button[aria-label="Pause"], button.playback-play__pause'
};

function getMetadata(type) {
  for (const selector of SELECTORS[type]) {
    const el = querySelectorDeep(selector);
    if (el) {
      if (type === 'artwork') {
        if (el.tagName === 'SOURCE' && el.srcset) {
          const parts = el.srcset.split(',');
          return parts[parts.length - 1].trim().split(' ')[0];
        }
        return el.src;
      }
      return el.textContent?.trim() || '';
    }
  }
  return '';
}

function getIsPlaying() {
  const pauseBtn = querySelectorDeep(SELECTORS.pause);
  if (!pauseBtn) return false;
  
  // If we find a pause button, check if it's actually visible/active
  const isHidden = pauseBtn.getAttribute('aria-hidden') === 'true' || 
                   window.getComputedStyle(pauseBtn).display === 'none';
  return !isHidden;
}

function updateState() {
  const newState = {
    title: getMetadata('title'),
    artist: getMetadata('artist'),
    albumArt: getMetadata('artwork'),
    isPlaying: getIsPlaying()
  };

  if (
    newState.title !== musicState.title ||
    newState.artist !== musicState.artist ||
    newState.albumArt !== musicState.albumArt ||
    newState.isPlaying !== musicState.isPlaying
  ) {
    console.log('[MusicPlus] State updated:', newState);
    musicState = newState;
    chrome.runtime.sendMessage({ type: 'STATE_UPDATE', payload: musicState }).catch(() => {});
  }
}

function init() {
  if (isInitialized) return;
  
  // Double check if we actually found something before committing
  if (!getMetadata('title')) return;

  isInitialized = true;
  console.log('[MusicPlus] Player found! Initializing...');

  // Watch for any changes in the entire body since Apple's UI is very dynamic
  const observer = new MutationObserver(updateState);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true
  });

  updateState();
}

/**
 * Diagnostic helper to see what Apple is actually using in the DOM
 */
function runDiagnostics() {
  const testIds = Array.from(document.querySelectorAll('[data-testid]')).map(el => el.getAttribute('data-testid'));
  if (testIds.length > 0) {
    console.log('[MusicPlus] Found data-testids on page:', [...new Set(testIds)]);
  }
}

// Start searching immediately and on every DOM change until found
const arrivalObserver = new MutationObserver(() => {
  if (!isInitialized) init();
});
arrivalObserver.observe(document.documentElement, { childList: true, subtree: true });

// Also check immediately
init();

// Diagnostics if still not found after 10s
setTimeout(() => {
  if (!isInitialized) {
    console.log('[MusicPlus] Still searching for player... Run diagnostics:');
    runDiagnostics();
  }
}, 10000);

// Message listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_STATE') {
    sendResponse(musicState);
  } else if (msg.type === 'STOP_MUSIC') {
    console.log('[MusicPlus] Received STOP_MUSIC command');
    const pauseBtn = querySelectorDeep(SELECTORS.pause);
    if (pauseBtn && !pauseBtn.hasAttribute('aria-hidden')) {
      pauseBtn.click();
    } else {
      // Emergency pause: pause all media elements
      const media = document.querySelectorAll('video, audio');
      media.forEach(m => m.pause());
    }
  } else if (msg.type === 'PLAY_PAUSE' || msg.type === 'NEXT_TRACK' || msg.type === 'PREV_TRACK') {
    let btnSelector = '';
    if (msg.type === 'PLAY_PAUSE') {
      btnSelector = getIsPlaying() ? SELECTORS.pause : SELECTORS.play;
    } else if (msg.type === 'NEXT_TRACK') {
      btnSelector = 'button[aria-label="Next"], amp-playback-controls-item-skip[direction="next"]';
    } else if (msg.type === 'PREV_TRACK') {
      btnSelector = 'button[aria-label="Previous"], amp-playback-controls-item-skip[direction="previous"]';
    }
    
    const btn = querySelectorDeep(btnSelector);
    btn?.click();
  }
});
