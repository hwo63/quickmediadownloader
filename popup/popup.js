/**
 * QuickMedia Downloader - Popup Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const enableImagesEl = document.getElementById('enableImages');
  const minImageSizeEl = document.getElementById('minImageSize');
  const enableVideosEl = document.getElementById('enableVideos');
  const buttonPositionEl = document.getElementById('buttonPosition');
  const saveAsEl = document.getElementById('saveAs');
  const showNotificationEl = document.getElementById('showNotification');
  const openDownloadsBtn = document.getElementById('open-downloads');

  const statTotalEl = document.getElementById('stat-total');
  const statImagesEl = document.getElementById('stat-images');
  const statVideosEl = document.getElementById('stat-videos');
  const extVersionEl = document.getElementById('ext-version');

  if (extVersionEl && chrome?.runtime?.getManifest) {
    const manifest = chrome.runtime.getManifest();
    extVersionEl.textContent = `Phiên bản ${manifest.version_name || manifest.version}`;
  }

  // Load stats from local storage
  try {
    const { stats = { total: 0, images: 0, videos: 0 } } = await chrome.storage.local.get('stats');
    statTotalEl.textContent = stats.total || 0;
    statImagesEl.textContent = stats.images || 0;
    statVideosEl.textContent = stats.videos || 0;
  } catch (err) {
    console.warn('Failed to load stats:', err);
  }

  // Load settings from sync storage
  let currentSettings = {
    enableImages: true,
    enableVideos: true,
    minImageWidth: 120,
    minImageHeight: 120,
    buttonPosition: 'bottom-right',
    alwaysShowOnVideos: true,
    saveAs: false,
    showNotification: true
  };

  try {
    const stored = await chrome.storage.sync.get('settings');
    if (stored.settings) {
      currentSettings = { ...currentSettings, ...stored.settings };
    }
  } catch (err) {
    console.warn('Failed to load settings:', err);
  }

  // Populate UI
  enableImagesEl.checked = Boolean(currentSettings.enableImages);
  enableVideosEl.checked = Boolean(currentSettings.enableVideos);
  buttonPositionEl.value = currentSettings.buttonPosition || 'top-right';
  saveAsEl.checked = Boolean(currentSettings.saveAs);
  showNotificationEl.checked = currentSettings.showNotification !== false;

  // Set selected minImageSize option
  const currentMinSize = currentSettings.minImageWidth || 120;
  if (['80', '120', '180', '250'].includes(String(currentMinSize))) {
    minImageSizeEl.value = String(currentMinSize);
  } else {
    minImageSizeEl.value = '120';
  }

  // Save and broadcast helper
  async function saveSettings() {
    const minSize = parseInt(minImageSizeEl.value, 10) || 120;
    const newSettings = {
      enableImages: enableImagesEl.checked,
      enableVideos: enableVideosEl.checked,
      minImageWidth: minSize,
      minImageHeight: minSize,
      buttonPosition: buttonPositionEl.value,
      alwaysShowOnVideos: true,
      saveAs: saveAsEl.checked,
      showNotification: showNotificationEl.checked
    };

    await chrome.storage.sync.set({ settings: newSettings });

    // Broadcast to active tabs
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_UPDATED',
            settings: newSettings
          }).catch(() => {
            // Ignore tabs where content script is not loaded
          });
        }
      }
    } catch (err) {
      console.warn('Broadcast failed:', err);
    }
  }

  // Event Listeners
  enableImagesEl.addEventListener('change', saveSettings);
  minImageSizeEl.addEventListener('change', saveSettings);
  enableVideosEl.addEventListener('change', saveSettings);
  buttonPositionEl.addEventListener('change', saveSettings);
  saveAsEl.addEventListener('change', saveSettings);
  showNotificationEl.addEventListener('change', saveSettings);

  // Open Downloads folder / tab
  openDownloadsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://downloads' });
  });
});
