// Sends simulations to a Web Worker; falls back to the main thread if workers are unavailable.
import { gameMap, type SimMission } from '../sim/engine';
import { SIM_GAMES } from '../sim/games';
import { simulateDay, type TimerResult, type TimerSettings } from './model';
import SimWorker from './sim.worker?worker&inline';

const GAMES = gameMap(SIM_GAMES);
let worker: Worker | null | undefined;
let seq = 0;
const pending = new Map<number, (r: TimerResult) => void>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new SimWorker();
    worker.onmessage = (e: MessageEvent<{ id: number; result: TimerResult }>) => {
      const done = pending.get(e.data.id);
      pending.delete(e.data.id);
      done?.(e.data.result);
    };
    worker.onerror = () => {
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function simulateAsync(missions: SimMission[], settings: TimerSettings, horizon: number): Promise<TimerResult> {
  const w = getWorker();
  if (!w) return Promise.resolve(simulateDay(missions, GAMES, settings, horizon));
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ id, missions, settings, horizon });
  });
}
