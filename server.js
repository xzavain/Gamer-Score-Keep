'use strict';
/* GamerScore Keep — family game-night scorekeeping API. */

const express = require('express');
const path = require('path');
const { getDb, BADGE_CATALOG, awardBadgesForGame, playerTotals } = require('./lib/db');
const { hashPassword, verifyPassword, newToken, expiryFor } = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ---------------- Auth helpers ---------------- */

function cleanExpiredTokens(db) {
  db.prepare('DELETE FROM auth_tokens WHERE expires_at < ?').run(Date.now());
}

function tokenToUserId(db, token) {
  if (!token) return null;
  const row = db.prepare('SELECT user_id, expires_at FROM auth_tokens WHERE token = ?').get(token);
  if (!row || row.expires_at < Date.now()) {
    if (row) db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token);
    return null;
  }
  return row.user_id;
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

function requireAuth(req, res, next) {
  const db = getDb();
  cleanExpiredTokens(db);
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const userId = tokenToUserId(db, token);
  if (!userId) return res.status(401).json({ error: 'Session expired' });
  req.token = token;
  req.userId = userId;
  next();
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    avatar_emoji: row.avatar_emoji,
    avatar_color: row.avatar_color,
  };
}

/* ---------------- Family / game access guards ---------------- */

function isMember(db, userId, familyId) {
  return !!db.prepare('SELECT 1 FROM family_members WHERE family_id = ? AND user_id = ?').get(familyId, userId);
}

function requireGameAccess(db, userId, gameId, res) {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
  if (!game) { res.status(404).json({ error: 'Game not found' }); return null; }
  if (!isMember(db, userId, game.family_id)) {
    res.status(403).json({ error: 'Not a member of this family' });
    return null;
  }
  return game;
}

/* ---------------- SSE stream registry ---------------- */

const streams = new Map(); // gameId -> Set(res)

function broadcast(gameId) {
  const set = streams.get(Number(gameId));
  if (!set || !set.size) return;
  let payload;
  try { payload = JSON.stringify(buildGameDetail(getDb(), Number(gameId))); }
  catch { return; }
  const msg = `event: game_update\ndata: ${payload}\n\n`;
  for (const res of [...set]) {
    try { res.write(msg); } catch { set.delete(res); }
  }
  if (!set.size) streams.delete(Number(gameId));
}

/* ---------------- Game detail builder ---------------- */

function buildGameDetail(db, gameId) {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
  if (!game) return null;
  const players = db.prepare('SELECT * FROM game_players WHERE game_id = ? ORDER BY sort_order, id').all(gameId);
  const totals = playerTotals(db, gameId);
  const tot = (id) => totals[id] || 0;
  // Eliminated (bankrupt) players keep their totals but are out of win contention.
  const contenders = players.filter((p) => !p.eliminated);
  const sorted = [...contenders].sort((a, b) =>
    game.win_condition === 'lowest' ? tot(a.id) - tot(b.id) : tot(b.id) - tot(a.id));
  const rankOf = {};
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    rankOf[p.id] = (i > 0 && tot(p.id) === tot(prev.id)) ? rankOf[prev.id] : i + 1;
  });
  players.filter((p) => p.eliminated).forEach((p) => { rankOf[p.id] = sorted.length + 1; });
  const roundRows = db.prepare(`
    SELECT round_number, game_player_id, COALESCE(SUM(points), 0) AS pts
    FROM score_events WHERE game_id = ? GROUP BY round_number, game_player_id
    ORDER BY round_number`).all(gameId);
  const byRound = {};
  for (const r of roundRows) {
    (byRound[r.round_number] ||= {});
    byRound[r.round_number][r.game_player_id] = r.pts;
  }
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b).map((n) => {
    const scores = {};
    players.forEach((p) => { scores[p.id] = byRound[n][p.id] || 0; });
    return { round_number: n, scores };
  });
  const engines = db.prepare('SELECT double_value, played, round_number FROM engines WHERE game_id = ? ORDER BY double_value DESC').all(gameId);
  const badges = db.prepare(`
    SELECT pb.badge_key, pb.game_player_id AS player_id, gp.name AS player_name
    FROM player_badges pb JOIN game_players gp ON gp.id = pb.game_player_id
    WHERE pb.game_id = ? ORDER BY pb.awarded_at`).all(gameId);
  return {
    game,
    players: players.map((p) => ({
      id: p.id, name: p.name, avatar_emoji: p.avatar_emoji, avatar_color: p.avatar_color,
      user_id: p.user_id, train_open: p.train_open, eliminated: !!p.eliminated, sort_order: p.sort_order,
      total: tot(p.id), rank: rankOf[p.id],
    })),
    rounds,
    engines,
    badges,
    standings: sorted.map((p) => p.id).concat(players.filter((p) => p.eliminated).map((p) => p.id)),
  };
}

