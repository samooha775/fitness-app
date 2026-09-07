require('dotenv').config();

const path = require('path');
const express = require('express');

const { readDb, writeDb } = require('./db');
const { getVapidPublicKey, sendNotificationToAll } = require('./push');
const { logPushups, computeLevelInfo, ACHIEVEMENTS, formatDate } = require('./logic');
const { initScheduler, rescheduleJobs } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function buildStateResponse(db) {
  const today = formatDate(new Date());
  const todayEntry = db.logs.find((l) => l.date === today);
  const todayCount = todayEntry ? todayEntry.count : 0;

  const history = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = formatDate(d);
    const entry = db.logs.find((l) => l.date === dateStr);
    history.push({ date: dateStr, count: entry ? entry.count : 0 });
  }

  const levelInfo = computeLevelInfo(db.totalXP);
  const lifetimeTotal = db.logs.reduce((sum, l) => sum + l.count, 0);

  const achievements = ACHIEVEMENTS.map((a) => ({
    id: a.id,
    name: a.name,
    emoji: a.emoji,
    desc: a.desc,
    unlocked: db.achievements.includes(a.id),
  }));

  return {
    todayCount,
    dailyTarget: db.dailyTarget,
    streak: db.streak,
    bestStreak: db.bestStreak,
    totalXP: db.totalXP,
    lifetimeTotal,
    level: levelInfo,
    history,
    achievements,
    settings: db.settings,
    subscriberCount: db.subscriptions.length,
  };
}

app.get('/api/vapid-public-key', (req, res) => {
  res.json({ key: getVapidPublicKey() });
});

app.get('/api/state', (req, res) => {
  const db = readDb();
  res.json(buildStateResponse(db));
});

app.post('/api/subscribe', (req, res) => {
  const db = readDb();
  const sub = req.body.subscription;
  if (!sub || !sub.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription object.' });
  }
  if (!db.subscriptions.find((s) => s.endpoint === sub.endpoint)) {
    db.subscriptions.push(sub);
    writeDb(db);
  }
  res.json({ ok: true });
});

app.post('/api/unsubscribe', (req, res) => {
  const db = readDb();
  const { endpoint } = req.body;
  db.subscriptions = db.subscriptions.filter((s) => s.endpoint !== endpoint);
  writeDb(db);
  res.json({ ok: true });
});

app.post('/api/log', (req, res) => {
  const db = readDb();
  const count = Math.max(0, Math.min(1000, parseInt(req.body.count, 10) || 0));
  if (count <= 0) {
    return res.status(400).json({ error: 'count must be a positive integer.' });
  }

  const { newAchievements, targetReachedNow } = logPushups(db, count);
  writeDb(db);

  res.json({
    ...buildStateResponse(db),
    newAchievements,
    targetReachedNow,
  });
});

app.post('/api/settings', (req, res) => {
  const db = readDb();
  const { dailyTarget, reminderTime, eveningCheckTime } = req.body;

  if (dailyTarget !== undefined) {
    const n = parseInt(dailyTarget, 10);
    if (Number.isFinite(n) && n > 0) db.dailyTarget = Math.min(1000, n);
  }
  if (reminderTime && /^\d{1,2}:\d{2}$/.test(reminderTime)) {
    db.settings.reminderTime = reminderTime;
  }
  if (eveningCheckTime && /^\d{1,2}:\d{2}$/.test(eveningCheckTime)) {
    db.settings.eveningCheckTime = eveningCheckTime;
  }

  writeDb(db);
  rescheduleJobs(db.settings);
  res.json(buildStateResponse(db));
});

app.post('/api/test-notification', async (req, res) => {
  const db = readDb();
  const result = await sendNotificationToAll(db, {
    title: '💪 Test Notification',
    body: "If you can see this, push notifications are working. Let's get those reps in!",
    icon: '/icons/icon.svg',
    badge: '/icons/badge.svg',
    data: { url: '/' },
  });
  writeDb(db);
  res.json({ ok: true, ...result, subscriberCount: db.subscriptions.length });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`💪 Push-up fitness app running at http://localhost:${PORT}`);
  initScheduler();
});
