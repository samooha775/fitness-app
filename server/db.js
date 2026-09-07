const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const DEFAULT_STATE = {
  subscriptions: [], // web push subscription objects
  logs: [], // { date: 'YYYY-MM-DD', count: number, timestamps: [iso strings] }
  totalXP: 0,
  streak: 0,
  bestStreak: 0,
  lastLogDate: null,
  dailyTarget: 30,
  achievements: [], // unlocked achievement ids
  settings: {
    reminderTime: '08:00',
    eveningCheckTime: '20:00',
  },
};

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_STATE, null, 2));
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    parsed = {};
  }
  // Merge with defaults so new fields introduced later never crash old data files.
  return {
    ...DEFAULT_STATE,
    ...parsed,
    settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
  };
}

function writeDb(state) {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2));
}

module.exports = { readDb, writeDb, DEFAULT_STATE };