/* ---------------- Auth routes ---------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/auth/register', (req, res) => {
  const db = getDb();
  const { email, password, display_name, avatar_emoji, avatar_color } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Invalid email address' });
  if (String(password || '').length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!String(display_name || '').trim()) return res.status(400).json({ error: 'Display name is required' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail)) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO users (email, password_hash, display_name, avatar_emoji, avatar_color, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
      cleanEmail, hashPassword(password), String(display_name).trim(),
      String(avatar_emoji || '🎮').slice(0, 16), String(avatar_color || '#6366F1').slice(0, 16), now);
  const token = newToken();
  db.prepare('INSERT INTO auth_tokens (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, info.lastInsertRowid, now, expiryFor(false));
  res.status(201).json({ token, user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)) });
});

app.post('/api/auth/login', (req, res) => {
  const db = getDb();
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  cleanExpiredTokens(db);
  const now = Date.now();
  const token = newToken();
  db.prepare('INSERT INTO auth_tokens (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, user.id, now, expiryFor(false));
  res.json({ token, user: publicUser(user) });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM auth_tokens WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: publicUser(user) });
});

/* ---------------- Families ---------------- */

app.post('/api/families', requireAuth, (req, res) => {
  const db = getDb();
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'Family name is required' });
  let code = null;
  for (let i = 0; i < 50; i++) {
    const candidate = String(Math.floor(100000 + Math.random() * 900000));
    if (!db.prepare('SELECT id FROM families WHERE room_code = ?').get(candidate)) { code = candidate; break; }
  }
  if (!code) return res.status(500).json({ error: 'Could not generate a room code' });
  const now = Date.now();
  const info = db.prepare('INSERT INTO families (name, room_code, created_at) VALUES (?, ?, ?)')
    .run(name, code, now);
  db.prepare('INSERT INTO family_members (family_id, user_id, joined_at) VALUES (?, ?, ?)')
    .run(info.lastInsertRowid, req.userId, now);
  res.status(201).json({ family: { id: info.lastInsertRowid, name, room_code: code } });
});

app.post('/api/families/join', requireAuth, (req, res) => {
  const db = getDb();
  const code = String((req.body || {}).room_code || '').trim();
  const fam = db.prepare('SELECT * FROM families WHERE room_code = ?').get(code);
  if (!fam) return res.status(404).json({ error: 'Room code not found' });
  db.prepare('INSERT OR IGNORE INTO family_members (family_id, user_id, joined_at) VALUES (?, ?, ?)')
    .run(fam.id, req.userId, Date.now());
  res.json({ family: { id: fam.id, name: fam.name, room_code: fam.room_code } });
});

