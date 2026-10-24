import type { MuscleId } from '../lib/muscleMap';

// Own stylized body (viewBox 0 0 200 400). Every path describes the left half (x <= 100)
// and is mirrored at x = 100 when rendered, so both sides stay symmetric.

export const HEAD = { cx: 100, cy: 28, r: 17 };

export const BODY_HALF =
  'M100 46 L91 46 L89 58 Q70 60 60 66 Q48 74 50 92 L49 120 Q47 140 47 148 Q40 176 41 212 ' +
  'Q40 228 44 238 L52 238 Q56 226 53 212 Q60 182 62 152 L66 108 Q68 140 70 184 ' +
  'Q64 210 68 250 Q70 280 74 304 Q68 330 74 372 L72 392 L92 394 L90 376 Q94 340 90 310 ' +
  'Q96 290 96 260 Q99 230 99 212 L100 212 Z';

const FOREARM = 'M51 150 Q44 172 44 206 L52 208 Q58 182 61 152 Z';
const DELTOID = 'M64 67 Q50 72 51 92 Q53 102 57 106 Q64 92 71 72 Z';
const UPPER_ARM = 'M57 108 Q51 124 52 144 Q58 148 62 146 Q66 128 66 104 Z';

export const FRONT: Partial<Record<MuscleId, string[]>> = {
  neck: ['M91 48 L99 50 L99 60 L90 59 Z'],
  traps: ['M89 59 Q76 61 66 66 L80 67 Q88 64 92 61 Z'],
  shoulders: [DELTOID],
  chest: ['M73 70 Q86 68 99 72 L99 104 Q86 112 71 102 Q69 86 73 70 Z'],
  biceps: [UPPER_ARM],
  forearms: [FOREARM],
  abdominals: ['M82 110 Q90 112 99 112 L99 186 Q90 186 85 180 Q80 150 82 110 Z'],
  abductors: ['M70 188 Q66 204 67 226 L73 220 Q74 202 76 192 Z'],
  quadriceps: ['M76 196 Q68 226 71 270 Q73 290 80 300 L88 300 Q92 280 92 250 Q92 222 86 204 Z'],
  adductors: ['M88 204 Q93 222 93 248 Q96 232 98 214 L98 206 Z'],
  calves: ['M75 314 Q70 336 75 368 L82 368 Q86 340 84 314 Z'],
};

export const BACK: Partial<Record<MuscleId, string[]>> = {
  traps: ['M91 50 L99 50 L99 118 Q92 104 80 80 L66 66 Q80 62 89 59 Z'],
  shoulders: [DELTOID],
  triceps: [UPPER_ARM],
  forearms: [FOREARM],
  'middle back': ['M80 84 Q90 102 99 122 L99 140 Q90 132 84 120 Q79 102 80 84 Z'],
  lats: ['M70 86 Q74 80 78 84 Q80 118 92 140 Q90 152 84 160 Q72 140 69 112 Z'],
  'lower back': ['M93 144 L99 144 L99 186 L87 184 Q88 164 93 144 Z'],
  abductors: ['M70 182 Q68 188 71 194 Q78 190 85 187 Q78 180 70 182 Z'],
  glutes: ['M72 194 Q68 220 84 228 Q96 228 99 214 L99 192 Q86 188 72 194 Z'],
  hamstrings: ['M72 232 Q70 270 77 302 L89 302 Q95 266 94 232 Q84 236 72 232 Z'],
  calves: ['M74 312 Q66 336 75 366 L85 366 Q94 336 89 312 Z'],
};
