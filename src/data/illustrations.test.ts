/// <reference types="node" />
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import seed from './exercises.seed.json';

describe('illustrations', () => {
  const withDrawings = seed.exercises.filter((e) => 'illustrations' in e && e.illustrations);

  it('has start and end frame for every mapped exercise', () => {
    const bad = withDrawings.filter((e) => (e as { illustrations: string[] }).illustrations.length !== 2);
    expect(bad.map((e) => e.name)).toEqual([]);
  });

  it('ships every referenced file', () => {
    const missing = withDrawings
      .flatMap((e) => (e as { illustrations: string[] }).illustrations)
      .filter((p) => !existsSync(join('public', p)));
    expect(missing).toEqual([]);
  });
});