app.get('/api/families', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT f.id, f.name, f.room_code,
      (SELECT COUNT(*) FROM family_members fm WHERE fm.family_id = f.id) AS member_count
    FROM families f
    JOIN family_members mine ON mine.family_id = f.id AND mine.user_id = ?
    ORDER BY f.created_at DESC`).all(req.userId);
  res.json(rows);
});

app.get('/api/families/:id', requireAuth, (req, res) => {
  const db = getDb();
  const famId = Number(req.params.id);
  if (!isMember(db, req.userId, famId)) return res.status(403).json({ error: 'Not a member of this family' });
  const fam = db.prepare('SELECT id, name, room_code, created_at FROM families WHERE id = ?').get(famId);
  if (!fam) return res.status(404).json({ error: 'Family not found' });
  const members = db.prepare(`
    SELECT fm.user_id, u.display_name, u.avatar_emoji, u.avatar_color, fm.joined_at
    FROM family_members fm JOIN users u ON u.id = fm.user_id
    WHERE fm.family_id = ? ORDER BY fm.joined_at`).all(famId);
  res.json({ family: fam, members });
});

app.put('/api/families/:id', requireAuth, (req, res) => {
  const db = getDb();
  const famId = Number(req.params.id);
  if (!isMember(db, req.userId, famId)) return res.status(403).json({ error: 'Not a member of this family' });
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'Family name is required' });
  db.prepare('UPDATE families SET name = ? WHERE id = ?').run(name, famId);
  const fam = db.prepare('SELECT id, name, room_code, created_at FROM families WHERE id = ?').get(famId);
  res.json({ family: fam });
});

app.get('/api/families/:id/badges', requireAuth, (req, res) => {
  const db = getDb();
  const famId = Number(req.params.id);
  if (!isMember(db, req.userId, famId)) return res.status(403).json({ error: 'Not a member of this family' });
  const rows = db.prepare(`
    SELECT pb.badge_key, pb.awarded_at, gp.name AS player_name, gp.avatar_emoji, g.name AS game_name
    FROM player_badges pb
    JOIN game_players gp ON gp.id = pb.game_player_id
    JOIN games g ON g.id = pb.game_id
    WHERE g.family_id = ? ORDER BY pb.awarded_at DESC`).all(famId);
  res.json(rows.map((r) => ({
    badge_key: r.badge_key,
    name: BADGE_CATALOG[r.badge_key] ? BADGE_CATALOG[r.badge_key].name : r.badge_key,
    description: BADGE_CATALOG[r.badge_key] ? BADGE_CATALOG[r.badge_key].description : '',
    player_name: r.player_name,
    avatar_emoji: r.avatar_emoji,
    game_name: r.game_name,
    awarded_at: r.awarded_at,
  })));
});

/* ---------------- Games ---------------- */

const GAME_TYPES = ['mexican_train', 'bingo', 'uno', 'uno_no_mercy', 'monopoly', 'scrabble', 'yahtzee', 'golf', 'hearts', 'custom'];
const SCORING_MODES = ['rounds', 'quick'];
const WIN_CONDITIONS = ['highest', 'lowest'];
const DOMINO_SETS = { double9: 9, double12: 12, double15: 15 };

function gameListItem(g) {
  return {
    id: g.id, family_id: g.family_id, name: g.name, game_type: g.game_type,
    scoring_mode: g.scoring_mode, win_condition: g.win_condition, target_score: g.target_score,
    domino_set: g.domino_set, status: g.status, current_round: g.current_round,
    player_count: g.player_count, updated_at: g.updated_at, created_at: g.created_at,
  };
}

app.get('/api/games', requireAuth, (req, res) => {
  const db = getDb();
  const { family_id, status } = req.query;
  let where = 'WHERE f.id IN (SELECT family_id FROM family_members WHERE user_id = ?)';
  const params = [req.userId];
  if (family_id) {
    if (!isMember(db, req.userId, Number(family_id))) return res.status(403).json({ error: 'Not a member of this family' });
    where += ' AND g.family_id = ?';
    params.push(Number(family_id));
  }
  if (status) { where += ' AND g.status = ?'; params.push(String(status)); }
  const rows = db.prepare(`
    SELECT g.*, COUNT(gp.id) AS player_count
    FROM games g
    JOIN families f ON f.id = g.family_id
    LEFT JOIN game_players gp ON gp.game_id = g.id
    ${where}
    GROUP BY g.id ORDER BY g.updated_at DESC`).all(...params);
  res.json(rows.map(gameListItem));
});

app.post('/api/games', requireAuth, (req, res) => {
  const db = getDb();
  const b = req.body || {};
  const familyId = Number(b.family_id);
  if (!familyId || !isMember(db, req.userId, familyId)) {
    return res.status(403).json({ error: 'Not a member of this family' });
  }
  const name = String(b.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Game name is required' });
  if (!GAME_TYPES.includes(b.game_type)) return res.status(400).json({ error: 'Invalid game_type' });
  if (!SCORING_MODES.includes(b.scoring_mode)) return res.status(400).json({ error: 'Invalid scoring_mode' });
  if (!WIN_CONDITIONS.includes(b.win_condition)) return res.status(400).json({ error: 'Invalid win_condition' });
  const dominoSet = b.domino_set || 'double12';
  if (!DOMINO_SETS[dominoSet]) return res.status(400).json({ error: 'Invalid domino_set' });
  const players = Array.isArray(b.players) ? b.players : [];
  if (!players.length) return res.status(400).json({ error: 'At least one player is required' });

  const now = Date.now();
  const gameId = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO games (family_id, name, game_type, scoring_mode, win_condition, target_score, domino_set,
        status, current_round, dealer_index, turn_index, scorekeeper_user_id, created_at, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, 0, 0, NULL, ?, NULL, ?)`).run(
        familyId, name, b.game_type, b.scoring_mode, b.win_condition,
        b.target_score == null || b.target_score === '' ? null : Number(b.target_score),
        b.game_type === 'mexican_train' ? dominoSet : null, now, now);
    const gid = info.lastInsertRowid;
    const insP = db.prepare(`
      INSERT INTO game_players (game_id, user_id, name, avatar_emoji, avatar_color, train_open, sort_order)
      VALUES (?, ?, ?, ?, ?, 0, ?)`);
    players.forEach((p, i) => {
      insP.run(
        gid,
        p.user_id ? Number(p.user_id) : null,
        String(p.name || `Player ${i + 1}`).slice(0, 60),
        String(p.avatar_emoji || '🎮').slice(0, 16),
        String(p.avatar_color || '#6366F1').slice(0, 16),
        i);
    });
    if (b.game_type === 'mexican_train') {
      const insE = db.prepare('INSERT INTO engines (game_id, double_value, played, round_number, played_at) VALUES (?, ?, 0, NULL, NULL)');
      for (let d = 0; d <= DOMINO_SETS[dominoSet]; d++) insE.run(gid, d);
    }
    return gid;
  })();
  res.status(201).json({ game: db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) });
});

