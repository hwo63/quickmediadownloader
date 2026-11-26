/**
 * QuickMedia Downloader - Service Worker (Background Script)
 * Manifest V3 compliant
 */

const DEFAULT_SETTINGS = {
  enableImages: true,
  enableVideos: true,
  minImageWidth: 60,
  minImageHeight: 60,
  buttonPosition: 'bottom-right', // 'bottom-right', 'bottom-left', 'top-right', 'top-left'
  alwaysShowOnVideos: true,
  saveAs: false,
  showNotification: true
};

// Initialize settings and context menus on install
chrome.runtime.onInstalled.addListener(async () => {
  // Setup default settings
  const existing = await chrome.storage.sync.get('settings');
  if (!existing.settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  }

  // Setup download stats
  const stats = await chrome.storage.local.get('stats');
  if (!stats.stats) {
    await chrome.storage.local.set({
      stats: { total: 0, images: 0, videos: 0 }
    });
  }

  // Create context menus
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'qm_download_image',
      title: '⬇ Tải hình ảnh này (QuickMedia)',
      contexts: ['image']
    });

    chrome.contextMenus.create({
      id: 'qm_download_video',
      title: '⬇ Tải video này (QuickMedia)',
      contexts: ['video', 'audio']
    });

    chrome.contextMenus.create({
      id: 'qm_download_link',
      title: '⬇ Tải tập tin từ liên kết này',
      contexts: ['link']
    });
  });
});

// Clean and sanitize filename
function sanitizeFilename(filename) {
  if (!filename) return '';
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .trim()
    .substring(0, 150);
}

// Generate smart filename
function generateSmartFilename(url, mediaType = 'image', pageTitle = '') {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const prefix = mediaType === 'video' ? 'video' : 'image';
  const defaultExt = mediaType === 'video' ? 'mp4' : 'jpg';

  let rawName = '';
  let ext = '';

  try {
    if (url.startsWith('data:')) {
      const mime = url.split(';')[0].replace('data:', '');
      const mimeExt = mime.split('/')[1] || defaultExt;
      return `${prefix}_${timestamp}.${mimeExt.replace('+xml', '')}`;
    }

    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    const parts = pathname.split('/').filter(Boolean);
    const lastPart = parts.length > 0 ? parts[parts.length - 1] : '';

    if (lastPart && lastPart.includes('.')) {
      const dotIndex = lastPart.lastIndexOf('.');
      rawName = decodeURIComponent(lastPart.substring(0, dotIndex));
      ext = lastPart.substring(dotIndex + 1).toLowerCase();
      // Cut off extra query parameters or hash from extension if any
      ext = ext.split(/[?#&]/)[0];
    } else if (lastPart) {
      rawName = decodeURIComponent(lastPart);
    }

    // Try query parameters like ?format=jpg or ?ext=png
    if (!ext || ext.length > 5) {
      const formatParam = parsedUrl.searchParams.get('format') ||
                         parsedUrl.searchParams.get('ext') ||
                         parsedUrl.searchParams.get('f');
      if (formatParam && formatParam.length <= 5) {
        ext = formatParam.toLowerCase();
      }
    }
  } catch (err) {
    console.warn('URL parsing error:', err);
  }

  if (!ext || ext.length > 5 || !/^[a-z0-9]+$/i.test(ext)) {
    ext = defaultExt;
  }

  // If rawName is empty, useless or just a generic ID, include page title or domain
  if (!rawName || rawName.length < 2 || rawName === 'view' || rawName === 'media') {
    if (pageTitle) {
      rawName = sanitizeFilename(pageTitle).slice(0, 40) + '_' + timestamp;
    } else {
      rawName = `${prefix}_${timestamp}`;
    }
  } else {
    rawName = sanitizeFilename(rawName);
  }

  return `${rawName}.${ext}`;
}

// Update download statistics
async function incrementStats(mediaType) {
  try {
    const { stats = { total: 0, images: 0, videos: 0 } } = await chrome.storage.local.get('stats');
    stats.total = (stats.total || 0) + 1;
    if (mediaType === 'video') {
      stats.videos = (stats.videos || 0) + 1;
    } else {
      stats.images = (stats.images || 0) + 1;
    }
    await chrome.storage.local.set({ stats });
  } catch (err) {
    console.warn('Stats update failed:', err);
  }
}

// Perform download
async function handleDownload({ url, filename, mediaType = 'image', pageTitle = '', saveAs = false }) {
  if (!url) {
    throw new Error('Không có URL hợp lệ để tải xuống.');
  }

  if (url.startsWith('blob:')) {
    throw new Error('URL dạng blob/MediaSource luồng trực tiếp không hỗ trợ tải trực tiếp qua tiến trình nền.');
  }

  const cleanFilename = filename ? sanitizeFilename(filename) : generateSmartFilename(url, mediaType, pageTitle);

  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: url,
      filename: cleanFilename,
      conflictAction: 'uniquify',
      saveAs: Boolean(saveAs)
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('Download error:', chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!downloadId) {
        reject(new Error('Tải xuống thất bại.'));
      } else {
        incrementStats(mediaType);
        resolve({ downloadId, filename: cleanFilename });
      }
    });
  });
}

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DOWNLOAD_MEDIA') {
    (async () => {
      try {
        const { settings = DEFAULT_SETTINGS } = await chrome.storage.sync.get('settings');
        const saveAs = typeof message.saveAs === 'boolean' ? message.saveAs : settings.saveAs;
        const result = await handleDownload({
          url: message.url,
          filename: message.filename,
          mediaType: message.mediaType || 'image',
          pageTitle: message.pageTitle || sender.tab?.title || '',
          saveAs: saveAs
        });
        sendResponse({ success: true, ...result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }

  if (message.type === 'GET_SETTINGS') {
    (async () => {
      const { settings = DEFAULT_SETTINGS } = await chrome.storage.sync.get('settings');
      sendResponse({ settings });
    })();
    return true;
  }
});

// Context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const targetUrl = info.srcUrl || info.linkUrl;
  if (!targetUrl) return;

  const isVideo = info.menuItemId === 'qm_download_video' ||
    /\.(mp4|webm|ogg|m4v|mov|mkv)(\?.*)?$/i.test(targetUrl);
  const mediaType = isVideo ? 'video' : 'image';

  try {
    const { settings = DEFAULT_SETTINGS } = await chrome.storage.sync.get('settings');
    await handleDownload({
      url: targetUrl,
      mediaType: mediaType,
      pageTitle: tab?.title || '',
      saveAs: settings.saveAs
    });
  } catch (err) {
    console.error('Context menu download failed:', err);
  }
});
