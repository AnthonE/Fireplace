// The input lead: how many ticks ahead of the server's clock a client samples
// its words, so they reach the relay before their tick closes. Each bundle's
// trailer says how early the worst of this client's words landed since the
// bundle before (its slack, in ms; negative, late, and the relay then closed
// the tick with the last word repeated).
//
// Down slowly, at most 0.04 ticks a bundle (the predicted clock 2% slow),
// toward the slack's own spread plus a send interval and 4 ms. Up fast: late
// words raise the goal at once by what they were late by plus that margin,
// at most JUMP ticks, and the lead runs to it at up to a tick a bundle (the
// predicted clock half again as fast), so a step in the round trip costs a
// few late words, not the second the slow way took. The words sampled before
// the lead got there may still land late, so nothing more happens until a
// bundle has heard the first word sampled with the whole raise in it. If
// that one landed with the raise to spare, the lateness had gone by itself
// (a stall, over by the time its words landed, which no lead would have
// saved), and the raise goes back at a quarter of a tick a bundle; if not,
// it stays, and a step bigger than JUMP takes another.
import { SEND_EVERY, TICK_MS } from '../net/wire.mjs';

export const LEAD_MIN = 1;
export const LEAD_MAX = 60;
const JUMP = 6; // ticks a raise adds at most
const DOWN = 0.04; // ticks a bundle, down
const UP = 1; // ticks a bundle, up to a raise
const BACK = 0.25; // ticks a bundle, giving a raise back

// p-th fraction of a list of numbers
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

export class Lead {
  constructor(lead) {
    this.lead = lead;
    this.goal = lead; // what a raise, or giving one back, runs the lead to
    this.raised = 0; // the raise under way or waiting on its first word, in ticks
    this.checkAt = Infinity; // that word's tick, once the lead has the whole raise
    this.slacks = []; // the last 128 bundles' slack
    this.raises = 0;
    this.givenBack = 0;
  }

  // A bundle's slack (ms), its newest tick, and the server's tick now (fractional). Returns the lead.
  update(slack, tick, serverTick) {
    this.slacks.push(slack);
    if (this.slacks.length > 128) this.slacks.shift();
    const target = pct(this.slacks, 0.5) - pct(this.slacks, 0.05) + SEND_EVERY * TICK_MS + 4;
    if (this.raised && tick >= this.checkAt) {
      // the first word with the whole raise in it: given back if it had the raise to spare
      if (slack - target > (this.raised - 1) * TICK_MS) { this.goal = Math.max(LEAD_MIN, this.lead - this.raised); this.givenBack++; }
      this.raised = 0;
      this.checkAt = Infinity;
    }
    if (slack < 0 && !this.raised && this.lead <= this.goal) {
      this.raised = Math.min(JUMP, LEAD_MAX - this.lead, (target - slack) / TICK_MS);
      this.goal = this.lead + this.raised;
      this.raises++;
    }
    if (this.lead < this.goal) {
      this.lead = Math.min(this.goal, this.lead + UP);
      if (this.lead >= this.goal) this.checkAt = Math.ceil(serverTick + this.lead);
    } else if (this.lead > this.goal) {
      this.lead = Math.max(this.goal, this.lead - BACK);
    } else if (!this.raised) {
      this.lead = Math.max(LEAD_MIN, Math.min(LEAD_MAX, this.lead + Math.max(-DOWN, Math.min(DOWN, 0.0025 * (target - slack)))));
      this.goal = this.lead;
    }
    return this.lead;
  }
}