app.get('/api/games/:id', requireAuth, (req, res) => {
  const db = getDb();
  const game = requireGameAccess(db, req.userId, req.params.id, res);
  if (!game) return;
  res.json(buildGameDetail(db, game.id));
});

app.put('/api/games/:id', requireAuth, (req, res) => {
  const db = getDb();
  const game = requireGameAccess(db, req.userId, req.params.id, res);
  if (!game) return;
  const b = req.body || {};
  const updates = {};
  if (b.name !== undefined) updates.name = String(b.name).trim() || game.name;
  if (b.status !== undefined) {
    if (!['active', 'paused', 'completed'].includes(b.status)) return res.status(400).json({ error: 'Invalid status' });
    updates.status = b.status;
    if (b.status === 'completed' && !game.completed_at) updates.completed_at = Date.now();
  }
  if (b.scorekeeper_user_id !== undefined) {
    updates.scorekeeper_user_id = b.scorekeeper_user_id == null ? null : Number(b.scorekeeper_user_id);
  }
  if (b.dealer_index !== undefined) updates.dealer_index = Math.max(0, Number(b.dealer_index) || 0);
  if (b.turn_index !== undefined) updates.turn_index = Math.max(0, Number(b.turn_index) || 0);
  const keys = Object.keys(updates);
  if (keys.length) {
    db.prepare(`UPDATE games SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .run(...keys.map((k) => updates[k]), Date.now(), game.id);
  }
  const fresh = db.prepare('SELECT * FROM games WHERE id = ?').get(game.id);
  broadcast(game.id);
  res.json({ game: fresh });
});

app.delete('/api/games/:id', requireAuth, (req, res) => {
  const db = getDb();
  const game = requireGameAccess(db, req.userId, req.params.id, res);
  if (!game) return;
  streams.delete(Number(game.id));
  db.prepare('DELETE FROM games WHERE id = ?').run(game.id);
  res.json({ ok: true });
});

/* ---------------- Scoring mutations ---------------- */

app.post('/api/games/:id/rounds', requireAuth, (req, res) => {
  const db = getDb();
  const game = requireGameAccess(db, req.userId, req.params.id, res);
  if (!game) return;
  const scores = (req.body || {}).scores || {};
  const validIds = new Set(db.prepare('SELECT id FROM game_players WHERE game_id = ?').all(game.id).map((r) => r.id));
  const now = Date.now();
  db.transaction(() => {
    const ins = db.prepare(`
      INSERT INTO score_events (game_id, round_number, game_player_id, points, kind, created_at)
      VALUES (?, ?, ?, ?, 'round', ?)`);
    for (const [pid, pts] of Object.entries(scores)) {
      const id = Number(pid);
      if (!validIds.has(id)) continue;
      ins.run(game.id, game.current_round, id, Number(pts) || 0, now);
    }
    db.prepare('UPDATE games SET current_round = current_round + 1, updated_at = ? WHERE id = ?').run(now, game.id);
  })();
  const roundNumber = game.current_round;
  broadcast(game.id);
  res.status(201).json({ round_number: roundNumber });
});

/* Edit a previously submitted round (round-mode scores only).
   Upserts kind='round' rows, logs every change to score_edits, re-broadcasts. */
app.put('/api/games/:id/rounds/:round_number', requireAuth, (req, res) => {
  const db = getDb();
  const game = requireGameAccess(db, req.userId, req.params.id, res);
  if (!game) return;
  if (game.status === 'completed') return res.status(400).json({ error: 'Game is completed — scores are locked' });
  const rn = Number(req.params.round_number);
  if (!Number.isInteger(rn) || rn < 1) return res.status(400).json({ error: 'Invalid round number' });
  const scores = (req.body || {}).scores || {};
  const validIds = new Set(db.prepare('SELECT id FROM game_players WHERE game_id = ?').all(game.id).map((r) => r.id));
  const now = Date.now();
  const changes = [];
  db.transaction(() => {
    const getRow = db.prepare(`
      SELECT id, points FROM score_events
      WHERE game_id = ? AND round_number = ? AND game_player_id = ? AND kind = 'round'`);
    const upd = db.prepare('UPDATE score_events SET points = ? WHERE id = ?');
    const ins = db.prepare(`
      INSERT INTO score_events (game_id, round_number, game_player_id, points, kind, created_at)
      VALUES (?, ?, ?, ?, 'round', ?)`);
    const log = db.prepare(`
      INSERT INTO score_edits (game_id, round_number, game_player_id, old_points, new_points, edited_by_user_id, edited_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const [pid, pts] of Object.entries(scores)) {
      const id = Number(pid);
      if (!validIds.has(id)) continue;
      const v = Number(pts);
      if (!Number.isFinite(v)) continue;
      const row = getRow.get(game.id, rn, id);
      const old = row ? row.points : 0;
      if (old === v) continue;
      if (row) upd.run(v, row.id);
      else ins.run(game.id, rn, id, v, now);
      log.run(game.id, rn, id, old, v, req.userId, now);
      changes.push({ player_id: id, old_points: old, new_points: v });
    }
    db.prepare('UPDATE games SET updated_at = ? WHERE id = ?').run(now, game.id);
  })();
  broadcast(game.id);
  res.json({ round_number: rn, changes });
});

