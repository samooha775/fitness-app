(function () {
  const RING_CIRCUMFERENCE = 2 * Math.PI * 96; // matches r=96 in the SVG

  const el = {
    subscriberPill: document.getElementById('subscriber-pill'),
    settingsBtn: document.getElementById('settings-btn'),
    ringFg: document.getElementById('ring-fg'),
    todayCount: document.getElementById('today-count'),
    todayTarget: document.getElementById('today-target'),
    streakCount: document.getElementById('streak-count'),
    levelNum: document.getElementById('level-num'),
    xpFill: document.getElementById('xp-fill'),
    lifetimeTotal: document.getElementById('lifetime-total'),
    quickButtons: document.querySelectorAll('.quick-btn'),
    customForm: document.getElementById('custom-form'),
    customAmount: document.getElementById('custom-amount'),
    historyChart: document.getElementById('history-chart'),
    achievementsGrid: document.getElementById('achievements-grid'),
    enableNotifyBtn: document.getElementById('enable-notify-btn'),
    testNotifyBtn: document.getElementById('test-notify-btn'),
    notifyStatus: document.getElementById('notify-status'),
    settingsOverlay: document.getElementById('settings-overlay'),
    closeSettingsBtn: document.getElementById('close-settings-btn'),
    settingsForm: document.getElementById('settings-form'),
    settingTarget: document.getElementById('setting-target'),
    settingMorning: document.getElementById('setting-morning'),
    settingEvening: document.getElementById('setting-evening'),
    toastStack: document.getElementById('toast-stack'),
    confettiCanvas: document.getElementById('confetti-canvas'),
  };

  let swRegistration = null;

  // ---------- Rendering ----------

  function render(state) {
    const pct = Math.max(0, Math.min(1, state.todayCount / state.dailyTarget));
    const offset = RING_CIRCUMFERENCE * (1 - pct);
    el.ringFg.style.strokeDashoffset = String(offset);
    el.ringFg.style.stroke = pct >= 1 ? 'var(--success)' : 'var(--accent)';

    el.todayCount.textContent = state.todayCount;
    el.todayTarget.textContent = state.dailyTarget;
    el.streakCount.textContent = state.streak;
    el.levelNum.textContent = state.level.level;
    el.xpFill.style.width = `${Math.round(state.level.progress * 100)}%`;
    el.lifetimeTotal.textContent = state.lifetimeTotal;

    renderHistory(state.history, state.dailyTarget);
    renderAchievements(state.achievements);

    el.settingTarget.value = state.dailyTarget;
    el.settingMorning.value = state.settings.reminderTime;
    el.settingEvening.value = state.settings.eveningCheckTime;

    updateSubscriberPill(state.subscriberCount);
  }

  function renderHistory(history, target) {
    el.historyChart.innerHTML = '';
    const max = Math.max(target, ...history.map((h) => h.count), 1);
    for (const day of history) {
      const wrap = document.createElement('div');
      wrap.className = 'history-bar-wrap';

      const bar = document.createElement('div');
      const heightPct = Math.max(3, Math.round((day.count / max) * 100));
      bar.className = 'history-bar' + (day.count === 0 ? ' miss' : '');
      bar.style.height = `${heightPct}%`;
      bar.title = `${day.date}: ${day.count} reps`;

      const label = document.createElement('div');
      label.className = 'history-day';
      const d = new Date(`${day.date}T00:00:00`);
      label.textContent = d.toLocaleDateString(undefined, { weekday: 'narrow' });

      wrap.appendChild(bar);
      wrap.appendChild(label);
      el.historyChart.appendChild(wrap);
    }
  }

  function renderAchievements(achievements) {
    el.achievementsGrid.innerHTML = '';
    for (const a of achievements) {
      const card = document.createElement('div');
      card.className = 'achievement' + (a.unlocked ? ' unlocked' : '');
      card.innerHTML = `
        <div class="achievement-emoji">${a.unlocked ? a.emoji : '🔒'}</div>
        <div class="achievement-name">${a.name}</div>
        <div class="achievement-desc">${a.desc}</div>
      `;
      el.achievementsGrid.appendChild(card);
    }
  }

  function updateSubscriberPill(count) {
    if (count > 0 && Notification.permission === 'granted') {
      el.subscriberPill.textContent = '🔔 Notifications on';
      el.subscriberPill.className = 'pill pill-active';
      el.enableNotifyBtn.textContent = '🔔 Notifications enabled';
    } else {
      el.subscriberPill.textContent = '🔕 Notifications off';
      el.subscriberPill.className = 'pill pill-muted';
      el.enableNotifyBtn.textContent = '🔔 Enable notifications';
    }
  }

  // ---------- Toasts ----------

  function showToast(title, sub) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<div>${title}</div>${sub ? `<div class="toast-sub">${sub}</div>` : ''}`;
    el.toastStack.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(30px)';
      setTimeout(() => toast.remove(), 400);
    }, 4200);
  }

  // ---------- Confetti ----------

  function burstConfetti() {
    const canvas = el.confettiCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#7c3aed', '#f97316', '#22c55e', '#38bdf8', '#f4f4ff'];
    const pieces = Array.from({ length: 140 }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * 120,
      y: canvas.height * 0.25,
      vx: (Math.random() - 0.5) * 10,
      vy: Math.random() * -8 - 4,
      size: Math.random() * 7 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI,
      rotSpeed: (Math.random() - 0.5) * 0.3,
      gravity: 0.28,
    }));

    let frame = 0;
    const maxFrames = 120;

    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      frame += 1;
      if (frame < maxFrames) {
        requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    tick();
  }

  // ---------- Data fetching ----------

  async function fetchState() {
    const res = await fetch('/api/state');
    return res.json();
  }

  async function refresh() {
    const state = await fetchState();
    render(state);
    return state;
  }

  async function logPushups(amount) {
    const res = await fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: amount }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast('⚠️ Could not log push-ups', err.error || '');
      return;
    }
    const state = await res.json();
    render(state);

    el.todayCount.classList.remove('pulse');
    void el.todayCount.offsetWidth; // restart animation
    el.todayCount.classList.add('pulse');

    if (state.targetReachedNow) {
      burstConfetti();
      showToast('🎉 Daily goal smashed!', `${state.todayCount}/${state.dailyTarget} reps done.`);
      notifyLocally('🎉 Daily goal smashed!', `You hit ${state.todayCount}/${state.dailyTarget} push-ups today.`);
    }

    for (const ach of state.newAchievements || []) {
      showToast(`${ach.emoji} Achievement unlocked!`, ach.name);
      notifyLocally(`${ach.emoji} Achievement unlocked: ${ach.name}`, ach.desc);
    }
  }

  // ---------- Push notifications ----------

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i += 1) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  function notifyLocally(title, body) {
    if (!swRegistration || Notification.permission !== 'granted') return;
    navigator.serviceWorker.controller &&
      navigator.serviceWorker.controller.postMessage({
        type: 'LOCAL_NOTIFY',
        payload: { title, body },
      });
  }

  async function enableNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      el.notifyStatus.textContent = 'Push notifications are not supported in this browser.';
      return;
    }

    try {
      el.notifyStatus.textContent = 'Requesting permission…';
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        el.notifyStatus.textContent = 'Permission denied. Enable notifications in your browser settings to use this feature.';
        return;
      }

      swRegistration = await navigator.serviceWorker.ready;

      const keyRes = await fetch('/api/vapid-public-key');
      const { key } = await keyRes.json();
      if (!key) {
        el.notifyStatus.textContent =
          'Server has no VAPID key configured yet. Run "npm run generate-vapid-keys" and restart the server.';
        return;
      }

      let subscription = await swRegistration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
      }

      await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription }),
      });

      el.notifyStatus.textContent = "You're all set! Daily reminders will arrive automatically.";
      showToast('🔔 Notifications enabled', "We'll remind you daily to hit your goal.");
      await refresh();
    } catch (err) {
      console.error(err);
      el.notifyStatus.textContent = 'Something went wrong enabling notifications: ' + err.message;
    }
  }

  async function sendTestNotification() {
    el.notifyStatus.textContent = 'Sending test notification…';
    const res = await fetch('/api/test-notification', { method: 'POST' });
    const data = await res.json();
    if (data.sentTo === 0 || data.sent === 0) {
      el.notifyStatus.textContent = 'No active subscribers yet — enable notifications first.';
    } else {
      el.notifyStatus.textContent = `Test sent to ${data.sent} device(s).`;
    }
  }

  // ---------- Settings modal ----------

  function openSettings() {
    el.settingsOverlay.classList.remove('hidden');
  }

  function closeSettings() {
    el.settingsOverlay.classList.add('hidden');
  }

  async function saveSettings(e) {
    e.preventDefault();
    const payload = {
      dailyTarget: parseInt(el.settingTarget.value, 10),
      reminderTime: el.settingMorning.value,
      eveningCheckTime: el.settingEvening.value,
    };
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const state = await res.json();
    render(state);
    closeSettings();
    showToast('⚙️ Settings saved', 'Your reminder schedule has been updated.');
  }

  // ---------- Wiring ----------

  function init() {
    el.quickButtons.forEach((btn) => {
      btn.addEventListener('click', () => logPushups(parseInt(btn.dataset.amount, 10)));
    });

    el.customForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseInt(el.customAmount.value, 10);
      if (amount > 0) {
        logPushups(amount);
        el.customAmount.value = '';
      }
    });

    el.enableNotifyBtn.addEventListener('click', enableNotifications);
    el.testNotifyBtn.addEventListener('click', sendTestNotification);

    el.settingsBtn.addEventListener('click', openSettings);
    el.closeSettingsBtn.addEventListener('click', closeSettings);
    el.settingsOverlay.addEventListener('click', (e) => {
      if (e.target === el.settingsOverlay) closeSettings();
    });
    el.settingsForm.addEventListener('submit', saveSettings);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          swRegistration = reg;
        })
        .catch((err) => console.error('SW registration failed', err));
    }

    refresh();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
