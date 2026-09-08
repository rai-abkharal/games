import { SoundFx } from '../../../shared/SoundFx';
import { Match, MatchEvent } from '../game/Match';
export class AudioManager {
  private activated = false;
  activate() { this.activated = true; }
  play(event: MatchEvent | 'tap' | 'medal', match: Match) {
    // Reuse the suite's gesture-unlocked synthesizer and host mute setting.
    // Unavailable browser audio must never prevent a state transition.
    // Avoid queueing the opening bot turn on a suspended AudioContext.
    if (!this.activated) return;
    try {
      switch (event) {
        case 'tap': case 'lockX': SoundFx.playTap(); break;
        case 'lockY': SoundFx.playJump(); break;
        case 'throw': SoundFx.playShoot(); break;
        case 'impact': if (match.hit.score) SoundFx.playHit(); else SoundFx.playSlice(); break;
        case 'score':
          if (match.bust || !match.hit.score) break;
          if (match.hit.hitType === 'BULLSEYE') SoundFx.playSuccess();
          else if (match.hit.hitType === 'TRIPLE' || match.hit.hitType === 'BULL') SoundFx.playScore();
          else SoundFx.playTap();
          break;
        case 'turn': SoundFx.playTap(); break;
        case 'victory': case 'medal': SoundFx.playSuccess(); break;
        case 'defeat': SoundFx.playGameOver(); break;
      }
    } catch { /* Silent fallback on webviews without Web Audio. */ }
  }
}