app.post('/api/games/:id/tap', requireAuth, (req, res) => {
  const db = getDb();
  const game = requireGameAccess(db, req.userId, req.params.id, res);
  if (!game) return;
  const b = req.body || {};
  const playerId = Number(b.player_id);
  const points = Number(b.points);
  if (!playerId || !Number.isFinite(points)) return res.status(400).json({ error: 'player_id and points are required' });
  if (!db.prepare('SELECT id FROM game_players WHERE id = ? AND game_id = ?').get(playerId, game.id)) {
    return res.status(404).json({ error: 'Player not in this game' });
  }
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO score_events (game_id, round_number, game_player_id, points, kind, created_at)
    VALUES (?, ?, ?, ?, 'tap', ?)`).run(game.id, game.current_round, playerId, points, now);
  db.prepare('UPDATE games SET updated_at = ? WHERE id = ?').run(now, game.id);
  broadcast(game.id);
  res.status(201).json({ event: db.prepare('SELECT * FROM score_events WHERE id = ?').get(info.lastInsertRowid) });
});

app.post('/api/games/:id/engines', requireAuth, (req, res) => {
  const db = getDb();
  const game = requireGameAccess(db, req.userId, req.params.id, res);
  if (!game) return;
  const b = req.body || {};
  const dv = Number(b.double_value);
  if (!Number.isInteger(dv)) return res.status(400).json({ error: 'double_value is required' });
  const engine = db.prepare('SELECT * FROM engines WHERE game_id = ? AND double_value = ?').get(game.id, dv);
  if (!engine) return res.status(404).json({ error: 'Engine not found for this game' });
  const now = Date.now();
  if (engine.played) {
    db.prepare('UPDATE engines SET played = 0, round_number = NULL, played_at = NULL WHERE id = ?').run(engine.id);
  } else {
    const rn = b.round_number == null ? game.current_round : Number(b.round_number);
    db.prepare('UPDATE engines SET played = 1, round_number = ?, played_at = ? WHERE id = ?').run(rn, now, engine.id);
  }
  db.prepare('UPDATE games SET updated_at = ? WHERE id = ?').run(now, game.id);
  broadcast(game.id);
  res.json({ engine: db.prepare('SELECT * FROM engines WHERE id = ?').get(engine.id) });
});

app.put('/api/games/:id/players/:pid', requireAuth, (req, res) => {
  const db = getDb();
  const game = requireGameAccess(db, req.userId, req.params.id, res);
  if (!game) return;
  const player = db.prepare('SELECT * FROM game_players WHERE id = ? AND game_id = ?').get(Number(req.params.pid), game.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  const b = req.body || {};
  const updates = {};
  if (b.train_open !== undefined) updates.train_open = b.train_open ? 1 : 0;
  if (b.eliminated !== undefined) updates.eliminated = b.eliminated ? 1 : 0;
  if (b.name !== undefined) updates.name = String(b.name).trim() || player.name;
  if (b.avatar_emoji !== undefined) updates.avatar_emoji = String(b.avatar_emoji).slice(0, 16);
  if (b.avatar_color !== undefined) updates.avatar_color = String(b.avatar_color).slice(0, 16);
  const keys = Object.keys(updates);
  if (keys.length) {
    db.prepare(`UPDATE game_players SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...keys.map((k) => updates[k]), player.id);
  }
  db.prepare('UPDATE games SET updated_at = ? WHERE id = ?').run(Date.now(), game.id);
  broadcast(game.id);
  res.json({ player: db.prepare('SELECT * FROM game_players WHERE id = ?').get(player.id) });
});

