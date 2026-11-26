/**
 * QuickMedia Downloader - X (Twitter) Network & Media Interceptor
 * Runs in the MAIN world context on x.com and twitter.com
 * Hooks fetch and XMLHttpRequest to capture full-resolution MP4 video URLs from Twitter GraphQL API
 */

(function () {
  'use strict';

  if (window.__QM_X_INTERCEPTOR_INSTALLED__) return;
  window.__QM_X_INTERCEPTOR_INSTALLED__ = true;

  const capturedVideos = new Map(); // tweetId / mediaId -> { tweetId, variants, poster, text }

  // Extract video variants from object recursively
  function extractVideosFromObject(obj) {
    if (!obj || typeof obj !== 'object') return;

    // Direct media with video_info
    if (obj.video_info && Array.isArray(obj.video_info.variants)) {
      const mp4Variants = obj.video_info.variants
        .filter(v => v.content_type === 'video/mp4' && v.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      if (mp4Variants.length > 0) {
        const mId = String(obj.id_str || obj.id || '');
        const item = {
          tweetId: mId,
          idStr: mId,
          variants: mp4Variants,
          poster: obj.media_url_https || obj.media_url
        };
        if (mId) {
          capturedVideos.set(mId, item);
        }
        broadcastVideoData(item);
      }
    }

    // TweetWithVisibilityResults or nested tweet wrapper
    if (obj.tweet && (obj.tweet.rest_id || obj.tweet.legacy)) {
      extractVideosFromObject(obj.tweet);
    }

    // Tweet object with rest_id & legacy
    if (obj.rest_id && obj.legacy) {
      const tweetId = String(obj.rest_id);
      const mediaList = obj.legacy?.extended_entities?.media || obj.legacy?.entities?.media || [];
      for (const m of mediaList) {
        if (m.video_info && Array.isArray(m.video_info.variants)) {
          const mp4Variants = m.video_info.variants
            .filter(v => v.content_type === 'video/mp4' && v.url)
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

          if (mp4Variants.length > 0) {
            const item = {
              tweetId: tweetId,
              text: obj.legacy?.full_text || '',
              variants: mp4Variants,
              poster: m.media_url_https || m.media_url
            };
            capturedVideos.set(tweetId, item);
            if (m.id_str) capturedVideos.set(String(m.id_str), item);
            broadcastVideoData(item);
          }
        }
      }
    }

    // Traverse children
    if (Array.isArray(obj)) {
      for (const item of obj) {
        extractVideosFromObject(item);
      }
    } else {
      for (const key of Object.keys(obj)) {
        if (key !== 'parent' && key !== '__proto__') {
          extractVideosFromObject(obj[key]);
        }
      }
    }
  }

  // Send captured video data to content script
  function broadcastVideoData(item) {
    if (!item) return;
    window.postMessage({
      type: 'QM_TWITTER_VIDEO_DATA',
      data: item
    }, '*');
  }

  // Hook window.fetch to inspect Twitter GraphQL responses
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (url.includes('/i/api/graphql/') || url.includes('/graphql/') || url.includes('/TweetDetail') || url.includes('Timeline') || url.includes('/i/api/')) {
        const clone = response.clone();
        clone.json().then(data => {
          extractVideosFromObject(data);
        }).catch(() => {});
      }
    } catch (e) {
      // Ignore interception errors
    }

    return response;
  };

  // Hook XMLHttpRequest as well
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__qm_url = typeof url === 'string' ? url : '';
    return originalXhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      try {
        const url = this.__qm_url || '';
        if (url.includes('/graphql/') || url.includes('/i/api/') || url.includes('Timeline') || url.includes('TweetDetail')) {
          const data = JSON.parse(this.responseText);
          extractVideosFromObject(data);
        }
      } catch (e) {}
    });
    return originalXhrSend.apply(this, arguments);
  };

  // Inspect React Fiber from DOM element as secondary fallback
  function extractFromReactFiber(el) {
    try {
      let cur = el;
      while (cur && cur !== document.body) {
        const fiberKey = Object.keys(cur).find(k => k.startsWith('__reactFiber$'));
        if (fiberKey) {
          let fiber = cur[fiberKey];
          let depth = 0;
          while (fiber && depth < 50) {
            const props = fiber.memoizedProps;
            if (props) {
              const tweet = props.tweet || props.result?.tweet || props.entry?.content?.itemContent?.tweet_results?.result || props.tweetResult?.result;
              if (tweet) {
                const legacy = tweet.legacy || tweet.tweet?.legacy || tweet;
                const media = legacy.extended_entities?.media || legacy.entities?.media;
                if (Array.isArray(media)) {
                  for (const m of media) {
                    if (m.video_info?.variants) {
                      const mp4s = m.video_info.variants
                        .filter(v => v.content_type === 'video/mp4' && v.url)
                        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
                      if (mp4s.length > 0) {
                        return {
                          tweetId: String(tweet.rest_id || legacy.id_str || legacy.id || ''),
                          text: legacy.full_text || '',
                          variants: mp4s,
                          poster: m.media_url_https || m.media_url
                        };
                      }
                    }
                  }
                }
              }

              // Check if video info is directly in props (e.g. video component)
              if (props.video_info?.variants) {
                const mp4s = props.video_info.variants
                  .filter(v => v.content_type === 'video/mp4' && v.url)
                  .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
                if (mp4s.length > 0) {
                  return {
                    tweetId: String(props.tweetId || props.id_str || ''),
                    variants: mp4s,
                    poster: props.poster || props.media_url_https
                  };
                }
              }
            }
            fiber = fiber.return;
            depth++;
          }
        }
        cur = cur.parentElement;
      }
    } catch (err) {
      console.warn('React Fiber inspection error:', err);
    }
    return null;
  }

  // Listen to requests from content script
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data) return;

    if (e.data.type === 'QM_REQUEST_TWEET_MEDIA') {
      const tweetId = e.data.tweetId ? String(e.data.tweetId) : null;
      if (tweetId && capturedVideos.has(tweetId)) {
        broadcastVideoData(capturedVideos.get(tweetId));
        return;
      }

      // 1. Try finding tweet element or link on page
      let targetEl = null;
      if (tweetId) {
        targetEl = document.querySelector(`a[href*="/status/${tweetId}"]`);
        if (!targetEl) {
          const articles = document.querySelectorAll('article');
          for (const art of articles) {
            if (art.querySelector(`a[href*="/status/${tweetId}"]`)) {
              targetEl = art;
              break;
            }
          }
        }
      }

      if (targetEl) {
        const item = extractFromReactFiber(targetEl);
        if (item) {
          if (item.tweetId) capturedVideos.set(item.tweetId, item);
          if (tweetId) capturedVideos.set(tweetId, item);
          broadcastVideoData(item);
          return;
        }
      }

      // 2. Fallback: inspect video components on page
      const videoElements = document.querySelectorAll('[data-testid="videoComponent"], [data-testid="videoPlayer"], video');
      for (const vc of videoElements) {
        const item = extractFromReactFiber(vc);
        if (item && item.variants && item.variants.length > 0) {
          if (item.tweetId) capturedVideos.set(item.tweetId, item);
          if (tweetId && (!item.tweetId || item.tweetId === tweetId)) {
            capturedVideos.set(tweetId, item);
            broadcastVideoData(item);
            return;
          } else if (!tweetId) {
            broadcastVideoData(item);
            return;
          }
        }
      }
    }
  });
})();
