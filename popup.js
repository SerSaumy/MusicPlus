// popup.js — handles the UI logic

let timerInterval = null;

/**
 * Updates the slider's visual progress.
 */
function updateSliderProgress(value) {
    const slider = document.getElementById('timer-slider');
    if (!slider) return;
    const percentage = (value / slider.max) * 100;
    slider.style.setProperty('--progress', `${percentage}%`);
}

function formatMinutes(totalMins) {
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return `${hours.toString().padStart(2, '0')}h${mins.toString().padStart(2, '0')}m`;
}

function updateUI(state) {
    const titleEl = document.getElementById('song-title');
    const artistEl = document.getElementById('artist-name');
    const artEl = document.getElementById('album-art');

    if (state && state.title) {
        titleEl.textContent = state.title;
        artistEl.textContent = state.artist;
        artEl.src = state.albumArt || 'icons/icon128.png';
    } else {
        titleEl.textContent = 'Nothing playing';
        artistEl.textContent = '-';
        artEl.src = 'icons/icon128.png';
    }
}

function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateTimerUI(status) {
    const statusEl = document.getElementById('timer-status');
    const cancelBtn = document.getElementById('cancel-timer');
    const presets = document.querySelectorAll('.preset');
    const slider = document.getElementById('timer-slider');
    const sliderDisplay = document.getElementById('slider-display');

    presets.forEach(p => p.classList.remove('active'));

    if (status && status.active) {
        cancelBtn.classList.remove('hidden');
        slider.value = status.minutesSet;
        updateSliderProgress(status.minutesSet);
        sliderDisplay.textContent = formatMinutes(status.minutesSet);
        
        presets.forEach(p => {
            if (parseInt(p.dataset.mins) === status.minutesSet) {
                p.classList.add('active');
            }
        });

        if (timerInterval) clearInterval(timerInterval);
        const updateCountdown = () => {
            const now = Date.now();
            const end = status.startedAt + (status.minutesSet * 60 * 1000);
            const remaining = end - now;

            if (remaining <= 0) {
                statusEl.textContent = 'off';
                cancelBtn.classList.add('hidden');
                presets.forEach(p => p.classList.remove('active'));
                clearInterval(timerInterval);
                slider.value = 0;
                updateSliderProgress(0);
                sliderDisplay.textContent = '00h00m';
            } else {
                statusEl.textContent = `time remaining: ${formatTime(remaining)}`;
            }
        };
        updateCountdown();
        timerInterval = setInterval(updateCountdown, 1000);
    } else {
        statusEl.textContent = 'off';
        cancelBtn.classList.add('hidden');
        if (timerInterval) clearInterval(timerInterval);
        slider.value = 0;
        updateSliderProgress(0);
        sliderDisplay.textContent = '00h00m';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial State from Storage
    chrome.storage.local.get(['lastMusicState', 'sleepTimer'], (result) => {
        if (result.lastMusicState) updateUI(result.lastMusicState);
        if (result.sleepTimer) updateTimerUI(result.sleepTimer);
    });

    // 2. Preset button listeners
    document.querySelectorAll('.preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const minutes = parseInt(btn.dataset.mins);
            chrome.runtime.sendMessage({ type: 'TIMER_START', payload: { minutes } });
            updateTimerUI({ active: true, minutesSet: minutes, startedAt: Date.now() });
        });
    });

    // 3. Cancel button listener
    document.getElementById('cancel-timer').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'TIMER_CANCEL' });
        updateTimerUI({ active: false });
    });

    // 4. Timer Slider listeners
    const slider = document.getElementById('timer-slider');
    const sliderDisplay = document.getElementById('slider-display');
    
    slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        sliderDisplay.textContent = formatMinutes(val);
        updateSliderProgress(val);
    });

    slider.addEventListener('change', (e) => {
        const minutes = parseInt(e.target.value);
        if (minutes > 0) {
            chrome.runtime.sendMessage({ type: 'TIMER_START', payload: { minutes } });
            updateTimerUI({ active: true, minutesSet: minutes, startedAt: Date.now() });
            updateSliderProgress(minutes);
        } else {
            chrome.runtime.sendMessage({ type: 'TIMER_CANCEL' });
            updateTimerUI({ active: false });
            updateSliderProgress(0);
        }
    });

    // 5. Shortcuts settings
    document.getElementById('open-shortcuts').addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
});

// 6. Listen for storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
        if (changes.lastMusicState) {
            updateUI(changes.lastMusicState.newValue);
        }
        if (changes.sleepTimer) {
            updateTimerUI(changes.sleepTimer.newValue);
        }
    }
});
