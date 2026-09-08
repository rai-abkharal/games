import { Difficulty } from '../game/Config';
import { Match } from '../game/Match';
import { DIFFICULTIES, saveDifficulty } from '../integration/DifficultyManager';
export class GameUI {
  modal: 'difficulty' | 'help' | null = null;
  private selected = 0;
  private priorFocus: HTMLElement | null = null;
  private abort = new AbortController();
  constructor(private match: Match, private restart: (difficulty: Difficulty) => void,
    private tapSound: () => void, private medalSound: () => void) {
    const on = (id: string, callback: () => void) => {
      document.getElementById(id)!.addEventListener('click', event => { event.stopPropagation(); this.tapSound(); callback(); }, { signal: this.abort.signal });
    };
    on('restart', () => this.restart(this.match.difficulty));
    on('play-again', () => this.restart(this.match.difficulty));
    on('difficulty', () => {
      this.selected = DIFFICULTIES.findIndex(d => d.id === this.match.difficulty);
      this.updateDifficulty(); this.open('difficulty');
    });
    on('difficulty-close', () => this.close());
    on('difficulty-play', () => { const d = DIFFICULTIES[this.selected].id; saveDifficulty(d); this.close(); this.restart(d); });
    on('help', () => this.open('help'));
    on('help-close', () => this.close());
    document.getElementById('difficulty-slider')!.addEventListener('input', event => {
      this.selected = Number((event.target as HTMLInputElement).value); this.updateDifficulty();
    }, { signal: this.abort.signal });
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-difficulty]')) {
      button.addEventListener('click', () => { this.selected = Number(button.dataset.difficulty); this.updateDifficulty(); }, { signal: this.abort.signal });
    }
    document.querySelector('.medal')!.addEventListener('animationend', () => {
      if (this.match.result) this.medalSound();
    }, { signal: this.abort.signal });
    // Keep keyboard focus inside the active overlay; canvas input is separately gated.
    document.addEventListener('keydown', event => {
      const panel = this.modal ? document.getElementById(`${this.modal}-overlay`) : this.match.result ? document.getElementById('result-overlay') : null;
      if (!panel) return;
      if (event.key === 'Escape' && this.modal) { event.preventDefault(); this.close(); return; }
      if (event.key !== 'Tab') return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('button,input'));
      const index = controls.indexOf(document.activeElement as HTMLElement);
      event.preventDefault(); controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
    }, { signal: this.abort.signal });
  }
  private open(modal: 'difficulty' | 'help') {
    this.priorFocus = document.activeElement as HTMLElement;
    this.modal = modal; document.getElementById(`${modal}-overlay`)!.hidden = false;
    document.querySelector<HTMLElement>(`#${modal}-overlay button`)?.focus();
  }
  close() {
    if (this.modal) document.getElementById(`${this.modal}-overlay`)!.hidden = true;
    this.modal = null;
    this.priorFocus?.focus(); this.priorFocus = null;
  }
  reset() {
    this.close();
    document.getElementById('result-overlay')!.hidden = true;
    for (const id of ['restart', 'difficulty', 'help']) (document.getElementById(id) as HTMLButtonElement).disabled = false;
    document.getElementById('difficulty')!.textContent = this.match.difficulty.toUpperCase();
    this.updateScores(false);
    document.getElementById('gameCanvas')!.focus({ preventScroll: true });
  }
  updateScores(animate = true) {
    for (const side of ['player', 'bot'] as const) {
      const node = document.getElementById(`${side}-score`)!;
      const value = String(this.match.scores[side]);
      if (node.textContent !== value) {
        node.textContent = value;
        if (animate) { node.classList.remove('score-pop'); void node.offsetWidth; node.classList.add('score-pop'); }
      }
    }
  }
  announce(message: string) { document.getElementById('announcement')!.textContent = message; }
  showResult() {
    const victory = this.match.state === 'VICTORY';
    const overlay = document.getElementById('result-overlay')!;
    overlay.classList.toggle('defeat', !victory); overlay.hidden = false;
    document.getElementById('result-title')!.textContent = victory ? 'YOU WIN!' : 'YOU LOSE!';
    document.getElementById('result-caption')!.textContent = victory
      ? `Exactly zero. ${this.match.throws.player} ${this.match.throws.player === 1 ? 'dart' : 'darts'}. Nicely done!` : 'So close. Take another shot!';
    document.querySelector('.medal text')!.textContent = victory ? '1' : '2';
    for (const id of ['restart', 'difficulty', 'help']) (document.getElementById(id) as HTMLButtonElement).disabled = true;
    document.getElementById('play-again')!.focus();
    this.announce(victory ? 'You win! Play again is available.' : 'Bot wins. Play again is available.');
  }
  private updateDifficulty() {
    const d = DIFFICULTIES[this.selected];
    document.getElementById('game')!.style.setProperty('--accent', d.color);
    document.getElementById('difficulty-name')!.textContent = d.label;
    document.getElementById('difficulty-description')!.textContent = d.subtitle;
    const emblem = document.getElementById('emblem')!;
    // Reuse Sudoku's leaf / spark / diamond difficulty emblems as crisp SVG.
    const paths = ['M8 32C6 10 24 5 37 7C38 24 30 38 13 34M10 36L29 17', 'M26 5L10 26H22L18 40L35 18H24Z', 'M22 5L38 22L22 39L6 22Z'];
    emblem.innerHTML = `<svg viewBox="0 0 44 44" width="64%" height="64%"><path d="${paths[this.selected]}" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
    const slider = document.getElementById('difficulty-slider') as HTMLInputElement;
    slider.value = String(this.selected); slider.setAttribute('aria-valuetext', d.label);
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-difficulty]')) button.setAttribute('aria-pressed', String(Number(button.dataset.difficulty) === this.selected));
  }
  destroy() { this.abort.abort(); }
}
