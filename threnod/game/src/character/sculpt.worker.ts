import { sculpt, type SculptJob } from './sculpt';

/** Sculpts characters off the main thread so the game never stutters while they are built. */
self.onmessage = (ev: MessageEvent<SculptJob>) => {
  const r = sculpt(ev.data);
  (self as unknown as Worker).postMessage(r, [r.positions.buffer, r.normals.buffer, r.indices.buffer, r.skinIndex.buffer, r.skinWeight.buffer, r.slotIndex.buffer, r.slotWeight.buffer]);
};
