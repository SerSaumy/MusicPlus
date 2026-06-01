// background.js — the brain. coordinates everything so features don't talk to each other directly

let currentState = {
  title: '',
  artist: '',
  albumArt: '',
  isPlaying: false
};

const SleepTimer = {
  start(minutes) {
    chrome.alarms.create('sleepTimer', { delayInMinutes: minutes });
    const timerData = {
      active: true,
      minutesSet: minutes,
      startedAt: Date.now()
    };
    chrome.storage.local.set({ sleepTimer: timerData });
    console.log(`[MusicPlus] Sleep timer started for ${minutes} minutes.`);
  },

  cancel() {
    chrome.alarms.clear('sleepTimer');
    chrome.storage.local.set({ sleepTimer: { active: false } });
    console.log('[MusicPlus] Sleep timer cancelled.');
  },

  getStatus() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['sleepTimer'], (result) => {
        resolve(result.sleepTimer || { active: false });
      });
    });
  },

  onFired() {
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === 'sleepTimer') {
        console.log('[MusicPlus] Sleep timer alarm fired.');
        
        // 1. Mark as inactive in storage immediately
        chrome.storage.local.set({ sleepTimer: { active: false } });

        // 2. Find the tab and stop the music
        const tab = await getAppleMusicTab();
        if (tab) {
          console.log(`[MusicPlus] Sending stop command to tab ${tab.id}`);
          
          // Send message to content script
          chrome.tabs.sendMessage(tab.id, { type: 'STOP_MUSIC' });

          // Fallback: Use executeScript to ensure it stops even if content script is hanging
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              // Try to find any pause button and click it
              const pauseBtns = [
                'button[aria-label="Pause"]',
                'button.playback-play__pause',
                '.web-chrome-playback-controls__playback-btn[aria-label="Pause"]'
              ];
              
              for (const selector of pauseBtns) {
                const btn = document.querySelector(selector);
                if (btn && btn.getAttribute('aria-hidden') !== 'true') {
                  btn.click();
                  console.log('[MusicPlus] Injected stop successful via selector:', selector);
                  return;
                }
              }
              
              // Last resort: find any <video> or <audio> and pause them
              const media = document.querySelectorAll('video, audio');
              media.forEach(m => m.pause());
              console.log('[MusicPlus] Injected stop: paused all media elements');
            }
          }).catch(err => console.error('[MusicPlus] executeScript failed:', err));
        }
      }
    });
  }
};

// Initialize alarm listener
SleepTimer.onFired();

async function getAppleMusicTab() {
  const tabs = await chrome.tabs.query({ url: '*://music.apple.com/*' });
  return tabs.length > 0 ? tabs[0] : null;
}

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'STATE_UPDATE':
      if (message.payload.title) {
        currentState = message.payload;
        chrome.storage.local.set({ lastMusicState: currentState });
      } else if (currentState.title && !message.payload.title) {
        currentState.isPlaying = message.payload.isPlaying;
        chrome.storage.local.set({ lastMusicState: currentState });
      }
      break;

    case 'GET_STATE':
      chrome.storage.local.get(['lastMusicState'], (result) => {
        sendResponse(result.lastMusicState || currentState);
      });
      return true;

    case 'PLAY_PAUSE':
    case 'NEXT_TRACK':
    case 'PREV_TRACK':
      getAppleMusicTab().then(tab => {
        if (tab) {
          chrome.tabs.sendMessage(tab.id, message);
        }
      });
      break;

    case 'TIMER_START':
      SleepTimer.start(message.payload.minutes);
      break;

    case 'TIMER_CANCEL':
      SleepTimer.cancel();
      break;

    case 'TIMER_STATUS':
      SleepTimer.getStatus().then(status => sendResponse(status));
      return true;

    default:
      break;
  }
  return true;
});
