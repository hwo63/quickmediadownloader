/**
 * QuickMedia Downloader - Content Script
 * Minimalist Text-Only Liquid Glass Badges pinned permanently to images and videos
 * - No download arrow icon: only image dimensions (1920×1080 in Ocean Blue) or video quality (1080p, 4K in Emerald Green)
 * - Always visible, fixed right on the media element, never anywhere else
 * - High-refraction see-through frosted glass (macOS / visionOS aesthetic)
 * - Automatic system Dark & Light mode adaptation
 */

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__QM_DOWNLOADER_INJECTED__) return;
  window.__QM_DOWNLOADER_INJECTED__ = true;

  // Platform checks
  const isTwitter = window.location.hostname.includes('x.com') || window.location.hostname.includes('twitter.com');
  const isYouTube = window.location.hostname.includes('youtube.com');

  // Fallback injection of x-interceptor if on Twitter/X
  if (isTwitter && !window.__QM_X_INTERCEPTOR_INSTALLED__) {
    try {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL('content/x-interceptor.js');
      s.onload = () => s.remove();
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {
      console.warn('X-interceptor dynamic injection error:', e);
    }
  }

  // Twitter video cache
  const twitterVideos = new Map(); // tweetId -> { tweetId, text, variants, poster }

  // Listen to messages from x-interceptor.js
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.type === 'QM_TWITTER_VIDEO_DATA' && e.data.data) {
      const item = e.data.data;
      const tid = String(item.tweetId || item.idStr || '');
      if (item.tweetId) twitterVideos.set(String(item.tweetId), item);
      if (item.idStr) twitterVideos.set(String(item.idStr), item);

      // Refresh any matching active video badges on page
      activeBadges.forEach((info, mediaEl) => {
        if (info.type === 'video') {
          const matchId = info.tweetId || findTweetId(mediaEl);
          if (!matchId || matchId === tid || !tid) {
            if (tid) info.tweetId = tid;
            if (item.variants && item.variants.length > 0) {
              const best = item.variants[0];
              info.cachedUrl = best.url;
              info.cachedFilename = `x_${matchId || 'video'}_${formatVariantLabel(best)}.mp4`;
              updateVideoBadgeLabel(mediaEl, info.badgeEl);
            }
          }
        }
      });
    }
  });

  // Settings
  let settings = {
    enableImages: true,
    enableVideos: true,
    minImageWidth: 60,
    minImageHeight: 60,
    buttonPosition: 'bottom-right',
    saveAs: false,
    showNotification: true
  };

  // State management
  let shadowRoot = null;
  let hostEl = null;
  let toastContainer = null;
  let activeDropdown = null;

  // Active Badges Map: mediaElement -> { badgeEl, type, labelEl, dropdownEl, isDownloading }
  const activeBadges = new Map();
  let intersectionObserver = null;
  let mutationObserver = null;
  let isUpdatingPositions = false;

  // Helpers for short video resolution labels
  function getShortResolution(width, height) {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (!w && !h) return '';

    const maxDim = Math.max(w, h);
    const minDim = Math.min(w, h);

    if (maxDim >= 7680 || minDim >= 4320) return '8K';
    if (maxDim >= 5120 || minDim >= 2880) return '5K';
    if (maxDim >= 3840 || minDim >= 2160) return '4K';
    if (maxDim >= 3000 || minDim >= 1600) return '3K';
    if (maxDim >= 2560 || minDim >= 1440) return '2K';
    if (maxDim >= 1920 || minDim >= 1080) return '1080p';
    if (maxDim >= 1280 || minDim >= 720) return '720p';
    if (maxDim >= 854 || minDim >= 480) return '480p';
    if (maxDim >= 640 || minDim >= 360) return '360p';
    return `${minDim}p`;
  }

  // Format exact image dimensions (e.g. 1920×1080)
  function getImageDimensionString(el) {
    if (!el) return 'Tải ảnh';
    const img = (el instanceof HTMLImageElement) ? el : (el.querySelector ? el.querySelector('img') : null);
    let w = 0;
    let h = 0;

    if (img) {
      w = Math.round(img.naturalWidth || 0);
      h = Math.round(img.naturalHeight || 0);
    }

    if (!w || !h) {
      if (el.getBoundingClientRect) {
        const r = el.getBoundingClientRect();
        w = Math.round(r.width || 0);
        h = Math.round(r.height || 0);
      } else {
        w = Math.round(el.offsetWidth || 0);
        h = Math.round(el.offsetHeight || 0);
      }
    }

    if (w > 0 && h > 0) {
      return `${w}×${h}`;
    }
    return 'Tải ảnh';
  }

  // Helper to extract Twitter Tweet ID from DOM
  function findTweetId(el) {
    if (!el) return null;

    const container = el.closest('article[data-testid="tweet"]') ||
                      el.closest('[data-testid="cellInnerDiv"]') ||
                      el.closest('div[data-testid="videoComponent"]') ||
                      el.closest('div[data-testid="videoPlayer"]') ||
                      el.closest('[role="dialog"]') ||
                      el.closest('#layers') ||
                      el.closest('article');

    if (container) {
      const statusLinks = container.querySelectorAll('a[href*="/status/"]');
      for (const link of statusLinks) {
        const match = link.href.match(/\/status\/(\d+)/);
        if (match && match[1]) return match[1];
      }
    }

    let cur = el.parentElement;
    for (let i = 0; i < 6 && cur && cur !== document.body; i++) {
      const link = cur.querySelector ? cur.querySelector('a[href*="/status/"]') : null;
      if (link && link.href) {
        const match = link.href.match(/\/status\/(\d+)/);
        if (match && match[1]) return match[1];
      }
      cur = cur.parentElement;
    }

    const pageMatch = window.location.pathname.match(/\/status\/(\d+)/);
    if (pageMatch && pageMatch[1]) return pageMatch[1];

    return null;
  }

  // Helper to format quality label from Twitter variant URL or bitrate
  function formatVariantLabel(variant) {
    const url = variant.url || '';
    const match = url.match(/\/(\d+x\d+)\//);
    if (match && match[1]) {
      const [w, h] = match[1].split('x').map(Number);
      return getShortResolution(w, h) || 'MP4';
    }
    if (variant.bitrate) {
      if (variant.bitrate >= 5000000) return '4K';
      if (variant.bitrate >= 3000000) return '2K';
      if (variant.bitrate >= 1800000) return '1080p';
      if (variant.bitrate >= 700000) return '720p';
      if (variant.bitrate >= 350000) return '480p';
      return '360p';
    }
    return 'MP4';
  }

  // Helper to get YouTube Video ID
  function getYouTubeVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    const v = urlParams.get('v');
    if (v) return v;
    const match = window.location.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) return match[1];
    return null;
  }

  // Check if media element is occluded by an active modal, dialog, lightbox, or full-screen popup
  function isOccludedByModal(mediaEl) {
    if (!mediaEl) return false;

    // Never consider media occluded if it's currently hovered or focused
    if (hoveredMediaEl === mediaEl) return false;

    // A. Platform-specific handling for Twitter / X.com
    if (isTwitter) {
      const isPhotoViewerOpen = window.location.pathname.includes('/photo/');
      if (isPhotoViewerOpen) {
        // When Twitter's full-screen photo viewer is active:
        // The active photo is inside #layers or [role="dialog"] or [data-testid="swipe-to-dismiss"]
        const inViewer = mediaEl.closest('#layers, [role="dialog"], [data-testid="swipe-to-dismiss"]');
        if (inViewer) return false; // Active photo in viewer -> VISIBLE!
        return true; // Background timeline photo behind the viewer -> OCCLUDED!
      }
      return false; // Normal timeline on Twitter -> NEVER OCCLUDED!
    }

    // B. General websites: check for active full-screen modal / lightbox
    const openModals = document.querySelectorAll(
      'dialog[open], .modal.show, .modal.open, .modal.is-active, .modal.in, .lightbox:not([style*="display: none"]):not(.hidden), .mfp-wrap, .fancybox__container, .pswp--open, #fullImageModal, [aria-modal="true"][role="dialog"]'
    );

    for (const modal of openModals) {
      if (modal === hostEl || (modal.id && modal.id === 'qm-downloader-host')) continue;
      if (modal.contains(mediaEl)) return false; // Content inside active modal is visible

      const mStyle = window.getComputedStyle(modal);
      // Modal must be fixed/absolute, visible, interactive (not pointer-events: none), and opaque
      if (
        (mStyle.position === 'fixed' || mStyle.position === 'absolute') &&
        mStyle.display !== 'none' &&
        mStyle.visibility === 'visible' &&
        mStyle.pointerEvents !== 'none' &&
        parseFloat(mStyle.opacity) > 0.4
      ) {
        const mRect = modal.getBoundingClientRect();
        // Modal must physically cover the viewport (on-screen, not transformed or offscreen)
        if (
          mRect.top <= 60 &&
          mRect.left <= 60 &&
          mRect.bottom >= window.innerHeight * 0.7 &&
          mRect.right >= window.innerWidth * 0.7
        ) {
          return true; // Active full-screen modal covers the page, mediaEl is in background!
        }
      }
    }

    return false;
  }

  // Comprehensive check: Is the media element actually visible on screen and NOT clipped by overflow or covered by modal?
  function isMediaActuallyVisible(mediaEl) {
    if (!mediaEl || !mediaEl.isConnected) return false;

    const isVideo = mediaEl instanceof HTMLVideoElement;

    // 1. Check element's own computed styles
    const style = window.getComputedStyle(mediaEl);
    if (style.display === 'none') return false;
    if (style.visibility !== 'visible') return false;

    // Twitter-specific: Twitter's internal <img> elements often have opacity: 0 while parent is visible
    const isTwitterPhoto = isTwitter && (
      (mediaEl.getAttribute && mediaEl.getAttribute('data-testid') === 'tweetPhoto') ||
      (mediaEl.src && mediaEl.src.includes('twimg.com'))
    );

    // Videos in players (Video.js, Plyr, JWPlayer) often have opacity: 0 before playback while poster shows
    if (!isTwitterPhoto && !isVideo && parseFloat(style.opacity) < 0.05) {
      return false;
    }

    if (isVideo && parseFloat(style.opacity) < 0.05) {
      const pStyle = mediaEl.parentElement ? window.getComputedStyle(mediaEl.parentElement) : null;
      if (!pStyle || pStyle.display === 'none' || pStyle.visibility !== 'visible' || parseFloat(pStyle.opacity) < 0.05) {
        return false;
      }
    }

    // 2. Check geometry and viewport bounds
    const rect = mediaEl.getBoundingClientRect();
    let effRect = rect;
    if (isVideo && (rect.width < 30 || rect.height < 30)) {
      const pRect = mediaEl.parentElement ? mediaEl.parentElement.getBoundingClientRect() : null;
      if (pRect && pRect.width >= 50 && pRect.height >= 30) {
        effRect = pRect;
      } else {
        return false;
      }
    } else if (rect.width < 30 || rect.height < 30) {
      return false;
    }

    // Completely outside viewport?
    if (effRect.bottom <= 0 || effRect.top >= window.innerHeight ||
        effRect.right <= 0 || effRect.left >= window.innerWidth) {
      return false;
    }

    // 3. Check ancestors for hidden, inert, and overflow clipping (carousels, sliders, scroll panels)
    let parent = mediaEl.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      if (parent.hasAttribute('hidden')) {
        return false;
      }

      const pStyle = window.getComputedStyle(parent);
      if (pStyle.display === 'none') return false;
      if (pStyle.visibility !== 'visible') return false;

      // Check overflow clipping (carousels, sliders, scroll panels)
      const ox = pStyle.overflowX;
      const oy = pStyle.overflowY;
      if (ox === 'hidden' || ox === 'clip' || oy === 'hidden' || oy === 'clip') {
        const pRect = parent.getBoundingClientRect();
        if (pRect.width > 20 && pRect.height > 20) {
          // Check if media element is completely clipped out of parent's box
          if (effRect.bottom <= pRect.top + 2 || effRect.top >= pRect.bottom - 2 ||
              effRect.right <= pRect.left + 2 || effRect.left >= pRect.right - 2) {
            return false;
          }
        }
      }
      parent = parent.parentElement;
    }

    // 4. Check if occluded by an active modal / lightbox / popup
    if (isOccludedByModal(mediaEl)) {
      return false;
    }

    return true;
  }

  // Initialize Shadow DOM Container & Styles
  function initUI() {
    if (document.getElementById('qm-downloader-host')) return;

    hostEl = document.createElement('div');
    hostEl.id = 'qm-downloader-host';

    shadowRoot = hostEl.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        pointer-events: none;

        /* macOS / visionOS Liquid Glass - Dark Mode (Default) */
        --qm-glass-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.05) 45%, rgba(0, 0, 0, 0.2) 100%), rgba(20, 26, 38, 0.35);
        --qm-glass-hover-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.32) 0%, rgba(255, 255, 255, 0.08) 45%, rgba(0, 0, 0, 0.25) 100%), rgba(20, 26, 38, 0.45);
        --qm-glass-border: rgba(255, 255, 255, 0.38);
        --qm-glass-border-top: rgba(255, 255, 255, 0.75);
        --qm-glass-border-bottom: rgba(255, 255, 255, 0.18);
        --qm-glass-shadow: inset 0 1px 1px 0 rgba(255, 255, 255, 0.65), inset 0 0 0 1px rgba(255, 255, 255, 0.15), 0 6px 20px -2px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.2);
        --qm-glass-hover-shadow: inset 0 1px 2px 0 rgba(255, 255, 255, 0.85), inset 0 0 0 1px rgba(255, 255, 255, 0.25), 0 8px 24px -2px rgba(0, 0, 0, 0.45);
        --qm-blue-text: #38bdf8;
        --qm-green-text: #22c55e;
        --qm-menu-bg: rgba(18, 24, 36, 0.88);
        --qm-menu-hover: rgba(255, 255, 255, 0.12);
        --qm-text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
      }

      /* macOS / visionOS Liquid Glass - Light Mode */
      @media (prefers-color-scheme: light) {
        :host {
          --qm-glass-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.75) 0%, rgba(255, 255, 255, 0.4) 45%, rgba(240, 246, 255, 0.5) 100%), rgba(255, 255, 255, 0.5);
          --qm-glass-hover-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.88) 0%, rgba(255, 255, 255, 0.55) 45%, rgba(240, 246, 255, 0.65) 100%), rgba(255, 255, 255, 0.65);
          --qm-glass-border: rgba(255, 255, 255, 0.8);
          --qm-glass-border-top: rgba(255, 255, 255, 0.98);
          --qm-glass-border-bottom: rgba(0, 0, 0, 0.08);
          --qm-glass-shadow: inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.95), inset 0 0 0 1px rgba(255, 255, 255, 0.35), 0 6px 18px -2px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06);
          --qm-glass-hover-shadow: inset 0 1px 2px 0 rgba(255, 255, 255, 1), inset 0 0 0 1px rgba(255, 255, 255, 0.5), 0 8px 22px -2px rgba(0, 0, 0, 0.18);
          --qm-blue-text: #0284c7;
          --qm-green-text: #16a34a;
          --qm-menu-bg: rgba(255, 255, 255, 0.9);
          --qm-menu-hover: rgba(0, 0, 0, 0.06);
          --qm-text-shadow: none;
        }
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif;
        user-select: none;
      }

      /* Minimalist Text-Only Liquid Glass Badge (Hover-Activated) */
      .qm-badge {
        position: fixed;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 3.5px 10px;
        min-height: 23px;
        box-sizing: border-box;
        border-radius: 9999px;
        background: var(--qm-glass-bg);
        backdrop-filter: blur(28px) saturate(190%) contrast(105%);
        -webkit-backdrop-filter: blur(28px) saturate(190%) contrast(105%);
        border: 1px solid var(--qm-glass-border);
        border-top-color: var(--qm-glass-border-top);
        border-bottom-color: var(--qm-glass-border-bottom);
        box-shadow: var(--qm-glass-shadow);
        cursor: pointer;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: -0.1px;
        line-height: 1;
        z-index: 2147483647;
        white-space: nowrap;

        /* Hidden by default until hovered */
        opacity: 0;
        pointer-events: none;
        transform: scale(0.92) translateY(2px);
        transition: opacity 0.16s cubic-bezier(0.16, 1, 0.3, 1), transform 0.16s cubic-bezier(0.16, 1, 0.3, 1), background 0.15s ease, box-shadow 0.15s ease;
      }

      /* Visible state on hover */
      .qm-badge.qm-visible {
        opacity: 1;
        pointer-events: auto;
        transform: scale(1) translateY(0);
      }

      .qm-badge.qm-visible:hover {
        transform: scale(1.08) translateY(-1px);
        background: var(--qm-glass-hover-bg);
        box-shadow: var(--qm-glass-hover-shadow);
      }

      .qm-badge:active {
        transform: scale(0.94);
      }

      /* Image Badge: Ocean Blue Text */
      .qm-badge-img {
        color: var(--qm-blue-text);
        text-shadow: var(--qm-text-shadow);
      }

      /* Video Badge: Emerald Green Text */
      .qm-badge-vid {
        color: var(--qm-green-text);
        text-shadow: var(--qm-text-shadow);
      }

      .qm-chevron {
        font-size: 8px;
        line-height: 8px;
        opacity: 0.7;
        margin-left: 1px;
      }

      .qm-badge:hover .qm-chevron {
        opacity: 1;
      }

      /* Liquid Glass Dropdown Menu */
      .qm-dropdown {
        position: absolute;
        bottom: calc(100% + 6px);
        right: 0;
        min-width: 170px;
        background: var(--qm-menu-bg);
        backdrop-filter: blur(28px) saturate(190%) contrast(105%);
        -webkit-backdrop-filter: blur(28px) saturate(190%) contrast(105%);
        border: 1px solid var(--qm-glass-border);
        border-top-color: var(--qm-glass-border-top);
        border-radius: 12px;
        box-shadow: var(--qm-glass-shadow);
        padding: 5px;
        display: none;
        flex-direction: column;
        gap: 3px;
        z-index: 2147483647;
      }

      .qm-dropdown.qm-open {
        display: flex;
        animation: qm-fade-up 0.16s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes qm-fade-up {
        from {
          opacity: 0;
          transform: translateY(6px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .qm-dropdown-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 8px;
        color: #f8fafc;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.12s ease;
      }

      @media (prefers-color-scheme: light) {
        .qm-dropdown-item {
          color: #0f172a;
        }
      }

      .qm-dropdown-item:hover {
        background: var(--qm-menu-hover);
      }

      .qm-dropdown-divider {
        height: 1px;
        background: var(--qm-glass-border);
        margin: 3px 0;
      }

      .qm-spin {
        animation: qm-spin-anim 0.8s linear infinite;
      }

      @keyframes qm-spin-anim {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      /* Liquid Glass Floating Toast */
      .qm-toast-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 2147483647;
        pointer-events: none;
      }

      .qm-toast {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 15px;
        background: var(--qm-menu-bg);
        backdrop-filter: blur(28px) saturate(190%) contrast(105%);
        -webkit-backdrop-filter: blur(28px) saturate(190%) contrast(105%);
        border: 1px solid var(--qm-glass-border);
        border-top-color: var(--qm-glass-border-top);
        border-radius: 9999px;
        color: #f8fafc;
        font-size: 12px;
        font-weight: 600;
        box-shadow: var(--qm-glass-shadow);
        pointer-events: auto;
        opacity: 0;
        transform: translateY(12px) scale(0.96);
        transition: opacity 0.22s ease, transform 0.22s ease;
      }

      @media (prefers-color-scheme: light) {
        .qm-toast {
          color: #0f172a;
        }
      }

      .qm-toast.qm-toast-visible {
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      .qm-toast-success {
        border-left: 3px solid #22c55e;
      }

      .qm-toast-error {
        border-left: 3px solid #ef4444;
      }
    `;

    shadowRoot.appendChild(style);

    // Create Toast Container
    toastContainer = document.createElement('div');
    toastContainer.className = 'qm-toast-container';
    shadowRoot.appendChild(toastContainer);

    (document.body || document.documentElement).appendChild(hostEl);

    // Close any open dropdown when clicking anywhere outside
    document.addEventListener('click', (e) => {
      if (activeDropdown && !activeDropdown.contains(e.target)) {
        activeDropdown.classList.remove('qm-open');
        activeDropdown = null;
      }
    });
  }

  // Toast Notification inside Shadow DOM
  function showToast(message, type = 'success', duration = 3000) {
    if (!settings.showNotification || !toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `qm-toast qm-toast-${type}`;
    const icon = type === 'success' ? '✓' : '⚠️';
    toast.innerHTML = `
      <span style="font-weight:800;font-size:13px;">${icon}</span>
      <span>${escapeHtml(message)}</span>
    `;

    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('qm-toast-visible');
    });

    setTimeout(() => {
      toast.classList.remove('qm-toast-visible');
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Check if an element or image is actually the poster / thumbnail / preview of a video
  function isImagePartOfVideo(el) {
    if (!el) return false;

    // 1. Direct tag check
    if (el instanceof HTMLVideoElement) return true;

    // 2. Element itself contains a <video> inside it
    if (el.querySelector && el.querySelector('video')) return true;

    // 3. Known video player containers and classes
    const videoSelectors = [
      '[data-testid="videoComponent"]',
      '[data-testid="videoPlayer"]',
      '.html5-video-player',
      '#movie_player',
      'ytd-player',
      '.video-player',
      '.video-container',
      '.vjs-poster',
      '.video-js',
      '.plyr',
      '.jwplayer',
      '[data-player]',
      '.ytp-cued-thumbnail-overlay'
    ];
    if (el.closest && el.closest(videoSelectors.join(', '))) {
      return true;
    }

    // 4. Check if immediate parent hierarchy (up to 4 levels) contains a <video> element
    let p = el.parentElement;
    for (let i = 0; i < 4 && p && p !== document.body && p !== document.documentElement; i++) {
      if (p.querySelector('video')) {
        return true;
      }
      p = p.parentElement;
    }

    // 5. Geometry overlap with any active <video> element on the page
    if (el.getBoundingClientRect) {
      const imgRect = el.getBoundingClientRect();
      if (imgRect.width > 20 && imgRect.height > 20) {
        const videos = document.querySelectorAll('video');
        for (const vid of videos) {
          const vRect = vid.getBoundingClientRect();
          if (vRect.width > 20 && vRect.height > 20) {
            const xOverlap = Math.max(0, Math.min(imgRect.right, vRect.right) - Math.max(imgRect.left, vRect.left));
            const yOverlap = Math.max(0, Math.min(imgRect.bottom, vRect.bottom) - Math.max(imgRect.top, vRect.top));
            const overlapArea = xOverlap * yOverlap;
            const imgArea = imgRect.width * imgRect.height;
            if (imgArea > 0 && (overlapArea / imgArea > 0.4)) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  // Check if image is valid for downloading
  function isValidImage(el) {
    if (!el) return false;
    if (el.closest && el.closest('#qm-downloader-host')) return false;

    // CRITICAL: If this element is a video or part of a video player, NEVER treat it as an image!
    if (isImagePartOfVideo(el)) return false;

    // Special handling for Twitter / X.com tweet photos (div[data-testid="tweetPhoto"])
    if (isTwitter && el.getAttribute && el.getAttribute('data-testid') === 'tweetPhoto') {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.width < 50) return false;
      if (rect.height > 0 && rect.height < 50) return false;
      return true;
    }

    if (!(el instanceof HTMLImageElement)) return false;

    // On Twitter, if img is already inside a [data-testid="tweetPhoto"],
    // the badge is mounted on the tweetPhoto container, not the inner 0-opacity img
    if (isTwitter && el.closest('[data-testid="tweetPhoto"]')) {
      return false;
    }

    // Minimum size check (filters out tiny icons, avatars, trackers)
    const minW = Math.min(settings.minImageWidth || 60, 60);
    const minH = Math.min(settings.minImageHeight || 60, 60);

    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.width < minW) return false;
    if (rect.height > 0 && rect.height < minH) return false;

    if (el.naturalWidth > 0 && el.naturalWidth < minW) return false;
    if (el.naturalHeight > 0 && el.naturalHeight < minH) return false;

    const src = el.currentSrc || el.src;
    if (!src || src.includes('blank.gif') || src.includes('spacer.gif')) {
      return false;
    }
    if (src.startsWith('data:image/svg+xml') && !extractBestImageUrl(el)) {
      return false;
    }

    return true;
  }

  // Check if video is valid
  function isValidVideo(video) {
    if (!video || !(video instanceof HTMLVideoElement)) return false;
    if (video.closest('#qm-downloader-host')) return false;

    const rect = video.getBoundingClientRect();
    // Only filter out tiny dummy 1x1 audio placeholders or tracking pixels
    if (rect.width > 0 && rect.width < 25) return false;
    if (rect.height > 0 && rect.height < 25) return false;

    return true;
  }

  // Extract best quality image URL
  function extractBestImageUrl(el) {
    if (!el) return null;

    const targetImg = (el instanceof HTMLImageElement) ? el : (el.querySelector ? el.querySelector('img') : null);
    let src = '';

    if (targetImg) {
      src = targetImg.currentSrc || targetImg.src || '';
    }

    if (!src && el.style && el.style.backgroundImage) {
      const match = el.style.backgroundImage.match(/url\(["']?(https:\/\/[^"']+)["']?\)/);
      if (match && match[1]) src = match[1];
    }

    if (!src && el.querySelector) {
      const bgEl = el.querySelector('[style*="background-image"]');
      if (bgEl && bgEl.style && bgEl.style.backgroundImage) {
        const match = bgEl.style.backgroundImage.match(/url\(["']?(https:\/\/[^"']+)["']?\)/);
        if (match && match[1]) src = match[1];
      }
    }

    if (isTwitter && src) {
      try {
        const u = new URL(src);
        if (u.hostname.includes('twimg.com')) {
          u.searchParams.set('name', 'orig');
          return u.toString();
        }
      } catch (e) {}
      return src.replace(/name=\w+/, 'name=orig');
    }

    if (targetImg) {
      const highResAttrs = [
        'data-original',
        'data-src-zoom',
        'data-zoom-image',
        'data-high-res-src',
        'data-full-url',
        'data-large-file',
        'data-lazy-src',
        'data-src'
      ];

      for (const attr of highResAttrs) {
        const val = targetImg.getAttribute(attr);
        if (val && typeof val === 'string' && val.trim().startsWith('http')) {
          return val.trim();
        }
      }

      if (targetImg.srcset) {
        try {
          const candidates = targetImg.srcset.split(',').map(item => {
            const parts = item.trim().split(/\s+/);
            const url = parts[0];
            let width = 0;
            if (parts[1]) {
              if (parts[1].endsWith('w')) width = parseInt(parts[1], 10);
              if (parts[1].endsWith('x')) width = parseFloat(parts[1]) * 1000;
            }
            return { url, width };
          });

          candidates.sort((a, b) => b.width - a.width);
          if (candidates.length > 0 && candidates[0].url) {
            return candidates[0].url;
          }
        } catch (err) {}
      }
    }

    if (src && src.includes('unsplash.com')) {
      return src.split('?')[0] + '?q=100';
    }

    return src || null;
  }

  // Extract video sources
  function extractVideoSources(video) {
    const sources = [];
    if (!video) return sources;

    const currentSrc = video.currentSrc || video.src;
    if (currentSrc && typeof currentSrc === 'string') {
      sources.push({
        url: currentSrc,
        label: getShortResolution(video.videoWidth, video.videoHeight) || 'Mặc định',
        type: 'video/mp4'
      });
    }

    const sourceElements = video.querySelectorAll('source');
    for (const source of sourceElements) {
      const src = source.src || source.getAttribute('data-src') || source.getAttribute('data-url');
      if (src && !sources.some(s => s.url === src)) {
        const res = source.getAttribute('res') ||
                    source.getAttribute('size') ||
                    source.getAttribute('data-quality') ||
                    'Nguồn khác';
        sources.push({
          url: src,
          label: res,
          type: source.type || 'video/mp4'
        });
      }
    }

    const lazyAttrs = ['data-src', 'data-url', 'data-video-src', 'data-original', 'data-mp4'];
    for (const attr of lazyAttrs) {
      const val = video.getAttribute(attr);
      if (val && typeof val === 'string' && val.startsWith('http') && !sources.some(s => s.url === val)) {
        sources.push({
          url: val,
          label: getShortResolution(video.videoWidth, video.videoHeight) || 'HD',
          type: 'video/mp4'
        });
      }
    }

    return sources;
  }

  // Handle Image Download
  async function handleImageDownload(mediaEl, badgeInfo) {
    if (badgeInfo.isDownloading) return;
    badgeInfo.isDownloading = true;

    const url = badgeInfo.cachedUrl || extractBestImageUrl(mediaEl);
    if (!url) {
      showToast('Không tìm thấy link ảnh để tải.', 'error');
      badgeInfo.isDownloading = false;
      return;
    }

    const originalText = badgeInfo.labelEl.textContent;
    badgeInfo.labelEl.textContent = '...';

    let pageTitle = document.title;
    if (isTwitter) {
      const tweetId = badgeInfo.tweetId || findTweetId(mediaEl);
      if (tweetId) {
        pageTitle = `x_${tweetId}`;
      }
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DOWNLOAD_MEDIA',
        url: url,
        mediaType: 'image',
        pageTitle: pageTitle
      });

      if (response && response.success) {
        badgeInfo.labelEl.textContent = '✓';
        showToast(`Đã tải: ${response.filename || 'ảnh'}`, 'success');
      } else {
        throw new Error(response?.error || 'Tải ảnh thất bại.');
      }
    } catch (err) {
      showToast(`Lỗi: ${err.message}`, 'error');
    } finally {
      setTimeout(() => {
        badgeInfo.labelEl.textContent = originalText;
        badgeInfo.isDownloading = false;
      }, 1500);
    }
  }

  // Handle Video Download
  async function handleVideoDownload(video, badgeInfo, customUrl = null, customFilename = null) {
    if (badgeInfo.isDownloading) return;

    // Special Smart Handling for YouTube
    if (isYouTube && !customUrl) {
      toggleYouTubeDropdown(video, badgeInfo);
      return;
    }

    badgeInfo.isDownloading = true;

    let videoUrl = customUrl || badgeInfo.cachedUrl;
    let targetFilename = customFilename || badgeInfo.cachedFilename;

    const originalText = badgeInfo.labelEl.textContent;

    // Special Handling for X.com (Twitter)
    if (isTwitter && (!videoUrl || videoUrl.startsWith('blob:'))) {
      const tweetId = badgeInfo.tweetId || findTweetId(video);
      let info = tweetId ? twitterVideos.get(tweetId) : null;

      if (!info || !info.variants || info.variants.length === 0) {
        badgeInfo.labelEl.textContent = '...';
        window.postMessage({ type: 'QM_REQUEST_TWEET_MEDIA', tweetId }, '*');

        info = await new Promise((resolve) => {
          let timer = null;
          const handler = (e) => {
            if (e.data?.type === 'QM_TWITTER_VIDEO_DATA') {
              const d = e.data.data;
              if (!tweetId || String(d?.tweetId) === String(tweetId) || String(d?.idStr) === String(tweetId)) {
                window.removeEventListener('message', handler);
                clearTimeout(timer);
                resolve(d);
              }
            }
          };
          window.addEventListener('message', handler);
          timer = setTimeout(() => {
            window.removeEventListener('message', handler);
            resolve(tweetId ? twitterVideos.get(tweetId) : null);
          }, 2500);
        });
      }

      if (info && info.variants && info.variants.length > 0) {
        const bestVariant = info.variants[0];
        videoUrl = bestVariant.url;
        badgeInfo.cachedUrl = videoUrl;
        const resLabel = formatVariantLabel(bestVariant);
        targetFilename = `x_${tweetId || 'video'}_${resLabel}.mp4`;
        badgeInfo.cachedFilename = targetFilename;
        badgeInfo.labelEl.textContent = resLabel;
      }
    }

    if (!videoUrl || videoUrl.startsWith('blob:')) {
      const sources = extractVideoSources(video);
      const validSource = sources.find(s => s.url && !s.url.startsWith('blob:'));
      if (validSource) {
        videoUrl = validSource.url;
        targetFilename = validSource.filename || targetFilename;
      }
    }

    if (!videoUrl || videoUrl.startsWith('blob:')) {
      badgeInfo.labelEl.textContent = originalText;
      badgeInfo.isDownloading = false;
      if (isTwitter) {
        showToast('Không tìm thấy link MP4 của video này trên X.', 'error', 3500);
      } else {
        showToast('⚠️ Video này phát dạng luồng MediaSource/HLS, không hỗ trợ tải trực tiếp.', 'error', 4000);
      }
      return;
    }

    badgeInfo.labelEl.textContent = '...';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DOWNLOAD_MEDIA',
        url: videoUrl,
        mediaType: 'video',
        pageTitle: targetFilename || document.title
      });

      if (response && response.success) {
        badgeInfo.labelEl.textContent = '✓';
        showToast(`Đang tải video: ${response.filename || 'video.mp4'}`, 'success');
      } else {
        throw new Error(response?.error || 'Tải video thất bại.');
      }
    } catch (err) {
      showToast(`Lỗi: ${err.message}`, 'error');
    } finally {
      setTimeout(() => {
        badgeInfo.labelEl.textContent = originalText;
        badgeInfo.isDownloading = false;
      }, 1500);
    }
  }

  // YouTube Smart Dropdown
  function toggleYouTubeDropdown(video, badgeInfo) {
    const dropdown = badgeInfo.dropdownEl;
    if (!dropdown) return;

    if (dropdown.classList.contains('qm-open')) {
      dropdown.classList.remove('qm-open');
      activeDropdown = null;
      return;
    }

    dropdown.innerHTML = '';
    const videoId = getYouTubeVideoId();
    const cleanUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : window.location.href;

    // Option 1: Open Fast High-Quality Converter (Cobalt / Y2Mate)
    const dlItem = document.createElement('div');
    dlItem.className = 'qm-dropdown-item';
    dlItem.innerHTML = `<span>⚡</span><span>Tải Full HD 1080p có tiếng</span>`;
    dlItem.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('qm-open');
      activeDropdown = null;
      window.open(`https://cobalt.tools/`, '_blank');
      showToast('Đã mở trang tải Full HD! Dán link video vào để tải.', 'success', 4000);
    });
    dropdown.appendChild(dlItem);

    // Option 2: Download HD/4K Thumbnail
    if (videoId) {
      const thumbItem = document.createElement('div');
      thumbItem.className = 'qm-dropdown-item';
      thumbItem.innerHTML = `<span>🖼️</span><span>Tải Thumbnail 4K / HD</span>`;
      thumbItem.addEventListener('click', async (e) => {
        e.stopPropagation();
        dropdown.classList.remove('qm-open');
        activeDropdown = null;
        try {
          const thumbUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
          await chrome.runtime.sendMessage({
            type: 'DOWNLOAD_MEDIA',
            url: thumbUrl,
            mediaType: 'image',
            pageTitle: `yt_thumb_${videoId}`
          });
          showToast('Đang tải ảnh bìa YouTube!', 'success');
        } catch (err) {
          showToast('Không tải được ảnh bìa.', 'error');
        }
      });
      dropdown.appendChild(thumbItem);
    }

    // Option 3: Copy Link
    const copyItem = document.createElement('div');
    copyItem.className = 'qm-dropdown-item';
    copyItem.innerHTML = `<span>📋</span><span>Sao chép link video</span>`;
    copyItem.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('qm-open');
      activeDropdown = null;
      navigator.clipboard.writeText(cleanUrl)
        .then(() => showToast('Đã sao chép link YouTube!', 'success'))
        .catch(() => showToast('Không sao chép được link.', 'error'));
    });
    dropdown.appendChild(copyItem);

    dropdown.classList.add('qm-open');
    activeDropdown = dropdown;
  }

  // Toggle Regular Video Dropdown (X.com or native HTML5 video)
  function toggleVideoDropdown(video, badgeInfo) {
    if (isYouTube) {
      toggleYouTubeDropdown(video, badgeInfo);
      return;
    }

    const dropdown = badgeInfo.dropdownEl;
    if (!dropdown) return;

    if (dropdown.classList.contains('qm-open')) {
      dropdown.classList.remove('qm-open');
      activeDropdown = null;
      return;
    }

    dropdown.innerHTML = '';

    const tweetId = isTwitter ? (badgeInfo.tweetId || findTweetId(video)) : null;
    const tweetInfo = tweetId ? twitterVideos.get(tweetId) : null;

    if (isTwitter && tweetInfo && tweetInfo.variants && tweetInfo.variants.length > 0) {
      tweetInfo.variants.forEach((v) => {
        const item = document.createElement('div');
        item.className = 'qm-dropdown-item';
        const label = formatVariantLabel(v);
        item.innerHTML = `<span>⚡</span><span>${label} (MP4)</span>`;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.remove('qm-open');
          activeDropdown = null;
          handleVideoDownload(video, badgeInfo, v.url, `x_${tweetId}_${label}.mp4`);
        });
        dropdown.appendChild(item);
      });
    } else {
      const sources = extractVideoSources(video);
      const validSources = sources.filter(s => s.url && !s.url.startsWith('blob:'));
      validSources.forEach(src => {
        const item = document.createElement('div');
        item.className = 'qm-dropdown-item';
        item.innerHTML = `<span>⚡</span><span>${src.label} (MP4)</span>`;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.remove('qm-open');
          activeDropdown = null;
          handleVideoDownload(video, badgeInfo, src.url);
        });
        dropdown.appendChild(item);
      });
    }

    const divider = document.createElement('div');
    divider.className = 'qm-dropdown-divider';
    dropdown.appendChild(divider);

    // Poster download option
    const posterUrl = video.poster || (tweetInfo && tweetInfo.poster);
    if (posterUrl) {
      const posterItem = document.createElement('div');
      posterItem.className = 'qm-dropdown-item';
      posterItem.innerHTML = `<span>🖼️</span><span>Tải ảnh bìa (Poster)</span>`;
      posterItem.addEventListener('click', async (e) => {
        e.stopPropagation();
        dropdown.classList.remove('qm-open');
        activeDropdown = null;
        try {
          await chrome.runtime.sendMessage({
            type: 'DOWNLOAD_MEDIA',
            url: posterUrl,
            mediaType: 'image',
            pageTitle: document.title + ' Poster'
          });
          showToast('Đã tải ảnh bìa video!', 'success');
        } catch (err) {
          showToast(`Lỗi: ${err.message}`, 'error');
        }
      });
      dropdown.appendChild(posterItem);
    }

    dropdown.classList.add('qm-open');
    activeDropdown = dropdown;
  }

  // Update image badge dimension label
  function updateImageBadgeLabel(img, badgeEl) {
    const labelEl = badgeEl.querySelector('.qm-badge-text');
    if (!labelEl) return;
    const label = getImageDimensionString(img);
    labelEl.textContent = label;
    badgeEl.title = `Tải ảnh (${label})`;
  }

  // Update video badge quality label
  function updateVideoBadgeLabel(video, badgeEl) {
    const labelEl = badgeEl.querySelector('.qm-badge-text');
    if (!labelEl) return;

    if (isTwitter) {
      const tweetId = findTweetId(video);
      const info = tweetId ? twitterVideos.get(tweetId) : null;
      if (info && info.variants && info.variants.length > 0) {
        const label = formatVariantLabel(info.variants[0]) || 'MP4';
        labelEl.textContent = label;
        badgeEl.title = `Tải video X (${label})`;
        return;
      }
    }

    const res = getShortResolution(video.videoWidth, video.videoHeight) || 'Video';
    labelEl.textContent = res;
    badgeEl.title = `Tải video (${res})`;
  }

  // Create & Register Badge for an image or tweet photo container
  function attachImageBadge(mediaEl) {
    if (activeBadges.has(mediaEl)) return;

    const badgeEl = document.createElement('div');
    badgeEl.className = 'qm-badge qm-badge-img';
    const dimText = getImageDimensionString(mediaEl);
    badgeEl.title = `Tải ảnh (${dimText})`;
    badgeEl.innerHTML = `<span class="qm-badge-text">${dimText}</span>`;

    const badgeInfo = {
      badgeEl,
      type: 'image',
      labelEl: badgeEl.querySelector('.qm-badge-text'),
      dropdownEl: null,
      isDownloading: false
    };

    // Click strictly downloads only this specific image
    badgeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      handleImageDownload(mediaEl, badgeInfo);
    });

    // Update label and re-evaluate position when image finishes loading
    const imgChild = (mediaEl instanceof HTMLImageElement) ? mediaEl : (mediaEl.querySelector ? mediaEl.querySelector('img') : null);
    if (imgChild) {
      if (!imgChild.complete) {
        imgChild.addEventListener('load', () => {
          updateImageBadgeLabel(mediaEl, badgeEl);
          updateBadgePosition(mediaEl, badgeInfo);
        }, { once: true });
      } else {
        updateImageBadgeLabel(mediaEl, badgeEl);
      }
    }

    activeBadges.set(mediaEl, badgeInfo);
    shadowRoot.appendChild(badgeEl);
    if (intersectionObserver) intersectionObserver.observe(mediaEl);

    // Direct hover listeners on media element
    mediaEl.addEventListener('mouseenter', () => showBadgeFor(mediaEl), { passive: true });
    mediaEl.addEventListener('mouseleave', () => hideHoveredBadge(180), { passive: true });

    // Hover listeners on badge element to prevent disappearance when interacting
    badgeEl.addEventListener('mouseenter', () => {
      if (hoverLeaveTimer) {
        clearTimeout(hoverLeaveTimer);
        hoverLeaveTimer = null;
      }
    }, { passive: true });
    badgeEl.addEventListener('mouseleave', () => hideHoveredBadge(180), { passive: true });

    updateBadgePosition(mediaEl, badgeInfo);
  }

  // When a video is attached, ensure any image badge on its poster or player container is wiped out
  function purgeImageBadgesForVideo(video) {
    const toRemove = [];
    const vRect = video.getBoundingClientRect();

    activeBadges.forEach((info, mediaEl) => {
      if (info.type === 'image') {
        // Direct containment
        if (mediaEl.contains(video) || video.contains(mediaEl)) {
          toRemove.push(mediaEl);
          return;
        }

        // Shared player wrapper
        const p = video.closest('[data-testid="videoComponent"], [data-testid="videoPlayer"], .video-player, .html5-video-player, #movie_player, .vjs-poster, article, .card');
        if (p && p.contains(mediaEl) && (mediaEl.closest && mediaEl.closest('[data-testid="videoComponent"], [data-testid="videoPlayer"], .html5-video-player, #movie_player, .vjs-poster'))) {
          toRemove.push(mediaEl);
          return;
        }

        // Geometry overlap
        if (vRect.width > 20 && vRect.height > 20 && mediaEl.getBoundingClientRect) {
          const mRect = mediaEl.getBoundingClientRect();
          const xOverlap = Math.max(0, Math.min(mRect.right, vRect.right) - Math.max(mRect.left, vRect.left));
          const yOverlap = Math.max(0, Math.min(mRect.bottom, vRect.bottom) - Math.max(mRect.top, vRect.top));
          const overlapArea = xOverlap * yOverlap;
          const mArea = mRect.width * mRect.height;
          if (mArea > 0 && (overlapArea / mArea > 0.4)) {
            toRemove.push(mediaEl);
          }
        }
      }
    });

    toRemove.forEach(el => removeBadge(el));
  }

  // Create & Register Badge for a video
  function attachVideoBadge(video) {
    if (activeBadges.has(video)) return;

    // Wipe out any accidental image badge on this video or its poster
    purgeImageBadgesForVideo(video);

    const badgeEl = document.createElement('div');
    badgeEl.className = 'qm-badge qm-badge-vid';
    const resText = getShortResolution(video.videoWidth, video.videoHeight) || 'Video';
    badgeEl.title = `Tải video (${resText})`;
    badgeEl.innerHTML = `
      <span class="qm-badge-text">${resText}</span>
      <span class="qm-chevron" title="Tùy chọn khác">▾</span>
      <div class="qm-dropdown"></div>
    `;

    const badgeInfo = {
      badgeEl,
      type: 'video',
      labelEl: badgeEl.querySelector('.qm-badge-text'),
      dropdownEl: badgeEl.querySelector('.qm-dropdown'),
      isDownloading: false
    };

    // Click handler for video badge
    badgeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();

      // If clicked on chevron, toggle dropdown
      const chevron = badgeEl.querySelector('.qm-chevron');
      if (e.target === chevron || chevron?.contains(e.target)) {
        toggleVideoDropdown(video, badgeInfo);
        return;
      }

      // If clicked inside dropdown, handled by item click
      if (badgeInfo.dropdownEl && badgeInfo.dropdownEl.contains(e.target)) {
        return;
      }

      // Main click: download video directly!
      handleVideoDownload(video, badgeInfo);
    });

    // Right-click opens dropdown menu
    badgeEl.addEventListener('contextmenu', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      toggleVideoDropdown(video, badgeInfo);
    });

    // Update label and re-evaluate position when metadata loads
    video.addEventListener('loadedmetadata', () => {
      updateVideoBadgeLabel(video, badgeEl);
      updateBadgePosition(video, badgeInfo);
    });

    activeBadges.set(video, badgeInfo);
    shadowRoot.appendChild(badgeEl);
    if (intersectionObserver) intersectionObserver.observe(video);

    // Direct hover listeners on video element
    video.addEventListener('mouseenter', () => showBadgeFor(video), { passive: true });
    video.addEventListener('mouseleave', () => hideHoveredBadge(180), { passive: true });

    // Video wrapper container hover listener for all video players across the web
    // (Video.js, Plyr, JWPlayer, YouTube, Twitter, TikTok, Facebook, Reddit, native player wrappers)
    const playerWrapper = video.closest(
      '[data-testid="videoComponent"], [data-testid="videoPlayer"], .video-player, .html5-video-player, #movie_player, .video-js, .plyr, .jwplayer, [data-player], .video-container, [class*="player"], [class*="video"], figure, article'
    );
    if (playerWrapper && playerWrapper !== video) {
      playerWrapper.addEventListener('mouseenter', () => showBadgeFor(video), { passive: true });
      playerWrapper.addEventListener('mouseleave', () => hideHoveredBadge(180), { passive: true });
    }

    // Also attach hover listeners to immediate parent elements (up to 3 levels)
    let curParent = video.parentElement;
    for (let i = 0; i < 3 && curParent && curParent !== document.body && curParent !== document.documentElement; i++) {
      if (curParent !== playerWrapper) {
        curParent.addEventListener('mouseenter', () => showBadgeFor(video), { passive: true });
        curParent.addEventListener('mouseleave', () => hideHoveredBadge(180), { passive: true });
      }
      curParent = curParent.parentElement;
    }

    // Badge hover listeners
    badgeEl.addEventListener('mouseenter', () => {
      if (hoverLeaveTimer) {
        clearTimeout(hoverLeaveTimer);
        hoverLeaveTimer = null;
      }
    }, { passive: true });
    badgeEl.addEventListener('mouseleave', () => hideHoveredBadge(180), { passive: true });

    updateBadgePosition(video, badgeInfo);
  }

  // Extract download link and details on hover
  function extractMediaLinkOnHover(mediaEl, badgeInfo) {
    if (!mediaEl || !badgeInfo) return;

    // A. Image: extract highest resolution image URL and dimensions
    if (badgeInfo.type === 'image') {
      const imgUrl = extractBestImageUrl(mediaEl);
      if (imgUrl) {
        badgeInfo.cachedUrl = imgUrl;
      }
      updateImageBadgeLabel(mediaEl, badgeInfo.badgeEl);
      return;
    }

    // B. Video: extract MP4 variants or sources
    if (badgeInfo.type === 'video') {
      if (isYouTube) {
        const labelEl = badgeInfo.badgeEl.querySelector('.qm-badge-text');
        if (labelEl) labelEl.textContent = '1080p';
        return;
      }

      if (isTwitter) {
        const tweetId = findTweetId(mediaEl);
        if (tweetId) {
          badgeInfo.tweetId = tweetId;
          const info = twitterVideos.get(tweetId);
          if (info && info.variants && info.variants.length > 0) {
            const best = info.variants[0];
            badgeInfo.cachedUrl = best.url;
            badgeInfo.cachedFilename = `x_${tweetId}_${formatVariantLabel(best)}.mp4`;
            updateVideoBadgeLabel(mediaEl, badgeInfo.badgeEl);
            return;
          }
        }
        // Send request to main-world interceptor immediately upon hover!
        window.postMessage({ type: 'QM_REQUEST_TWEET_MEDIA', tweetId: tweetId || badgeInfo.tweetId }, '*');
        return;
      }

      // Native HTML5 video
      const sources = extractVideoSources(mediaEl);
      const validSrc = sources.find(s => s.url && !s.url.startsWith('blob:'));
      if (validSrc) {
        badgeInfo.cachedUrl = validSrc.url;
        badgeInfo.cachedFilename = validSrc.filename || null;
      }
      updateVideoBadgeLabel(mediaEl, badgeInfo.badgeEl);
    }
  }

  // Hover Controller - Strictly only display the badge when hovering over an image or video
  let hoveredMediaEl = null;
  let hoverLeaveTimer = null;

  function showBadgeFor(mediaEl) {
    if (!mediaEl || !activeBadges.has(mediaEl)) return;

    if (hoverLeaveTimer) {
      clearTimeout(hoverLeaveTimer);
      hoverLeaveTimer = null;
    }

    const badgeInfo = activeBadges.get(mediaEl);
    if (!badgeInfo || !badgeInfo.badgeEl) return;

    // Fetch / extract download link right upon hover
    extractMediaLinkOnHover(mediaEl, badgeInfo);

    if (hoveredMediaEl === mediaEl) {
      updateBadgePosition(mediaEl, badgeInfo);
      badgeInfo.badgeEl.classList.add('qm-visible');
      return;
    }

    // Hide any previous badge (unless dropdown menu is currently open)
    if (hoveredMediaEl && hoveredMediaEl !== mediaEl) {
      const prevInfo = activeBadges.get(hoveredMediaEl);
      if (prevInfo && prevInfo.badgeEl) {
        if (!prevInfo.dropdownEl || !prevInfo.dropdownEl.classList.contains('qm-open')) {
          prevInfo.badgeEl.classList.remove('qm-visible');
        }
      }
    }

    hoveredMediaEl = mediaEl;
    updateBadgePosition(mediaEl, badgeInfo);
    badgeInfo.badgeEl.classList.add('qm-visible');
  }

  function hideHoveredBadge(delay = 180) {
    if (hoverLeaveTimer) clearTimeout(hoverLeaveTimer);
    hoverLeaveTimer = setTimeout(() => {
      if (hoveredMediaEl) {
        const info = activeBadges.get(hoveredMediaEl);
        if (info && info.badgeEl) {
          if (info.dropdownEl && info.dropdownEl.classList.contains('qm-open')) {
            return; // Keep open while user interacts with quality dropdown
          }
          info.badgeEl.classList.remove('qm-visible');
        }
        hoveredMediaEl = null;
      }
    }, delay);
  }

  // Update position of a single badge strictly over its media element
  function updateBadgePosition(mediaEl, badgeInfo) {
    if (!mediaEl || !badgeInfo) return;

    // Check if element is still connected to document
    if (!mediaEl.isConnected) {
      removeBadge(mediaEl);
      return;
    }

    // Strictly check if media element is actually visible and not occluded by popups/modals/overflow
    if (!isMediaActuallyVisible(mediaEl)) {
      badgeInfo.badgeEl.style.display = 'none';
      badgeInfo.badgeEl.classList.remove('qm-visible');
      if (badgeInfo.dropdownEl) badgeInfo.dropdownEl.classList.remove('qm-open');
      return;
    }

    // Ensure badge is measurable before calculating bounds
    badgeInfo.badgeEl.style.display = 'inline-flex';

    const rect = mediaEl.getBoundingClientRect();
    let targetRect = rect;
    if (badgeInfo.type === 'video' && (rect.width < 30 || rect.height < 30) && mediaEl.parentElement) {
      const pRect = mediaEl.parentElement.getBoundingClientRect();
      if (pRect.width >= 50 && pRect.height >= 30) {
        targetRect = pRect;
      }
    }

    const btnRect = badgeInfo.badgeEl.getBoundingClientRect();
    const btnWidth = btnRect.width || (badgeInfo.type === 'image' ? 72 : 52);
    const btnHeight = btnRect.height || 23;

    const offset = 8;
    const bottomOffset = (badgeInfo.type === 'video' && mediaEl.hasAttribute('controls')) ? 46 : offset;

    let top = 0;
    let left = 0;

    switch (settings.buttonPosition) {
      case 'top-left':
        top = targetRect.top + offset;
        left = targetRect.left + offset;
        break;
      case 'top-right':
        top = targetRect.top + offset;
        left = targetRect.right - btnWidth - offset;
        break;
      case 'bottom-left':
        top = targetRect.bottom - btnHeight - bottomOffset;
        left = targetRect.left + offset;
        break;
      case 'bottom-right':
      default:
        top = targetRect.bottom - btnHeight - bottomOffset;
        left = targetRect.right - btnWidth - offset;
        break;
    }

    // Keep badge firmly inside the target bounds
    const clampedTop = Math.max(targetRect.top + 2, Math.min(targetRect.bottom - btnHeight - 2, top));
    const clampedLeft = Math.max(targetRect.left + 2, Math.min(targetRect.right - btnWidth - 2, left));

    badgeInfo.badgeEl.style.top = `${Math.round(clampedTop)}px`;
    badgeInfo.badgeEl.style.left = `${Math.round(clampedLeft)}px`;
  }

  // Update positions of currently hovered badge
  function updateAllBadgePositions() {
    if (hoveredMediaEl && activeBadges.has(hoveredMediaEl)) {
      updateBadgePosition(hoveredMediaEl, activeBadges.get(hoveredMediaEl));
    }
    isUpdatingPositions = false;
  }

  // Throttled schedule update
  function scheduleUpdateAllBadges() {
    if (isUpdatingPositions) return;
    isUpdatingPositions = true;
    requestAnimationFrame(updateAllBadgePositions);
  }

  // Remove a badge when media is removed from DOM
  function removeBadge(mediaEl) {
    if (hoveredMediaEl === mediaEl) {
      hoveredMediaEl = null;
    }
    const badgeInfo = activeBadges.get(mediaEl);
    if (!badgeInfo) return;

    if (badgeInfo.badgeEl) badgeInfo.badgeEl.remove();
    if (intersectionObserver) intersectionObserver.unobserve(mediaEl);
    activeBadges.delete(mediaEl);
  }

  // Scan document for eligible media elements and attach fixed badges
  function scanMedia() {
    if (!hostEl || !hostEl.isConnected) {
      hostEl = null;
      initUI();
    }

    // 1. Scan Videos FIRST so video players/posters are recognized and image badges are excluded
    if (settings.enableVideos) {
      const videos = document.querySelectorAll('video');
      for (const video of videos) {
        if (!activeBadges.has(video) && isValidVideo(video)) {
          attachVideoBadge(video);
        }
      }
    }

    // 2. Scan Images (only elements that are strictly NOT part of any video)
    if (settings.enableImages) {
      // A. On Twitter / X.com: scan tweet photo containers first
      if (isTwitter) {
        const tweetPhotos = document.querySelectorAll('div[data-testid="tweetPhoto"]');
        for (const photo of tweetPhotos) {
          if (!activeBadges.has(photo) && isValidImage(photo)) {
            attachImageBadge(photo);
          }
        }
      }

      // B. Standard <img> elements across all pages (and Twitter photo modal)
      const images = document.querySelectorAll('img');
      for (const img of images) {
        if (!activeBadges.has(img) && isValidImage(img)) {
          attachImageBadge(img);
        }
      }
    }

    scheduleUpdateAllBadges();
  }

  // Initialize Observers
  function initObservers() {
    // 1. Intersection Observer: hides badges of elements outside viewport for optimal performance
    intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const badgeInfo = activeBadges.get(entry.target);
        if (badgeInfo) {
          if (!entry.isIntersecting) {
            badgeInfo.badgeEl.classList.remove('qm-visible');
            if (hoveredMediaEl === entry.target) {
              hoveredMediaEl = null;
            }
          }
        }
      }
    }, { rootMargin: '50px' });

    // 2. Mutation Observer: detects new images/videos dynamically loaded into DOM
    // and style/class/hidden attribute changes that toggle modals, popups, or carousels
    mutationObserver = new MutationObserver((mutations) => {
      let shouldScan = false;
      let shouldUpdateBadges = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          if (mutation.addedNodes.length > 0) {
            let fromHost = false;
            for (const n of mutation.addedNodes) {
              if (n === hostEl || (n.nodeType === 1 && n.id === 'qm-downloader-host')) {
                fromHost = true;
                break;
              }
            }
            if (!fromHost) shouldScan = true;
          }
          if (mutation.removedNodes.length > 0) {
            shouldUpdateBadges = true;
          }
        } else if (mutation.type === 'attributes') {
          shouldUpdateBadges = true;
        }
      }

      if (shouldScan) {
        requestAnimationFrame(scanMedia);
      } else if (shouldUpdateBadges) {
        scheduleUpdateAllBadges();
      }
    });

    mutationObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-hidden', 'hidden', 'role']
    });

    // 3. Scroll and Resize Listeners: Keep badges fixed accurately over their media
    window.addEventListener('scroll', scheduleUpdateAllBadges, { passive: true });
    window.addEventListener('resize', scheduleUpdateAllBadges, { passive: true });

    // 4. Modal / Dialog / Lightbox trigger listeners:
    // Clicks, Escape key, CSS transitions, CSS animations, Popstate (URL navigation)
    function triggerPositionUpdates() {
      scheduleUpdateAllBadges();
      setTimeout(scheduleUpdateAllBadges, 80);
      setTimeout(scheduleUpdateAllBadges, 250);
      setTimeout(scheduleUpdateAllBadges, 500);
    }

    document.addEventListener('click', (e) => {
      if (hostEl && (e.target === hostEl || hostEl.contains(e.target))) return;
      triggerPositionUpdates();
      // Scan for any newly rendered modal images
      setTimeout(scanMedia, 150);
      setTimeout(scanMedia, 400);
    }, { passive: true, capture: true });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        triggerPositionUpdates();
      }
    }, { passive: true });

    window.addEventListener('transitionend', scheduleUpdateAllBadges, { passive: true });
    window.addEventListener('animationend', scheduleUpdateAllBadges, { passive: true });
    window.addEventListener('popstate', () => {
      triggerPositionUpdates();
      setTimeout(scanMedia, 150);
    }, { passive: true });

    // Video playback / loaded listeners to instantly capture dynamically initialized video elements
    document.addEventListener('play', (e) => {
      if (e.target instanceof HTMLVideoElement) {
        if (!activeBadges.has(e.target) && isValidVideo(e.target)) {
          attachVideoBadge(e.target);
        }
        scheduleUpdateAllBadges();
      }
    }, { capture: true, passive: true });

    document.addEventListener('loadeddata', (e) => {
      if (e.target instanceof HTMLVideoElement) {
        if (!activeBadges.has(e.target) && isValidVideo(e.target)) {
          attachVideoBadge(e.target);
        }
        scheduleUpdateAllBadges();
      }
    }, { capture: true, passive: true });

    // 5. Global mousemove tracking for robust hover detection across all layouts and overlay divs (e.g. Twitter / X)
    let isCheckingHover = false;
    document.addEventListener('mousemove', (e) => {
      if (isCheckingHover) return;
      isCheckingHover = true;
      requestAnimationFrame(() => {
        isCheckingHover = false;

        // A. If cursor is inside Shadow DOM (badge or dropdown), keep it visible!
        if (shadowRoot && shadowRoot.elementFromPoint) {
          const shadowTarget = shadowRoot.elementFromPoint(e.clientX, e.clientY);
          if (shadowTarget) {
            if (hoverLeaveTimer) {
              clearTimeout(hoverLeaveTimer);
              hoverLeaveTimer = null;
            }
            return;
          }
        }

        // B. If cursor is within currently hovered media element (with 8px safety buffer)
        if (hoveredMediaEl && hoveredMediaEl.isConnected) {
          const r = hoveredMediaEl.getBoundingClientRect();
          if (e.clientX >= r.left - 8 && e.clientX <= r.right + 8 &&
              e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8) {
            if (hoverLeaveTimer) {
              clearTimeout(hoverLeaveTimer);
              hoverLeaveTimer = null;
            }
            return;
          }
        }

        // C. Check target element or closest media container
        let found = null;
        const target = e.target;
        if (target && target !== document.body && target !== document.documentElement) {
          if (activeBadges.has(target)) {
            found = target;
          } else if (isTwitter && target.closest) {
            const tweetPhoto = target.closest('div[data-testid="tweetPhoto"]');
            if (tweetPhoto && activeBadges.has(tweetPhoto)) {
              found = tweetPhoto;
            } else {
              const vid = target.closest('[data-testid="videoComponent"], [data-testid="videoPlayer"]')?.querySelector('video');
              if (vid && activeBadges.has(vid)) {
                found = vid;
              }
            }
          }

          // General media detection across all websites
          if (!found && target.closest) {
            const parentImg = target.closest('img');
            if (parentImg && activeBadges.has(parentImg)) found = parentImg;
            const parentVid = target.closest('video');
            if (parentVid && activeBadges.has(parentVid)) found = parentVid;

            // Check if target is inside a video player wrapper or overlay (Video.js, Plyr, JWPlayer, etc.)
            if (!found) {
              const playerWrap = target.closest(
                '[data-player], .video-player, .html5-video-player, #movie_player, .video-js, .plyr, .jwplayer, .video-container, [class*="player"], [class*="video"], figure, article'
              );
              if (playerWrap) {
                const vid = playerWrap.querySelector('video');
                if (vid && activeBadges.has(vid)) {
                  found = vid;
                }
              }
            }

            // Check immediate parent hierarchy (up to 4 levels) for any sibling/child video
            if (!found) {
              let p = target;
              for (let i = 0; i < 4 && p && p !== document.body && p !== document.documentElement; i++) {
                if (p.querySelector) {
                  const vid = p.querySelector('video');
                  if (vid && activeBadges.has(vid)) {
                    found = vid;
                    break;
                  }
                }
                p = p.parentElement;
              }
            }
          }
        }

        // D. Geometric fallback check across visible media elements
        if (!found) {
          for (const [mediaEl, info] of activeBadges.entries()) {
            if (mediaEl.isConnected && isMediaActuallyVisible(mediaEl)) {
              let r = mediaEl.getBoundingClientRect();
              if (info.type === 'video' && (r.width < 30 || r.height < 30) && mediaEl.parentElement) {
                const pr = mediaEl.parentElement.getBoundingClientRect();
                if (pr.width >= 30 && pr.height >= 30) r = pr;
              }

              if (e.clientX >= r.left && e.clientX <= r.right &&
                  e.clientY >= r.top && e.clientY <= r.bottom) {
                found = mediaEl;
                break;
              }
            }
          }
        }

        if (found) {
          showBadgeFor(found);
        } else {
          hideHoveredBadge(180);
        }
      });
    }, { passive: true });

    window.addEventListener('mouseout', (e) => {
      if (!e.relatedTarget) {
        hideHoveredBadge(50);
      }
    }, { passive: true });

    // Periodic scanner for virtualized SPA timelines (Twitter, YouTube, Instagram)
    setInterval(() => {
      if (!hostEl || !hostEl.isConnected) {
        hostEl = null;
        initUI();
      }
      scanMedia();
    }, 1500);

    // Initial scan
    scanMedia();
  }

  // Load Settings
  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response && response.settings) {
        settings = { ...settings, ...response.settings };
      }
    } catch (err) {}
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SETTINGS_UPDATED') {
      settings = { ...settings, ...message.settings };
      if (!settings.enableImages) {
        activeBadges.forEach((info, mediaEl) => {
          if (info.type === 'image') removeBadge(mediaEl);
        });
      }
      if (!settings.enableVideos) {
        activeBadges.forEach((info, mediaEl) => {
          if (info.type === 'video') removeBadge(mediaEl);
        });
      }
      scanMedia();
    }
  });

  // Start initialization immediately
  initUI();
  initObservers();
  loadSettings().then(() => {
    scheduleUpdateAllBadges();
  });
})();
