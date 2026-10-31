/**
 * Data-driven dialogue graphs. Dialogues live in JSON (src/data/dialogues.json)
 * so writers can add conversations without touching code.
 *
 * Node fields:
 *   speaker   – name shown above the text (omit for narration)
 *   text      – the line
 *   next      – id of the following node            (linear)
 *   choices   – [{ text, next, if?, set? }]          (branching)
 *   end       – true closes the dialogue
 *   set       – flags to set when the node is shown, e.g. { "met_tilde": true }
 * A choice with "if": "flag" (or "!flag") is only offered when the condition holds.
 */

export type Flags = Record<string, boolean | number | string>;

export interface Choice {
  text: string;
  next: string;
  if?: string;
  set?: Flags;
}

export interface DialogueNode {
  speaker?: string;
  text: string;
  next?: string;
  choices?: Choice[];
  end?: boolean;
  set?: Flags;
}

export interface DialogueGraph {
  start: string;
  /** Optional alternative start nodes, checked in order: [{ if, start }]. */
  starts?: { if: string; start: string }[];
  nodes: Record<string, DialogueNode>;
}

export function checkCondition(cond: string | undefined, flags: Flags): boolean {
  if (!cond) return true;
  const neg = cond.startsWith('!');
  const key = neg ? cond.slice(1) : cond;
  const v = !!flags[key];
  return neg ? !v : v;
}

/** Static checks used by the unit tests – every dialogue must pass. */
export function validateDialogue(id: string, g: DialogueGraph): string[] {
  const errors: string[] = [];
  const ids = new Set(Object.keys(g.nodes));
  const ref = (from: string, to: string | undefined) => {
    if (to !== undefined && !ids.has(to)) errors.push(`${id}: node "${from}" points to missing node "${to}"`);
  };
  if (!ids.has(g.start)) errors.push(`${id}: start node "${g.start}" missing`);
  for (const s of g.starts ?? []) ref('(starts)', s.start);
  for (const [nid, n] of Object.entries(g.nodes)) {
    if (!n.text) errors.push(`${id}: node "${nid}" has no text`);
    const exits = (n.next ? 1 : 0) + (n.choices?.length ? 1 : 0) + (n.end ? 1 : 0);
    if (exits !== 1) errors.push(`${id}: node "${nid}" must have exactly one of next / choices / end`);
    ref(nid, n.next);
    for (const c of n.choices ?? []) ref(nid, c.next);
  }
  // reachability
  const seen = new Set<string>();
  const stack = [g.start, ...(g.starts ?? []).map((s) => s.start)];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur) || !ids.has(cur)) continue;
    seen.add(cur);
    const n = g.nodes[cur];
    if (n.next) stack.push(n.next);
    for (const c of n.choices ?? []) stack.push(c.next);
  }
  for (const nid of ids) if (!seen.has(nid)) errors.push(`${id}: node "${nid}" is unreachable`);
  return errors;
}

/** Steps through one dialogue graph, reading and writing game flags. */
export class DialogueRunner {
  private nodeId: string;
  finished = false;

  constructor(private graph: DialogueGraph, private flags: Flags) {
    const alt = graph.starts?.find((s) => checkCondition(s.if, flags));
    this.nodeId = alt ? alt.start : graph.start;
    this.enter();
  }

  get node(): DialogueNode {
    return this.graph.nodes[this.nodeId];
  }

  /** Choices that are currently available. */
  get choices(): Choice[] {
    return (this.node.choices ?? []).filter((c) => checkCondition(c.if, this.flags));
  }

  private enter(): void {
    if (this.node.set) Object.assign(this.flags, this.node.set);
  }

  /** Continue a linear node (or close an end node). */
  advance(): void {
    if (this.finished) return;
    const n = this.node;
    if (n.end) {
      this.finished = true;
      return;
    }
    if (n.next) {
      this.nodeId = n.next;
      this.enter();
    }
  }

  choose(index: number): void {
    const c = this.choices[index];
    if (!c || this.finished) return;
    if (c.set) Object.assign(this.flags, c.set);
    this.nodeId = c.next;
    this.enter();
  }
}