app.post('/api/games/:id/turn', requireAuth, (req, res) => {
  const db = getDb();
  const game = requireGameAccess(db, req.userId, req.params.id, res);
  if (!game) return;
  const count = db.prepare('SELECT COUNT(*) AS n FROM game_players WHERE game_id = ?').get(game.id).n;
  if (!count) return res.status(400).json({ error: 'Game has no players' });
  const next = (game.turn_index + 1) % count;
  db.prepare('UPDATE games SET turn_index = ?, updated_at = ? WHERE id = ?').run(next, Date.now(), game.id);
  broadcast(game.id);
  res.json({ game: db.prepare('SELECT * FROM games WHERE id = ?').get(game.id) });
});

app.post('/api/games/:id/complete', requireAuth, (req, res) => {
  const db = getDb();
  const game = requireGameAccess(db, req.userId, req.params.id, res);
  if (!game) return;
  const now = Date.now();
  let badgesAwarded;
  if (game.status !== 'completed') {
    db.prepare('UPDATE games SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?')
      .run('completed', now, now, game.id);
    badgesAwarded = awardBadgesForGame(db, game.id);
  } else {
    badgesAwarded = db.prepare(`
      SELECT pb.badge_key, pb.game_player_id AS player_id, gp.name AS player_name
      FROM player_badges pb JOIN game_players gp ON gp.id = pb.game_player_id
      WHERE pb.game_id = ? ORDER BY pb.awarded_at`).all(game.id);
  }
  const detail = buildGameDetail(db, game.id);
  broadcast(game.id);
  res.json({ game: detail.game, standings: detail.standings, badges_awarded: badgesAwarded });
});

