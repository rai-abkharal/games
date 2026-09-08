import { AimController } from './AimController';
import { BotController } from './BotController';
import { CONFIG, Difficulty, Point, Side } from './Config';
import { Hit, applyScore, scoreHit } from './ScoreManager';
export type State = 'MATCH_START' | 'BOT_INTRO' | 'BOT_AIM_X' | 'BOT_AIM_Y' | 'BOT_THROW'
  | 'PLAYER_INTRO' | 'PLAYER_AIM_X' | 'PLAYER_AIM_Y' | 'PLAYER_THROW'
  | 'IMPACT' | 'SCORE_REVEAL' | 'CHECK_RESULT' | 'TURN_SWAP' | 'VICTORY' | 'DEFEAT';
export type MatchEvent = 'start' | 'turn' | 'lockX' | 'lockY' | 'throw' | 'impact' | 'score' | 'victory' | 'defeat';
export interface Embedded { point: Point; side: Side; at: number }
export class Match {
  state: State = 'MATCH_START';
  stateTime = 0;
  elapsed = 0;
  side: Side = 'bot';
  scores = { player: CONFIG.startScore as number, bot: CONFIG.startScore as number };
  throws = { player: 0, bot: 0 };
  aim = new AimController();
  target: Point = { x: 0, y: 0 };
  impact: Point = { x: 0, y: 0 };
  hit: Hit = scoreHit({ x: 2, y: 2 });
  bust = false;
  embedded: Embedded[] = [];
  impactAt = -100;
  scoreAt = -100;
  lastInputAt = -100;
  private bot: BotController;
  constructor(public difficulty: Difficulty, public onEvent: (event: MatchEvent) => void = () => {}, random = Math.random) {
    this.bot = new BotController(random);
  }
  get aiming() { return this.state.endsWith('_AIM_X') || this.state.endsWith('_AIM_Y'); }
  get flying() { return this.state.endsWith('_THROW'); }
  get result() { return this.state === 'VICTORY' || this.state === 'DEFEAT'; }
  private enter(state: State) { this.state = state; this.stateTime = 0; }
  reset(difficulty = this.difficulty) {
    this.difficulty = difficulty;
    this.scores.player = this.scores.bot = CONFIG.startScore;
    this.throws.player = this.throws.bot = 0;
    this.side = 'bot'; this.elapsed = 0; this.bust = false;
    this.embedded.length = 0; this.impactAt = this.scoreAt = this.lastInputAt = -100;
    this.target = { x: 0, y: 0 }; this.impact = { x: 0, y: 0 };
    this.hit = scoreHit({ x: 2, y: 2 }); this.aim.reset();
    this.enter('MATCH_START'); this.onEvent('start');
  }
  tap(): boolean {
    if (this.elapsed - this.lastInputAt < CONFIG.aim.inputGuard) return false;
    if (this.state === 'PLAYER_AIM_X') {
      this.lastInputAt = this.elapsed;
      this.aim.lockX(); this.enter('PLAYER_AIM_Y'); this.onEvent('lockX'); return true;
    }
    if (this.state === 'PLAYER_AIM_Y') {
      this.lastInputAt = this.elapsed;
      this.onEvent('lockY'); this.launch(); return true;
    }
    return false;
  }
  private launch() {
    this.impact = this.aim.point;
    this.throws[this.side]++;
    this.enter(this.side === 'bot' ? 'BOT_THROW' : 'PLAYER_THROW');
    this.onEvent('throw');
  }
  private beginTurn() {
    this.aim.reset();
    this.bust = false;
    this.enter(this.side === 'bot' ? 'BOT_INTRO' : 'PLAYER_INTRO');
    if (this.side === 'bot') this.target = this.bot.chooseTarget(this.scores.bot, this.difficulty);
    this.onEvent('turn');
  }
  update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.elapsed += dt;
    this.stateTime += dt;
    if (this.aiming) {
      this.aim.update(dt);
      if (this.side === 'bot') {
        const axis = this.aim.axis;
        if (this.aim.time >= this.bot.lockTime(this.target[axis])) {
          this.aim[axis] = this.target[axis];
          if (axis === 'x') { this.aim.lockX(); this.enter('BOT_AIM_Y'); this.onEvent('lockX'); }
          else { this.onEvent('lockY'); this.launch(); }
        }
      }
      return;
    }
    switch (this.state) {
      case 'MATCH_START': if (this.stateTime >= CONFIG.timing.matchStart) this.beginTurn(); break;
      case 'BOT_INTRO': case 'PLAYER_INTRO':
        if (this.stateTime >= CONFIG.timing.intro) this.enter(this.side === 'bot' ? 'BOT_AIM_X' : 'PLAYER_AIM_X');
        break;
      case 'BOT_THROW': case 'PLAYER_THROW':
        if (this.stateTime >= CONFIG.difficulty[this.difficulty].flight) {
          this.hit = scoreHit(this.impact);
          this.bust = this.hit.score > this.scores[this.side];
          this.impactAt = this.elapsed;
          this.embedded.push({ point: { ...this.impact }, side: this.side, at: this.elapsed });
          if (this.embedded.length > CONFIG.maxEmbedded) this.embedded.shift();
          this.enter('IMPACT'); this.onEvent('impact');
        }
        break;
      case 'IMPACT':
        if (this.stateTime >= CONFIG.timing.impact) {
          const result = applyScore(this.scores[this.side], this.hit);
          this.scores[this.side] = result.remaining; this.bust = result.bust;
          this.scoreAt = this.elapsed; this.enter('SCORE_REVEAL'); this.onEvent('score');
        }
        break;
      case 'SCORE_REVEAL': if (this.stateTime >= CONFIG.timing.scoreReveal) this.enter('CHECK_RESULT'); break;
      case 'CHECK_RESULT':
        if (this.scores[this.side] === 0) {
          this.enter(this.side === 'player' ? 'VICTORY' : 'DEFEAT');
          this.onEvent(this.side === 'player' ? 'victory' : 'defeat');
        } else this.enter('TURN_SWAP');
        break;
      case 'TURN_SWAP':
        if (this.stateTime >= CONFIG.timing.swap) { this.side = this.side === 'bot' ? 'player' : 'bot'; this.beginTurn(); }
        break;
    }
  }
}
