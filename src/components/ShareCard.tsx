import { useRef } from 'react';
import { Icon } from './Icon';
import { TankArt } from './TankArt';
import { Btn, Modal, ResIcon } from './ui';
import { useGame } from '../state/GameProvider';
import { costEntries, num } from '../lib/format';
import { tg } from '../lib/telegram';
import type { BattleView } from '../types';

/** Карточка победы: показывается в окне, сохраняется картинкой и отправляется в чат Telegram. */
export function ShareCard({ battle, open, onClose }: { battle: BattleView; open: boolean; onClose: () => void }) {
  const { view, config, notify } = useGame();
  const ref = useRef<HTMLDivElement>(null);
  const me = battle.squad[0];
  const cfg = config.tanks.find((t) => t.id === me?.tankId);
  const r = battle.reward;
  const won = battle.status === 'won';
  const headline = battle.pvp ? `Дуэль против ${battle.pvp.opponent.nickname}` : battle.title;
  const text = `${won ? '🏆 Победа' : '⚔️ Бой'} в IRON FRONT — ${headline}! Ходов: ${battle.turn}. Командир ${view.nickname}, ${view.commander.rank}. Присоединяйся!`;
  const link = view.referral.link;

  const share = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(link ?? 'https://t.me')}&text=${encodeURIComponent(text)}`;
    const w = tg() as { openTelegramLink?: (u: string) => void } | undefined;
    if (w?.openTelegramLink) w.openTelegramLink(url); else window.open(url, '_blank', 'noopener');
  };
  /** Рисуем карточку на canvas, вставляя SVG танка как изображение. */
  const download = async () => {
    try {
      const W = 720; const H = 400;
      const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      const g = canvas.getContext('2d'); if (!g) throw new Error('canvas');
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#171d20'); bg.addColorStop(1, '#0a0c0d');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#e39a2d'; g.lineWidth = 4; g.strokeRect(10, 10, W - 20, H - 20);
      g.fillStyle = '#8a9a45'; g.font = '700 22px system-ui, sans-serif'; g.fillText('IRON FRONT', 36, 56);
      g.fillStyle = '#e6e9ea'; g.font = '800 38px system-ui, sans-serif'; g.fillText(won ? 'ПОБЕДА!' : 'БОЙ ЗАВЕРШЁН', 36, 112);
      g.fillStyle = '#c4ccd0'; g.font = '500 22px system-ui, sans-serif'; g.fillText(headline.slice(0, 34), 36, 150);
      g.fillText(`Ходов: ${battle.turn}`, 36, 184);
      g.fillStyle = '#e39a2d'; g.font = '700 22px system-ui, sans-serif'; g.fillText(`${view.commander.rank} ${view.nickname}`.slice(0, 36), 36, 340);
      g.fillStyle = '#8c979d'; g.font = '500 18px system-ui, sans-serif';
      const rew = r ? [...costEntries(r).map(([k, v]) => `+${num(v)} ${({ credits: 'кр.', steel: 'стали', scrap: 'лома', fuel: 'топл.', science: 'данных' } as Record<string, string>)[k]}`), r.xp ? `+${r.xp} XP` : ''].filter(Boolean).join('  ') : '';
      g.fillText(rew, 36, 376);
      const svg = ref.current?.querySelector('svg');
      if (svg) {
        const xml = new XMLSerializer().serializeToString(svg).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
        const img = new Image();
        await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`; });
        g.drawImage(img, 340, 90, 360, 202);
      }
      const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'iron-front-victory.png'; a.click();
    } catch { notify('info', 'Не удалось сохранить картинку — отправьте карточку текстом.'); }
  };

  return (
    <Modal open={open} title="Карточка боя" onClose={onClose}>
      <div className="share-card">
        <p className="eyebrow">IRON FRONT</p>
        <h3>{won ? 'Победа!' : 'Бой завершён'}</h3>
        <p className="muted">{headline} · ходов: {battle.turn}</p>
        <div ref={ref} className="share-art">{cfg && <TankArt cls={cfg.class} shape={cfg.shape} rarity={cfg.rarity} size={260} camoId={view.tanks.find((t) => t.id === me.tankId)?.cosmetic?.camo === 'default' ? undefined : view.tanks.find((t) => t.id === me.tankId)?.cosmetic?.camo} emblemId={view.tanks.find((t) => t.id === me.tankId)?.cosmetic?.emblem === 'none' ? undefined : view.tanks.find((t) => t.id === me.tankId)?.cosmetic?.emblem} />}</div>
        {r && (
          <ul className="reward-list">{costEntries(r).map(([k, v]) => <li key={k}><ResIcon k={k} size={14} />+{num(v)}</li>)}{r.xp > 0 && <li><Icon name="star" size={14} className="res-xp" />+{r.xp} XP</li>}{r.rating ? <li><Icon name="trophy" size={14} />{r.rating > 0 ? '+' : ''}{r.rating}</li> : null}</ul>
        )}
        <p className="amber small">{view.commander.rank} {view.nickname}</p>
      </div>
      <div className="two"><Btn variant="amber" icon="arrow" onClick={share}>Отправить в чат</Btn><Btn variant="ghost" icon="check" onClick={() => void download()}>Сохранить картинку</Btn></div>
    </Modal>
  );
}
