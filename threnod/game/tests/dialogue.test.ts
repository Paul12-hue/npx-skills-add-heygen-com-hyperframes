import { describe, expect, it } from 'vitest';
import { DialogueRunner, validateDialogue, type DialogueGraph } from '../src/dialogue/Dialogue';
import dialogues from '../src/data/dialogues.json';

describe('dialogue data', () => {
  it('every dialogue in dialogues.json is valid', () => {
    const errors = Object.entries(dialogues as Record<string, DialogueGraph>).flatMap(([id, g]) => validateDialogue(id, g));
    expect(errors).toEqual([]);
  });
});

describe('validateDialogue', () => {
  it('finds missing targets, unreachable nodes and bad exits', () => {
    const g: DialogueGraph = {
      start: 'a',
      nodes: {
        a: { text: 'hi', next: 'missing' },
        b: { text: 'lonely', end: true },
        c: { text: 'two exits', end: true, next: 'a' },
      },
    };
    const errs = validateDialogue('t', g).join('\n');
    expect(errs).toContain('missing node "missing"');
    expect(errs).toContain('"b" is unreachable');
    expect(errs).toContain('"c" must have exactly one');
  });
});

describe('DialogueRunner', () => {
  const graph: DialogueGraph = {
    start: 'a',
    starts: [{ if: 'met', start: 'again' }],
    nodes: {
      a: { text: 'first', next: 'b', set: { met: true } },
      b: {
        text: 'choose',
        choices: [
          { text: 'kind', next: 'end', set: { kind: true } },
          { text: 'secret', next: 'end', if: 'knows_secret' },
          { text: 'rude', next: 'end' },
        ],
      },
      end: { text: 'bye', end: true },
      again: { text: 'you again', end: true },
    },
  };

  it('walks a branch, sets flags and finishes', () => {
    const flags = {};
    const r = new DialogueRunner(graph, flags);
    expect(r.node.text).toBe('first');
    expect(flags).toEqual({ met: true });
    r.advance();
    expect(r.choices.map((c) => c.text)).toEqual(['kind', 'rude']); // conditional choice hidden
    r.choose(0);
    expect(flags).toEqual({ met: true, kind: true });
    expect(r.node.text).toBe('bye');
    r.advance();
    expect(r.finished).toBe(true);
  });

  it('uses the alternative start once a flag is set', () => {
    const r = new DialogueRunner(graph, { met: true });
    expect(r.node.text).toBe('you again');
  });

  it('shows conditional choices when the flag holds', () => {
    const r = new DialogueRunner(graph, { knows_secret: true });
    r.advance();
    expect(r.choices).toHaveLength(3);
  });
});
