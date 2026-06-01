// sleep-timer.js — manages the sleep timer alarm and state

const SleepTimer = {
  /**
   * Starts a sleep timer for the given duration.
   * @param {number} minutes 
   */
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

  /**
   * Cancels the active sleep timer.
   */
  cancel() {
    chrome.alarms.clear('sleepTimer');
    chrome.storage.local.set({ sleepTimer: { active: false } });
    console.log('[MusicPlus] Sleep timer cancelled.');
  },

  /**
   * Gets the current status of the sleep timer.
   * @returns {Promise<Object>}
   */
  getStatus() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['sleepTimer'], (result) => {
        resolve(result.sleepTimer || { active: false });
      });
    });
  },

  /**
   * Registers a callback to run when the sleep timer alarm fires.
   * @param {Function} callback 
   */
  onFired(callback) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'sleepTimer') {
        console.log('[MusicPlus] Sleep timer alarm fired.');
        // We set active to false as soon as it fires
        chrome.storage.local.set({ sleepTimer: { active: false } });
        callback();
      }
    });
  }
};

// Exporting as a global for use in background.js (service worker)
self.SleepTimer = SleepTimer;
