// Runs the day simulation off the main thread, so typing in the calculator stays smooth.
import { gameMap, type SimMission } from '../sim/engine';
import { SIM_GAMES } from '../sim/games';
import { simulateDay, type TimerSettings } from './model';

const GAMES = gameMap(SIM_GAMES);

self.onmessage = (e: MessageEvent<{ id: number; missions: SimMission[]; settings: TimerSettings; horizon: number }>) => {
  const { id, missions, settings, horizon } = e.data;
  (self as unknown as Worker).postMessage({ id, result: simulateDay(missions, GAMES, settings, horizon) });
};
