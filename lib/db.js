'use strict';
/* SQLite schema, badge catalog, badge awards, and seed data for GamerScore Keep. */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { hashPassword } = require('./auth');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'gamerscore.db');

let _db = null;

function getDb() {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const fresh = !fs.existsSync(DB_PATH);
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  createSchema(_db);
  // lightweight migrations for databases created before these columns existed
  const migrations = [
    `ALTER TABLE game_players ADD COLUMN eliminated INTEGER NOT NULL DEFAULT 0`,
    `CREATE TABLE IF NOT EXISTS score_edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      round_number INTEGER NOT NULL,
      game_player_id INTEGER NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
      old_points REAL NOT NULL DEFAULT 0,
      new_points REAL NOT NULL DEFAULT 0,
      edited_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      edited_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_edits_game ON score_edits(game_id, round_number)`,
  ];
  for (const sql of migrations) { try { _db.exec(sql); } catch { /* already applied */ } }
  if (fresh) seed(_db);
  return _db;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_emoji TEXT DEFAULT '🎮',
      avatar_color TEXT DEFAULT '#6366F1',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tokens_user ON auth_tokens(user_id);
    CREATE TABLE IF NOT EXISTS families (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      room_code TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS family_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at INTEGER NOT NULL,
      UNIQUE(family_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      game_type TEXT NOT NULL DEFAULT 'mexican_train',
      scoring_mode TEXT NOT NULL DEFAULT 'rounds',
      win_condition TEXT NOT NULL DEFAULT 'lowest',
      target_score REAL DEFAULT NULL,
      domino_set TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      current_round INTEGER NOT NULL DEFAULT 1,
      dealer_index INTEGER NOT NULL DEFAULT 0,
      turn_index INTEGER NOT NULL DEFAULT 0,
      scorekeeper_user_id INTEGER DEFAULT NULL,
      created_at INTEGER NOT NULL,
      completed_at INTEGER DEFAULT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_games_family ON games(family_id, status);
    CREATE TABLE IF NOT EXISTS game_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      user_id INTEGER DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      avatar_emoji TEXT DEFAULT '🎮',
      avatar_color TEXT DEFAULT '#6366F1',
      train_open INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_players_game ON game_players(game_id);
    CREATE TABLE IF NOT EXISTS score_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      round_number INTEGER NOT NULL,
      game_player_id INTEGER NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
      points REAL NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'round',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_scores_game ON score_events(game_id, round_number);
    CREATE TABLE IF NOT EXISTS engines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      double_value INTEGER NOT NULL,
      played INTEGER NOT NULL DEFAULT 0,
      round_number INTEGER DEFAULT NULL,
      played_at INTEGER DEFAULT NULL,
      UNIQUE(game_id, double_value)
    );
    CREATE TABLE IF NOT EXISTS player_badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      game_player_id INTEGER NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
      badge_key TEXT NOT NULL,
      awarded_at INTEGER NOT NULL,
      UNIQUE(game_id, game_player_id, badge_key)
    );
  `);
}

/* ---------------- Badge catalog ---------------- */

const BADGE_CATALOG = {
  train_conductor: {
    key: 'train_conductor',
    name: 'Train Conductor',
    description: 'Win a Mexican Train game with a total under 50 points',
  },
  double_trouble: {
    key: 'double_trouble',
    name: 'Double Trouble',
    description: '3 or more engine rounds played in a single game',
  },
  sniper: {
    key: 'sniper',
    name: 'Sniper',
    description: 'Win by a margin of fewer than 5 points over the runner-up',
  },
  clean_sweep: {
    key: 'clean_sweep',
    name: 'Clean Sweep',
    description: 'Score 0 points in 3 consecutive rounds',
  },
};

/* game_player_id -> total points (SUM of all score events) */
function playerTotals(db, gameId) {
  const rows = db.prepare(`
    SELECT game_player_id, COALESCE(SUM(points), 0) AS total
    FROM score_events WHERE game_id = ? GROUP BY game_player_id`).all(gameId);
  const totals = {};
  for (const r of rows) totals[r.game_player_id] = r.total;
  return totals;
}

/* Award badges for a game using the real completion rules.
   Returns [{badge_key, player_id, player_name}]. Idempotent (UNIQUE guard). */
function awardBadgesForGame(db, gameId) {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
  if (!game) return [];
  const players = db.prepare('SELECT * FROM game_players WHERE game_id = ? ORDER BY sort_order, id').all(gameId);
  if (!players.length) return [];
  const totals = playerTotals(db, gameId);
  const tot = (id) => totals[id] || 0;
  // Eliminated (bankrupt) players are out of win contention for badges too.
  const contenders = players.filter((p) => !p.eliminated);
  if (!contenders.length) return [];
  const sorted = [...contenders].sort((a, b) =>
    game.win_condition === 'lowest' ? tot(a.id) - tot(b.id) : tot(b.id) - tot(a.id));
  const winner = sorted[0];
  const runnerUp = sorted[1] || null;

  const awarded = [];
  const grant = (playerId, badgeKey) => {
    const p = players.find((x) => x.id === playerId);
    const r = db.prepare(`
      INSERT OR IGNORE INTO player_badges (game_id, game_player_id, badge_key, awarded_at)
      VALUES (?, ?, ?, ?)`).run(gameId, playerId, badgeKey, Date.now());
    if (r.changes > 0) awarded.push({ badge_key: badgeKey, player_id: playerId, player_name: p ? p.name : '' });
  };

  // Train Conductor: win a mexican_train game with total < 50
  if (game.game_type === 'mexican_train' && tot(winner.id) < 50) grant(winner.id, 'train_conductor');

  // Double Trouble: 3+ engines played in the game
  const enginesPlayed = db.prepare('SELECT COUNT(*) AS n FROM engines WHERE game_id = ? AND played = 1').get(gameId).n;
  if (enginesPlayed >= 3) grant(winner.id, 'double_trouble');

  // Sniper: win margin over runner-up (absolute) < 5
  if (runnerUp && Math.abs(tot(winner.id) - tot(runnerUp.id)) < 5) grant(winner.id, 'sniper');

  // Clean Sweep: 0 points in 3 consecutive rounds (any player)
  const roundRows = db.prepare(`
    SELECT round_number, game_player_id, COALESCE(SUM(points), 0) AS pts
    FROM score_events WHERE game_id = ? GROUP BY round_number, game_player_id`).all(gameId);
  const perPlayer = {};
  players.forEach((p) => { perPlayer[p.id] = {}; });
  for (const r of roundRows) perPlayer[r.game_player_id][r.round_number] = r.pts;
  const roundNumbers = [...new Set(roundRows.map((r) => r.round_number))].sort((a, b) => a - b);
  for (const p of players) {
    for (let i = 0; i + 2 < roundNumbers.length; i++) {
      const a = roundNumbers[i], b = roundNumbers[i + 1], c = roundNumbers[i + 2];
      if (b === a + 1 && c === a + 2 &&
          (perPlayer[p.id][a] || 0) === 0 &&
          (perPlayer[p.id][b] || 0) === 0 &&
          (perPlayer[p.id][c] || 0) === 0) {
        grant(p.id, 'clean_sweep');
        break;
      }
    }
  }
  return awarded;
}

/* ---------------- Seed (fresh installs only) ---------------- */

function seed(db) {
  const now = Date.now();

  const insUser = db.prepare(`
    INSERT INTO users (email, password_hash, display_name, avatar_emoji, avatar_color, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const demoUsers = [
    ['maya@demo.local', 'Maya', '🦊', '#6366F1'],
    ['leo@demo.local', 'Leo', '🐢', '#10B981'],
    ['sofia@demo.local', 'Sofia', '🦄', '#F59E0B'],
    ['noah@demo.local', 'Noah', '🐙', '#EC4899'],
  ];
  const uids = {};
  for (const [email, name, emoji, color] of demoUsers) {
    uids[name] = insUser.run(email, hashPassword('demo1234'), name, emoji, color, now).lastInsertRowid;
  }

  const famId = db.prepare('INSERT INTO families (name, room_code, created_at) VALUES (?, ?, ?)')
    .run('Demo Family', '482916', now).lastInsertRowid;
  const insMem = db.prepare('INSERT INTO family_members (family_id, user_id, joined_at) VALUES (?, ?, ?)');
  Object.values(uids).forEach((id) => insMem.run(famId, id, now));

  const insPlayer = db.prepare(`
    INSERT INTO game_players (game_id, user_id, name, avatar_emoji, avatar_color, train_open, sort_order)
    VALUES (?, ?, ?, ?, ?, 0, ?)`);
  const insScore = db.prepare(`
    INSERT INTO score_events (game_id, round_number, game_player_id, points, kind, created_at)
    VALUES (?, ?, ?, ?, 'round', ?)`);
  const addPlayers = (gameId, names) => {
    const pids = {};
    names.forEach((name, i) => {
      const u = db.prepare('SELECT avatar_emoji, avatar_color FROM users WHERE id = ?').get(uids[name]);
      pids[name] = insPlayer.run(gameId, uids[name], name, u.avatar_emoji, u.avatar_color, i).lastInsertRowid;
    });
    return pids;
  };
  const addRounds = (gameId, pids, rounds) => {
    rounds.forEach((round, i) => {
      for (const [name, pts] of Object.entries(round)) insScore.run(gameId, i + 1, pids[name], pts, now);
    });
    db.prepare('UPDATE games SET current_round = ? WHERE id = ?').run(rounds.length + 1, gameId);
  };

  /* Completed mexican_train game — run through the real complete path */
  const g1 = db.prepare(`
    INSERT INTO games (family_id, name, game_type, scoring_mode, win_condition, target_score, domino_set,
      status, current_round, dealer_index, turn_index, scorekeeper_user_id, created_at, completed_at, updated_at)
    VALUES (?, 'Friday Night Trains', 'mexican_train', 'rounds', 'lowest', NULL, 'double12',
      'active', 1, 0, 0, NULL, ?, NULL, ?)`).run(famId, now - 2 * 86400000, now).lastInsertRowid;
  const p1 = addPlayers(g1, ['Maya', 'Leo', 'Sofia', 'Noah']);
  const insEngine = db.prepare('INSERT INTO engines (game_id, double_value, played, round_number, played_at) VALUES (?, ?, 0, NULL, NULL)');
  for (let d = 0; d <= 12; d++) insEngine.run(g1, d);
  addRounds(g1, p1, [
    { Maya: 10, Leo: 8, Sofia: 15, Noah: 20 },
    { Maya: 0, Leo: 5, Sofia: 5, Noah: 15 },
    { Maya: 0, Leo: 7, Sofia: 8, Noah: 5 },
    { Maya: 0, Leo: 3, Sofia: 10, Noah: 12 },
    { Maya: 12, Leo: 6, Sofia: 6, Noah: 10 },
    { Maya: 10, Leo: 4, Sofia: 9, Noah: 8 },
  ]);
  const playEngine = db.prepare('UPDATE engines SET played = 1, round_number = ?, played_at = ? WHERE game_id = ? AND double_value = ?');
  playEngine.run(1, now, g1, 12);
  playEngine.run(2, now, g1, 9);
  playEngine.run(4, now, g1, 5);
  // real completion: mark completed, then award via the real rule engine
  db.prepare('UPDATE games SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?')
    .run('completed', now - 86400000, now - 86400000, g1);
  awardBadgesForGame(db, g1);

  /* Active custom game */
  const g2 = db.prepare(`
    INSERT INTO games (family_id, name, game_type, scoring_mode, win_condition, target_score, domino_set,
      status, current_round, dealer_index, turn_index, scorekeeper_user_id, created_at, completed_at, updated_at)
    VALUES (?, 'Sunday Showdown', 'custom', 'rounds', 'highest', NULL, NULL,
      'active', 3, 0, 0, NULL, ?, NULL, ?)`).run(famId, now - 86400000, now).lastInsertRowid;
  const p2 = addPlayers(g2, ['Maya', 'Leo', 'Sofia', 'Noah']);
  addRounds(g2, p2, [
    { Maya: 120, Leo: 95, Sofia: 140, Noah: 80 },
    { Maya: 60, Leo: 110, Sofia: 45, Noah: 90 },
  ]);
  db.prepare('UPDATE games SET current_round = 3 WHERE id = ?').run(g2);
}

module.exports = { getDb, DB_PATH, BADGE_CATALOG, awardBadgesForGame, playerTotals };
