import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, RINGS, SECTORS, Difficulty } from '../src/game/Config';
import { scoreHit, applyScore, sectorPoint } from '../src/game/ScoreManager';
import { Match, State } from '../src/game/Match';
import { BotController } from '../src/game/BotController';
import { pingPong } from '../src/game/AimController';
import { readDifficulty, normalizeDifficulty, DIFFICULTY_KEY } from '../src/integration/DifficultyManager';

function advanceTo(match: Match, state: State, limit = 3000) {
  for (let i = 0; i < limit && match.state !== state; i++) match.update(1 / 120);
  assert.equal(match.state, state, `Expected ${state}`);
}
function playerThrow(match: Match, x: number, y: number) {
  advanceTo(match, 'PLAYER_AIM_X');
  match.aim.x = x; assert.equal(match.tap(), true);
  match.update(CONFIG.aim.inputGuard + 0.01);
  match.aim.y = y; assert.equal(match.tap(), true);
}
test('all 20 clockwise sectors score singles, doubles, and triples', () => {
  assert.equal(SECTORS[0], 20); assert.equal(SECTORS[5], 6); assert.equal(SECTORS[10], 3); assert.equal(SECTORS[15], 11);
  for (const segment of SECTORS) {
    for (const [r, multiplier] of [[0.3, 1], [0.76, 1], [0.5825, 3], [0.963, 2]]) {
      const hit = scoreHit(sectorPoint(segment, r));
      assert.equal(hit.segment, segment); assert.equal(hit.multiplier, multiplier); assert.equal(hit.score, segment * multiplier);
    }
  }
});
test('bulls, miss, exact ring boundaries and sector edges are aligned', () => {
  assert.equal(scoreHit({ x: 0, y: 0 }).score, 50);
  assert.equal(scoreHit({ x: RINGS.bullseye, y: 0 }).score, 50);
  assert.equal(scoreHit({ x: RINGS.bullseye + 1e-6, y: 0 }).score, 25);
  assert.equal(scoreHit({ x: RINGS.bull, y: 0 }).score, 25);
  assert.equal(scoreHit({ x: 0, y: -RINGS.doubleOut }).score, 40);
  assert.equal(scoreHit({ x: 0, y: -1.00001 }).score, 0);
  assert.equal(scoreHit({ x: NaN, y: 0 }).hitType, 'MISS');
  assert.equal(scoreHit({ x: 0, y: -RINGS.tripleIn }).score, 60);
  assert.equal(scoreHit({ x: 0, y: -RINGS.tripleOut }).score, 60);
  const edge = Math.PI / 20;
  for (const [offset, sector] of [[-1e-6, 20], [1e-6, 1]]) {
    const a = edge + offset;
    assert.equal(scoreHit({ x: Math.sin(a) * 0.76, y: -Math.cos(a) * 0.76 }).segment, sector);
  }
});
test('301 subtracts scores, busts preserve score, single checkout needs no double', () => {
  const triple = scoreHit(sectorPoint(20, 0.58));
  assert.deepEqual(applyScore(301, triple), { remaining: 241, bust: false, won: false });
  assert.deepEqual(applyScore(20, triple), { remaining: 20, bust: true, won: false });
  assert.deepEqual(applyScore(20, scoreHit(sectorPoint(20, 0.76))), { remaining: 0, bust: false, won: true });
  assert.equal(applyScore(1, scoreHit(sectorPoint(1, 0.76))).won, true);
});
test('aim meter is a linear ping-pong, with equal speed in both directions', () => {
  for (const [time, expected] of [[0, 0], [0.45, 0.5], [0.9, 1], [1.35, 0.5], [1.8, 0]]) {
    assert.ok(Math.abs(pingPong(time) - expected) < 1e-12);
  }
});
test('bot goes first; one dart per turn; taps ignored during bot/animation', () => {
  const match = new Match('easy', () => {}, () => 0.5);
  assert.deepEqual(match.scores, { player: 301, bot: 301 });
  for (let i = 0; i < 10; i++) assert.equal(match.tap(), false);
  advanceTo(match, 'PLAYER_AIM_X');
  assert.deepEqual(match.throws, { player: 0, bot: 1 });
  const chosenX = match.aim.x;
  assert.equal(match.tap(), true); assert.equal(match.state, 'PLAYER_AIM_Y'); assert.equal(match.aim.x, chosenX);
  for (let i = 0; i < 20; i++) assert.equal(match.tap(), false);
  match.update(0.16); const exact = match.aim.point;
  assert.equal(match.tap(), true); assert.deepEqual(match.impact, exact); assert.equal(match.state, 'PLAYER_THROW');
  for (let i = 0; i < 20; i++) assert.equal(match.tap(), false);
  advanceTo(match, 'BOT_INTRO'); assert.deepEqual(match.throws, { player: 1, bot: 1 });
});
test('victory and defeat wait until final impact, score reveal, and camera return', () => {
  const victory = new Match('medium', () => {}, () => 0.5);
  advanceTo(victory, 'PLAYER_AIM_X'); victory.scores.player = 20;
  playerThrow(victory, 0, -0.76);
  advanceTo(victory, 'IMPACT'); assert.equal(victory.scores.player, 20);
  advanceTo(victory, 'SCORE_REVEAL'); assert.equal(victory.scores.player, 0); assert.equal(victory.result, false);
  advanceTo(victory, 'VICTORY');
  assert.ok(victory.elapsed - victory.impactAt >= CONFIG.camera.in + CONFIG.camera.hold + CONFIG.camera.out);
  const defeat = new Match('hard', () => {}, () => 0.5);
  advanceTo(defeat, 'BOT_AIM_X'); defeat.target = sectorPoint(1, 0.76); defeat.scores.bot = 1;
  advanceTo(defeat, 'DEFEAT'); assert.equal(defeat.scores.bot, 0); assert.equal(defeat.throws.bot, 1);
});
test('bust switches turns without negative score and reset clears all transient state', () => {
  const match = new Match('hard', () => {}, () => 0.5);
  advanceTo(match, 'PLAYER_AIM_X'); match.scores.player = 10;
  playerThrow(match, 0, -0.5825); advanceTo(match, 'SCORE_REVEAL');
  assert.equal(match.bust, true); assert.equal(match.scores.player, 10);
  advanceTo(match, 'BOT_INTRO');
  for (let i = 0; i < 50; i++) {
    match.reset(); assert.equal(match.difficulty, 'hard'); assert.equal(match.state, 'MATCH_START');
    assert.equal(match.embedded.length, 0); assert.equal(match.scores.player, 301); assert.equal(match.scores.bot, 301);
    assert.equal(match.throws.bot, 0); assert.equal(match.throws.player, 0); assert.equal(match.elapsed, 0); assert.equal(match.bust, false);
  }
});
test('difficulty uses the Sudoku preference, legacy saved selection, and expert maps to hard', () => {
  assert.equal(readDifficulty({ getItem: key => key === DIFFICULTY_KEY ? 'medium' : null }), 'medium');
  assert.equal(readDifficulty({ getItem: key => key === DIFFICULTY_KEY ? null : '{"difficulty":"hard"}' }), 'hard');
  assert.equal(readDifficulty({ getItem: () => { throw new Error('Blocked'); } }), 'easy');
  assert.equal(normalizeDifficulty('expert'), 'hard'); assert.equal(normalizeDifficulty('invalid'), null);
  assert.ok(CONFIG.difficulty.easy.flight > CONFIG.difficulty.medium.flight);
  assert.ok(CONFIG.difficulty.medium.flight > CONFIG.difficulty.hard.flight);
});
test('bot always aims at finite coordinates and hard improves mean score while remaining imperfect', () => {
  function rng() { let n = 12345; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
  const totals: number[] = [];
  for (const difficulty of ['easy', 'medium', 'hard'] as Difficulty[]) {
    const bot = new BotController(rng()); let score = 0, misses = 0;
    for (let i = 0; i < 3000; i++) {
      const p = bot.chooseTarget(301, difficulty); assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
      const hit = scoreHit(p); score += hit.score; if (!hit.score) misses++;
    }
    assert.ok(misses > 0 && misses < 400); totals.push(score);
  }
  assert.ok(totals[2] > totals[1] && totals[1] > totals[0], totals.toString());
});
test('long matches retain only a bounded number of embedded darts', () => {
  const match = new Match('easy', () => {}, () => 0.5);
  for (let i = 0; i < 80; i++) {
    playerThrow(match, 1.12, 1.12);
    advanceTo(match, 'BOT_INTRO'); match.scores.bot = 301;
    assert.ok(match.embedded.length <= CONFIG.maxEmbedded);
  }
});