/* ---------------- Live score stream (SSE) ---------------- */

app.get('/api/games/:id/stream', (req, res) => {
  const db = getDb();
  let token = bearerToken(req);
  if (!token && req.query && req.query.token) token = String(req.query.token);
  const userId = tokenToUserId(db, token);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (!isMember(db, userId, game.family_id)) return res.status(403).json({ error: 'Not a member of this family' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  const gameId = Number(game.id);
  if (!streams.has(gameId)) streams.set(gameId, new Set());
  streams.get(gameId).add(res);
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    const set = streams.get(gameId);
    if (set) { set.delete(res); if (!set.size) streams.delete(gameId); }
  });
});

/* ---------------- Badge catalog ---------------- */

app.get('/api/badges', requireAuth, (req, res) => {
  res.json(Object.values(BADGE_CATALOG).map((b) => ({ key: b.key, name: b.name, description: b.description })));
});

/* ---------------- History & stats ---------------- */

function parseTime(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

app.get('/api/history', requireAuth, (req, res) => {
  const db = getDb();
  const { family_id, game_type, winner_player_id, from, to } = req.query;
  let where = `WHERE g.status = 'completed' AND g.family_id IN (SELECT family_id FROM family_members WHERE user_id = ?)`;
  const params = [req.userId];
  if (family_id) {
    if (!isMember(db, req.userId, Number(family_id))) return res.status(403).json({ error: 'Not a member of this family' });
    where += ' AND g.family_id = ?';
    params.push(Number(family_id));
  }
  if (game_type) { where += ' AND g.game_type = ?'; params.push(String(game_type)); }
  const fromT = parseTime(from), toT = parseTime(to);
  if (fromT !== null) { where += ' AND g.completed_at >= ?'; params.push(fromT); }
  if (toT !== null) { where += ' AND g.completed_at <= ?'; params.push(toT); }
  const games = db.prepare(`SELECT * FROM games g ${where} ORDER BY completed_at DESC`).all(...params);
  const out = [];
  for (const g of games) {
    const detail = buildGameDetail(db, g.id);
    if (!detail) continue;
    if (winner_player_id && String(detail.standings[0] || '') !== String(winner_player_id)) continue;
    const winnerId = detail.standings[0];
    const winner = detail.players.find((p) => p.id === winnerId);
    out.push({
      id: g.id, name: g.name, game_type: g.game_type, win_condition: g.win_condition, status: g.status,
      created_at: g.created_at, completed_at: g.completed_at,
      duration_seconds: Math.round(((g.completed_at || Date.now()) - g.created_at) / 1000),
      players: detail.players.map((p) => ({ name: p.name, total: p.total, rank: p.rank })),
      winner_name: winner ? winner.name : null,
      rounds: detail.rounds,
      engines_played: detail.engines.filter((e) => e.played).map((e) => e.double_value),
    });
  }
  res.json(out);
});

app.get('/api/leaderboard', requireAuth, (req, res) => {
  const db = getDb();
  const { family_id } = req.query;
  let where = `WHERE g.status = 'completed' AND g.family_id IN (SELECT family_id FROM family_members WHERE user_id = ?)`;
  const params = [req.userId];
  if (family_id) {
    if (!isMember(db, req.userId, Number(family_id))) return res.status(403).json({ error: 'Not a member of this family' });
    where += ' AND g.family_id = ?';
    params.push(Number(family_id));
  }
  const games = db.prepare(`SELECT * FROM games g ${where} ORDER BY completed_at DESC, id DESC`).all(...params);

  const agg = {}; // key -> {key,name,avatar_emoji,avatar_color,results:[{completedAt,rank,total}]}
  const pairStats = {}; // 'a|b' -> {a,b,a_wins,b_wins}
  for (const g of games) {
    const players = db.prepare('SELECT * FROM game_players WHERE game_id = ? ORDER BY sort_order, id').all(g.id);
    if (!players.length) continue;
    const totals = playerTotals(db, g.id);
    const tot = (id) => totals[id] || 0;
    // Eliminated players can't win; they rank below every contender.
    const contenders = players.filter((p) => !p.eliminated);
    if (!contenders.length) continue;
    const sorted = [...contenders].sort((a, b) =>
      g.win_condition === 'lowest' ? tot(a.id) - tot(b.id) : tot(b.id) - tot(a.id));
    const rankOf = {};
    sorted.forEach((p, i) => {
      const prev = sorted[i - 1];
      rankOf[p.id] = (i > 0 && tot(p.id) === tot(prev.id)) ? rankOf[prev.id] : i + 1;
    });
    players.filter((p) => p.eliminated).forEach((p) => { rankOf[p.id] = sorted.length + 1; });
    const entries = players.map((p) => ({
      key: p.user_id ? String(p.user_id) : `p${p.id}`,
      rank: rankOf[p.id], total: tot(p.id),
      name: p.name, avatar_emoji: p.avatar_emoji, avatar_color: p.avatar_color,
    }));
    for (const e of entries) {
      if (!agg[e.key]) agg[e.key] = { key: e.key, name: e.name, avatar_emoji: e.avatar_emoji, avatar_color: e.avatar_color, results: [] };
      agg[e.key].results.push({ completedAt: g.completed_at || 0, rank: e.rank, total: e.total });
    }
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i], b = entries[j];
        const firstKey = a.key < b.key ? a.key : b.key;
        const secondKey = a.key < b.key ? b.key : a.key;
        const k = `${firstKey}|${secondKey}`;
        if (!pairStats[k]) pairStats[k] = { a: firstKey, b: secondKey, a_wins: 0, b_wins: 0 };
        const st = pairStats[k];
        if (a.rank < b.rank) { if (a.key === st.a) st.a_wins++; else st.b_wins++; }
        else if (b.rank < a.rank) { if (b.key === st.a) st.a_wins++; else st.b_wins++; }
      }
    }
  }

  const players = Object.values(agg).map((a) => {
    const wins = a.results.filter((r) => r.rank === 1).length;
    const gamesPlayed = a.results.length;
    const recent = [...a.results].sort((x, y) => y.completedAt - x.completedAt);
    let streak = 0;
    for (const r of recent) { if (r.rank === 1) streak++; else break; }
    const avg = a.results.reduce((s, r) => s + r.total, 0) / gamesPlayed;
    return {
      key: a.key, name: a.name, avatar_emoji: a.avatar_emoji, avatar_color: a.avatar_color,
      wins, games: gamesPlayed,
      win_rate: Math.round((wins / gamesPlayed) * 1000) / 1000,
      avg_score: Math.round(avg * 100) / 100,
      streak,
    };
  }).sort((x, y) => y.wins - x.wins || y.win_rate - x.win_rate || y.games - x.games);

  res.json({ players, head_to_head: Object.values(pairStats) });
});

/* ---------------- Start ---------------- */

getDb();
app.listen(PORT, () => {
  console.log(`GamerScore Keep listening on port ${PORT}`);
});
