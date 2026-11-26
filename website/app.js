(() => {
  'use strict';

  // 1. Accessible Tabs with arrow-key navigation & beforematch support
  const tablist = document.querySelector('[role="tablist"]');
  if (tablist) {
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
    const panels = tabs.map((tab) =>
      document.querySelector(`[role="tabpanel"][aria-labelledby="${tab.id}"]`)
    );

    const activateTab = (nextTab, { focusTab = false } = {}) => {
      tabs.forEach((tab, index) => {
        const selected = tab === nextTab;
        const panel = panels[index];
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (panel) {
          if (selected) {
            panel.removeAttribute('hidden');
            panel.tabIndex = 0;
          } else {
            panel.setAttribute('hidden', 'until-found');
            panel.removeAttribute('tabindex');
          }
        }
      });

      if (focusTab) {
        nextTab.focus();
        nextTab.scrollIntoView({ block: 'nearest', inline: 'nearest', container: 'nearest' });
      }
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activateTab(tab));

      tab.addEventListener('keydown', (e) => {
        let nextIndex = -1;
        if (e.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') nextIndex = 0;
        else if (e.key === 'End') nextIndex = tabs.length - 1;

        if (nextIndex !== -1) {
          e.preventDefault();
          activateTab(tabs[nextIndex], { focusTab: true });
        }
      });

      const panel = panels[index];
      if (panel) {
        panel.addEventListener('beforematch', () => activateTab(tab));
      }
    });
  }

  // 2. Interactive Liquid Glass Showcase Controls
  const toastEl = document.getElementById('demo-status-toast');
  let toastTimer = null;

  const showDemoStatus = (message) => {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 3200);
  };

  document.querySelectorAll('[data-demo-download]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.getAttribute('data-demo-download');
      if (kind === 'image') {
        showDemoStatus('✓ Đã mô phỏng tải ảnh gốc: landscape_1920x1080.jpg');
      } else {
        showDemoStatus('✓ Đã mô phỏng tải video MP4: showcase_1080p.mp4');
      }
    });
  });

  const qualityToggle = document.getElementById('demo-quality-toggle');
  const qualityMenu = document.getElementById('demo-quality-menu');
  const videoCard = document.querySelector('.demo-video-card');

  const closeQualityMenu = () => {
    if (!qualityMenu || !qualityToggle || !videoCard) return;
    qualityMenu.hidden = true;
    qualityToggle.setAttribute('aria-expanded', 'false');
    videoCard.classList.remove('is-menu-open');
  };

  if (qualityToggle && qualityMenu && videoCard) {
    qualityToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = qualityMenu.hidden;
      qualityMenu.hidden = !willOpen;
      qualityToggle.setAttribute('aria-expanded', String(willOpen));
      videoCard.classList.toggle('is-menu-open', willOpen);
    });

    qualityMenu.querySelectorAll('[data-quality]').forEach((item) => {
      item.addEventListener('click', () => {
        const q = item.getAttribute('data-quality');
        if (q === 'Poster') {
          showDemoStatus('✓ Đã mô phỏng tải ảnh bìa video (poster.jpg)');
        } else {
          showDemoStatus(`✓ Đã mô phỏng tải video chất lượng ${q} (.mp4)`);
        }
        closeQualityMenu();
      });
    });

    document.addEventListener('click', (e) => {
      if (!videoCard.contains(e.target)) {
        closeQualityMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !qualityMenu.hidden) {
        closeQualityMenu();
        qualityToggle.focus();
      }
    });
  }

  // 3. Copy build command button
  const copyBtn = document.getElementById('copy-build-btn');
  const buildCommands = document.getElementById('build-commands');
  if (copyBtn && buildCommands) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(buildCommands.textContent.trim());
        const prev = copyBtn.textContent;
        copyBtn.textContent = 'Đã sao chép ✓';
        setTimeout(() => {
          copyBtn.textContent = prev;
        }, 1800);
      } catch {
        copyBtn.textContent = 'Không thể sao chép';
      }
    });
  }
})();
