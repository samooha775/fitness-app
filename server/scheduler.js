const cron = require('node-cron');
const { readDb, writeDb } = require('./db');
const { sendNotificationToAll } = require('./push');
const { formatDate, pick, REMINDER_MESSAGES, EVENING_MESSAGES } = require('./logic');

let morningTask = null;
let eveningTask = null;

function timeToCron(hhmm) {
  const [h, m] = String(hhmm || '08:00')
    .split(':')
    .map((n) => parseInt(n, 10));
  const hour = Number.isFinite(h) ? h : 8;
  const minute = Number.isFinite(m) ? m : 0;
  return `${minute} ${hour} * * *`;
}

async function runMorningReminder() {
  const db = readDb();
  if (db.subscriptions.length === 0) return;

  const message = pick(REMINDER_MESSAGES);
  const streakLine = db.streak > 0 ? ` Current streak: ${db.streak} day${db.streak === 1 ? '' : 's'} 🔥` : '';

  await sendNotificationToAll(db, {
    title: '💪 Push-Up Time',
    body: `${message}${streakLine} Goal: ${db.dailyTarget} reps.`,
    icon: '/icons/icon.svg',
    badge: '/icons/badge.svg',
    data: { url: '/' },
  });
  writeDb(db);
}

async function runEveningCheck() {
  const db = readDb();
  if (db.subscriptions.length === 0) return;

  const today = formatDate(new Date());
  const entry = db.logs.find((l) => l.date === today);
  const todayCount = entry ? entry.count : 0;

  if (todayCount >= db.dailyTarget) return; // goal already met, no nag needed

  const message = pick(EVENING_MESSAGES);
  await sendNotificationToAll(db, {
    title: '🔥 Streak Check-In',
    body: `${message} You're at ${todayCount}/${db.dailyTarget} today.`,
    icon: '/icons/icon.svg',
    badge: '/icons/badge.svg',
    data: { url: '/' },
  });
  writeDb(db);
}

function rescheduleJobs(settings) {
  if (morningTask) morningTask.stop();
  if (eveningTask) eveningTask.stop();

  morningTask = cron.schedule(timeToCron(settings.reminderTime), runMorningReminder);
  eveningTask = cron.schedule(timeToCron(settings.eveningCheckTime), runEveningCheck);
}

function initScheduler() {
  const db = readDb();
  rescheduleJobs(db.settings);
}

module.exports = { initScheduler, rescheduleJobs, runMorningReminder, runEveningCheck };
