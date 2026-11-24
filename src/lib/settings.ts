// Локальные настройки интерфейса: звук, музыка, крупный шрифт. Хранятся только на устройстве.
export interface Settings { sfx: boolean; music: boolean; large: boolean }
const KEY = 'ironfront.settings';
const DEFAULTS: Settings = { sfx: true, music: false, large: false };

export function loadSettings(): Settings {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Settings>) }; } catch { return { ...DEFAULTS }; }
}
let current: Settings = loadSettings();
export const getSettings = (): Settings => current;
export function saveSettings(next: Settings): void {
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  applySettings();
}
export function applySettings(): void {
  document.documentElement.classList.toggle('fs-large', current.large);
  if (current.music) startMusic(); else stopMusic();
}

// ---- Звук: короткие синтезированные сигналы, внешних файлов нет ----
let ctx: AudioContext | null = null;
const audio = (): AudioContext | null => {
  if (ctx) return ctx;
  try { const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (C) ctx = new C(); } catch { ctx = null; }
  return ctx;
};
type Sfx = 'tap' | 'shot' | 'hit' | 'win' | 'lose' | 'claim' | 'error';
const TONES: Record<Sfx, { f: number[]; d: number; type: OscillatorType; g: number }> = {
  tap: { f: [520], d: 0.05, type: 'triangle', g: 0.05 }, shot: { f: [140, 70], d: 0.16, type: 'sawtooth', g: 0.09 },
  hit: { f: [110, 60], d: 0.2, type: 'square', g: 0.06 }, win: { f: [392, 523, 659, 784], d: 0.13, type: 'triangle', g: 0.07 },
  lose: { f: [330, 262, 196], d: 0.18, type: 'sawtooth', g: 0.05 }, claim: { f: [660, 880], d: 0.1, type: 'sine', g: 0.07 }, error: { f: [180], d: 0.12, type: 'square', g: 0.04 },
};
export function sfx(name: Sfx): void {
  if (!current.sfx) return;
  const a = audio(); if (!a) return;
  try {
    if (a.state === 'suspended') void a.resume();
    const t = TONES[name]; let at = a.currentTime;
    for (const f of t.f) {
      const o = a.createOscillator(); const g = a.createGain();
      o.type = t.type; o.frequency.setValueAtTime(f, at);
      if (name === 'shot' || name === 'hit') o.frequency.exponentialRampToValueAtTime(Math.max(30, f * 0.5), at + t.d);
      g.gain.setValueAtTime(t.g, at); g.gain.exponentialRampToValueAtTime(0.0001, at + t.d);
      o.connect(g).connect(a.destination); o.start(at); o.stop(at + t.d + 0.02); at += t.d * 0.9;
    }
  } catch { /* звук необязателен */ }
}

// ---- Музыка: тихий фоновый гул, включается пользователем ----
let musicNodes: { stop: () => void } | null = null;
function startMusic(): void {
  if (musicNodes) return;
  const a = audio(); if (!a) return;
  try {
    if (a.state === 'suspended') void a.resume();
    const master = a.createGain(); master.gain.value = 0.025; master.connect(a.destination);
    const oscs = [55, 82.4, 110].map((f, i) => { const o = a.createOscillator(); o.type = i === 2 ? 'triangle' : 'sine'; o.frequency.value = f; const lfo = a.createOscillator(); const lg = a.createGain(); lfo.frequency.value = 0.07 + i * 0.03; lg.gain.value = 0.6; lfo.connect(lg).connect(o.frequency); o.connect(master); o.start(); lfo.start(); return [o, lfo]; }).flat();
    musicNodes = { stop: () => { try { oscs.forEach((o) => o.stop()); master.disconnect(); } catch { /* ignore */ } } };
  } catch { musicNodes = null; }
}
function stopMusic(): void { musicNodes?.stop(); musicNodes = null; }
