# 🎲 GamerScore Keep

A family game scorekeeping app with a specialized **Mexican Train Dominoes** module, live multi-device sync, victory share cards, family leaderboards, and unlockable badges.

Dark mode by default (obsidian `#0D0F12`, slate `#161920`, Electric Indigo `#6366F1`, Emerald `#10B981`) with a light-mode toggle. Responsive: bottom navigation on phones, split scoreboard/checklist view on tablets, sidebar navigation + keyboard shortcuts on desktop.

## Screenshots

| Dashboard | Live scorekeeper |
|---|---|
| ![Dashboard — active games, family leaders, recent games](docs/screenshots/shot-dashboard.jpg) | ![Scorekeeper — round grid, engine checklist, quick tap](docs/screenshots/shot-scorekeeper.jpg) |
| *Game Night dashboard: active game card with live leader, family leaders, and recent games.* | *Mexican Train scorekeeper: round-by-round grid with running totals and ranks, tappable engine domino checklist (double-12 set), and quick-tap scoring buttons.* |

| Leaderboard | Toolkit |
|---|---|
| ![Leaderboard — standings and head-to-head](docs/screenshots/shot-leaderboard.jpg) | ![Toolkit — spinner, dice, coin flip, timer](docs/screenshots/shot-toolkit.jpg) |
| *Standings with wins, win rate, average score and streaks, plus a head-to-head wins matrix.* | *Game-night toolkit: first-player spinner wheel, animated dice roller, coin flip, and round timer with buzzer.* |

| Sign in | Mobile layout |
|---|---|
| ![Sign in screen](docs/screenshots/shot-login.jpg) | ![Mobile dashboard with bottom navigation](docs/screenshots/shot-dashboard-mobile.jpg) |
| *Email + password sign in, then join a family with its 6-digit room code.* | *Phone layout: stacked cards and a bottom tab bar (Home, Games, History, Leaders, More).* |

## Quick start

```bash
npm install
npm start        # serves on http://localhost:3000
```

Or with Docker Compose:

```bash
docker compose up -d --build   # http://localhost:3000, data persists in ./data
```

Copy `.env.example` to `.env` to change the port (`PORT=3000`).

### Demo data

On first boot the database seeds a demo workspace:

- **Family:** Demo Family — room code **`482916`**
- **Logins:** `maya@demo.local`, `leo@demo.local`, `sofia@demo.local`, `noah@demo.local` — password `demo1234`
- One completed Mexican Train game (*Friday Night Trains*, double-12) with engines played and all four badges earned
- One active custom game (*Sunday Showdown*) ready for live scoring

## Features

- **Auth & families** — email/password accounts, 6-digit family room codes to join, switch between families, rename families.
- **Game presets** — Mexican Train Dominoes, Bingo, Uno, Uno No Mercy, Monopoly, Scrabble, Yahtzee, Golf, Hearts, plus fully custom games. Each preset carries its own emoji, accent color, scoring defaults, and scorekeeper hints (all defined in one `GAME_THEMES` map in `public/js/themes.js`, so new presets are styled automatically).
- **Core scoring** — multiple simultaneous games, pause/resume; round-by-round grid with running totals *or* quick-tap (+1/+5/+10/custom); highest-wins / lowest-wins with optional target score; dealer & turn rotation with one-tap advance; anyone in the family can take over as scorekeeper. Tap any entered round score to correct it (edits are logged and live-synced).
- **Mexican Train module** — engine checklist of doubles (Double-9/12/15 sets) rendered as CSS domino pip tiles; tap to mark played and link to a round; out-of-order play supported; quick-pip calculator keypad (1–12) that sums a hand and applies it to a player; personal train open/closed (🚂) toggles.
- **Monopoly extras** — cash amounts formatted as money ($1,500), per-player bankrupt/eliminate (💀) toggle that greys players out and removes them from win contention (standings, badges, leaderboards).
- **Uno No Mercy** — same scoring as Uno (first to 500) with a NO MERCY badge and warning-styled game cards.
- **Bingo flow** — round entry includes a one-tap "round winner" picker that awards 1 point.
- **Delete games** — delete active/paused games from the dashboard or completed games from the History Vault behind a red confirmation; deletion removes the game's badge awards and leaderboard contributions.
- **Live sync** — Server-Sent Events (`GET /api/games/:id/stream`) push every score, engine, train, and turn change to all connected family devices in real time.
- **History vault** — completed games archive filterable by date, game type, and winner, with round-by-round breakdowns and engines played.
- **Leaderboards** — win rates, head-to-head records, average scores, current win streaks.
- **Badges** — auto-awarded on completion: *Train Conductor* (win Mexican Train under 50), *Double Trouble* (3+ engines in a game), *Sniper* (win margin under 5), *Clean Sweep* (0 points in 3 straight rounds). Trophy cabinet per player.
- **Victory share card** — confetti modal with 1st/2nd/3rd podium, highlights (duration, biggest single round, Comeback Kid), rendered to a 1200×630 PNG for download or native share.
- **Utility toolkit** — first-player spinner wheel, 2D animated dice roller (multi-frame tumbling with bounce, staggered settle, landing thump), coin flip, round countdown timer with WebAudio buzzer.
- **Trajectory chart** — canvas line chart of every player's cumulative score across rounds, on the scorekeeper screen and in history detail.
- **Desktop shortcuts** — in round entry, number keys 1–9 focus player inputs, Enter advances, Ctrl+Enter submits.

