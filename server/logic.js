// Core gamification logic: streaks, XP/levels, achievements, and copywriting.

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(`${dateStrA}T00:00:00`);
  const b = new Date(`${dateStrB}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

const XP_PER_REP = 1;
const TARGET_BONUS_XP = 50;

// level N starts at 50 * (N-1)^2 XP (a gently accelerating curve)
function computeLevelInfo(totalXP) {
  const level = Math.floor(Math.sqrt(totalXP / 50)) + 1;
  const baseXP = 50 * Math.pow(level - 1, 2);
  const nextXP = 50 * Math.pow(level, 2);
  const progress = nextXP === baseXP ? 1 : (totalXP - baseXP) / (nextXP - baseXP);
  return {
    level,
    xpIntoLevel: totalXP - baseXP,
    xpForLevel: nextXP - baseXP,
    progress: Math.max(0, Math.min(1, progress)),
  };
}

function lifetimeTotal(db) {
  return db.logs.reduce((sum, l) => sum + l.count, 0);
}

const ACHIEVEMENTS = [
  {
    id: 'first_rep',
    name: 'First Rep',
    emoji: '🎯',
    desc: 'Log your very first push-up.',
    check: (db) => lifetimeTotal(db) >= 1,
  },
  {
    id: 'half_century_day',
    name: 'Half Century',
    emoji: '🥉',
    desc: '50 push-ups in a single day.',
    check: (db, today) => today.count >= 50,
  },
  {
    id: 'century_day',
    name: 'Century Club',
    emoji: '🥈',
    desc: '100 push-ups in a single day.',
    check: (db, today) => today.count >= 100,
  },
  {
    id: 'double_century_day',
    name: 'Double Century',
    emoji: '🥇',
    desc: '200 push-ups in a single day.',
    check: (db, today) => today.count >= 200,
  },
  {
    id: 'week_warrior',
    name: 'Week Warrior',
    emoji: '🔥',
    desc: 'Reach a 7-day streak.',
    check: (db) => db.streak >= 7,
  },
  {
    id: 'fortnight_fire',
    name: 'Fortnight Fire',
    emoji: '🔥🔥',
    desc: 'Reach a 14-day streak.',
    check: (db) => db.streak >= 14,
  },
  {
    id: 'month_master',
    name: 'Month Master',
    emoji: '🌋',
    desc: 'Reach a 30-day streak.',
    check: (db) => db.streak >= 30,
  },
  {
    id: 'thousand_club',
    name: 'Thousand Club',
    emoji: '💎',
    desc: '1,000 lifetime push-ups.',
    check: (db) => lifetimeTotal(db) >= 1000,
  },
  {
    id: 'five_k_club',
    name: 'Five-K Legend',
    emoji: '👑',
    desc: '5,000 lifetime push-ups.',
    check: (db) => lifetimeTotal(db) >= 5000,
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    emoji: '🌅',
    desc: 'Log push-ups before 7am.',
    check: (db, today) =>
      today.timestamps.some((ts) => new Date(ts).getHours() < 7),
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    emoji: '🌙',
    desc: 'Log push-ups after 10pm.',
    check: (db, today) =>
      today.timestamps.some((ts) => new Date(ts).getHours() >= 22),
  },
  {
    id: 'consistency_king',
    name: 'Consistency King',
    emoji: '👑',
    desc: 'Reach a 50-day best streak.',
    check: (db) => db.bestStreak >= 50,
  },
];

/**
 * Mutates `db` in place: adds a log entry for today, updates streak/XP,
 * and returns which achievements were newly unlocked and whether today's
 * target was just crossed by this call.
 */
function logPushups(db, count) {
  const now = new Date();
  const today = formatDate(now);

  let entry = db.logs.find((l) => l.date === today);
  if (!entry) {
    entry = { date: today, count: 0, timestamps: [] };
    db.logs.push(entry);
  }

  const wasZeroToday = entry.count === 0;
  const wasBelowTarget = entry.count < db.dailyTarget;

  entry.count += count;
  entry.timestamps.push(now.toISOString());

  db.totalXP += count * XP_PER_REP;

  const targetReachedNow = wasBelowTarget && entry.count >= db.dailyTarget;
  if (targetReachedNow) {
    db.totalXP += TARGET_BONUS_XP;
  }

  if (wasZeroToday) {
    if (!db.lastLogDate) {
      db.streak = 1;
    } else {
      const diff = daysBetween(db.lastLogDate, today);
      if (diff === 1) {
        db.streak += 1;
      } else if (diff > 1) {
        db.streak = 1;
      }
      // diff === 0 shouldn't happen here since wasZeroToday, diff <= 0 defensively ignored
    }
    db.lastLogDate = today;
    db.bestStreak = Math.max(db.bestStreak, db.streak);
  }

  // Cap history so the file doesn't grow forever; keep a rolling year.
  if (db.logs.length > 400) {
    db.logs = db.logs.slice(-400);
  }

  const newAchievements = [];
  for (const ach of ACHIEVEMENTS) {
    if (db.achievements.includes(ach.id)) continue;
    if (ach.check(db, entry)) {
      db.achievements.push(ach.id);
      newAchievements.push(ach);
    }
  }

  return { entry, newAchievements, targetReachedNow };
}

const REMINDER_MESSAGES = [
  "💪 Rise and grind! Today's push-ups aren't going to do themselves.",
  '🔥 Your streak is counting on you — a few reps keep it alive.',
  '🚀 Two minutes, zero excuses. Go log some push-ups!',
  '⚡ Small reps, big gains. Time to hit the floor.',
  '🏆 Champions train even on the days they don\'t feel like it. Let\'s go.',
  '🐸 Just start with one. Momentum does the rest.',
  '💥 Push-up o\'clock! Your future self says thanks in advance.',
];

const EVENING_MESSAGES = [
  "⏰ Streak alert! You haven't logged any push-ups today.",
  "🕗 Day's winding down and today's goal is still open. Quick set?",
  '🚨 Don\'t let the streak slip — a handful of reps saves the day.',
  "🌙 Last call for today's push-ups. Future you is watching.",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = {
  formatDate,
  daysBetween,
  computeLevelInfo,
  lifetimeTotal,
  ACHIEVEMENTS,
  logPushups,
  REMINDER_MESSAGES,
  EVENING_MESSAGES,
  pick,
};