## API overview

Auth uses Bearer tokens (`Authorization: Bearer <token>`); the SSE stream also accepts `?token=`.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account → `{token, user}` |
| POST | `/api/auth/login` | Sign in → `{token, user}` |
| POST | `/api/auth/logout` | Revoke token |
| GET | `/api/me` | Current user |
| POST | `/api/families` | Create family (generates room code) |
| POST | `/api/families/join` | Join via `{room_code}` |
| GET | `/api/families` | My families |
| GET/PUT | `/api/families/:id` | Family detail / rename |
| GET | `/api/families/:id/badges` | Earned badges |
| GET | `/api/badges` | Badge catalog |
| GET/POST | `/api/games` | List / create game |
| GET | `/api/games/:id` | Full game state (players, rounds, engines, standings) |
| PUT | `/api/games/:id` | Rename, pause/resume, take over scorekeeper, set turn |
| POST | `/api/games/:id/rounds` | Submit a round `{scores: {playerId: points}}` |
| PUT | `/api/games/:id/rounds/:round_number` | Edit a submitted round `{scores}` (logs to score_edits, re-broadcasts) |
| POST | `/api/games/:id/tap` | Quick-tap `{player_id, points}` |
| POST | `/api/games/:id/engines` | Toggle engine played `{double_value, round_number?}` |
| PUT | `/api/games/:id/players/:pid` | Train toggle, eliminate toggle, rename, avatar |
| POST | `/api/games/:id/turn` | Advance turn |
| POST | `/api/games/:id/complete` | Finish game, award badges |
| DELETE | `/api/games/:id` | Delete game |
| GET | `/api/games/:id/stream` | SSE live updates (`event: game_update`) |
| GET | `/api/history` | Completed games (`family_id`, `game_type`, `winner_player_id`, `from`, `to`) |
| GET | `/api/leaderboard` | Standings + head-to-head |

All game endpoints verify family membership (403 otherwise); unauthenticated requests return 401.

## Project layout

```
server.js            Express app, routes, SSE broadcaster
lib/db.js            SQLite schema, migrations, seed data
lib/auth.js          Password hashing, tokens
public/              Vanilla JS SPA (no build step)
  index.html         App shell
  css/styles.css     Themes + responsive layout + domino tiles
  js/                app, dashboard, game, dominoes, charts,
                     victory, history, leaders, family, toolkit
data/                SQLite database (gitignored, Docker volume)
Dockerfile           node:20-alpine
docker-compose.yml   One-command deploy with persistent ./data
```

## Deploy notes

- The SQLite file lives at `data/gamerscore.db` (created + seeded on first boot); back it up before upgrades.
- Behind a reverse proxy, forward the original client IP (`X-Forwarded-For`) if you want accurate request logging.
- Change the demo passwords or delete demo users before exposing the app publicly.
