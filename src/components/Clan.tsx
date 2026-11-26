import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Icon } from './Icon';
import { Bar, Btn, Modal, Panel, ResIcon } from './ui';
import { useGame } from '../state/GameProvider';
import { costEntries, duration, num } from '../lib/format';
import { haptic } from '../lib/telegram';
import type { ClanData } from '../types';

/** Кланы: состав и очки хранит сервер; общая недельная цель клана даёт награду каждому участнику. */
export function ClanPanel() {
  const { view, config, act, busy, notify, now } = useGame();
  const [data, setData] = useState<ClanData | null>(null);
  const [q, setQ] = useState('');
  const [name, setName] = useState(''); const [tag, setTag] = useState('');
  const [leave, setLeave] = useState(false);
  const [working, setWorking] = useState(false);
  const locked = view.commander.level < config.clan.minLevel;

  const load = useCallback(async (query: string) => {
    try { setData(await api.clan(query)); } catch (e) { notify('err', (e as ApiError).message || 'Не удалось загрузить кланы.'); }
  }, [notify]);
  useEffect(() => { if (!locked) void load(''); }, [locked, load]);

  const op = async (kind: 'create' | 'join' | 'leave', payload: Record<string, unknown> = {}, ok?: string) => {
    if (working) return;
    setWorking(true);
    try { setData(await api.clanOp(kind, payload)); haptic('success'); if (ok) notify('ok', ok); }
    catch (e) { haptic('error'); notify('err', (e as ApiError).message || 'Ошибка.'); }
    finally { setWorking(false); }
  };

  if (locked) return <Panel title="Клан" icon="flag"><p className="muted">Кланы открываются с {config.clan.minLevel} уровня командира. Сейчас у вас {view.commander.level}.</p></Panel>;
  if (!data) return <Panel title="Клан" icon="flag"><p className="muted">Загрузка…</p></Panel>;
  if (data.unavailable) return <Panel title="Клан" icon="flag"><p className="problem"><Icon name="info" size={14} />Кланы временно недоступны. Попробуйте позже.</p></Panel>;

  const c = data.clan;
  if (c) {
    const done = c.total >= c.goal;
    return (
      <>
        <Panel title={`[${c.tag}] ${c.name}`} icon="flag" className="clan" right={<span className="chip">{c.members.length}/{c.maxMembers}</span>}>
          <h4>Недельная цель клана</h4>
          <Bar value={Math.min(c.total, c.goal)} max={c.goal} tone={done ? 'amber' : 'olive'} label="Цель клана" />
          <div className="req-row"><span className="small">{num(c.total)} / {num(c.goal)} очков</span><span className="muted small"><Icon name="clock" size={13} /> {duration(Math.max(0, (c.weekEndsAt - now()) / 1000))}</span></div>
          <ul className="reward-list small">{costEntries(config.clan.reward).map(([k, v]) => <li key={k}><ResIcon k={k} size={13} />{num(v)}</li>)}</ul>
          <p className="muted small">Очки приносят победы: разведка 5, оборона и захват 8, испытания 6, сильные противники 15, дуэли 10. Ваш вклад за неделю: {view.clan.points}.</p>
          <Btn variant={done && !view.clan.claimed ? 'amber' : 'ghost'} block icon={view.clan.claimed ? 'check' : 'trophy'} disabled={busy || !done || view.clan.claimed}
            onClick={async () => { await act('clan/claim', {}, 'Награда клана получена'); void load(''); }}>
            {view.clan.claimed ? 'Награда получена' : done ? 'Забрать награду' : 'Цель ещё не выполнена'}
          </Btn>
        </Panel>
        {c.war && (
          <Panel title="Клановая война" icon="trophy" className="war">
            <p className="muted small">Каждую неделю кланы соревнуются по сумме очков. Награда зависит от места клана и вашего личного вклада (не меньше {config.war.minPoints} очков).</p>
            <p>Место клана на этой неделе: <b className="amber">{c.war.liveRank ?? '—'}</b> из {c.war.clans}</p>
            {c.war.prev ? (
              <div className="season-claim">
                <b>Итоги прошлой недели: {c.war.prev.band} (место {c.war.prev.rank} из {c.war.prev.clans})</b>
                <ul className="reward-list small">{costEntries(c.war.prev.reward).map(([k, v]) => <li key={k}><ResIcon k={k} size={13} />{num(v)}</li>)}</ul>
                <p className="muted small">Ваш вклад: {view.clan.prevPoints} очков.</p>
                <Btn variant={view.clan.warClaimed || view.clan.prevPoints < config.war.minPoints ? 'ghost' : 'amber'} block icon={view.clan.warClaimed ? 'check' : 'trophy'}
                  disabled={busy || view.clan.warClaimed || view.clan.prevPoints < config.war.minPoints} onClick={async () => { await act('clan/war-claim', {}, 'Награда клановой войны получена'); void load(''); }}>
                  {view.clan.warClaimed ? 'Награда получена' : view.clan.prevPoints < config.war.minPoints ? 'Мало личных очков' : 'Забрать награду'}
                </Btn>
              </div>
            ) : <p className="muted small">Итоги появятся после завершения недели.</p>}
          </Panel>
        )}
        <Panel title="Состав" icon="profile">
          <ol className="board">{c.members.map((m, i) => (
            <li key={`${m.nickname}-${i}`} className={m.me ? 'me' : ''}><span>{i + 1}</span><b>{m.nickname}{m.leader && <em className="rec">лидер</em>}</b><small>ур. {m.level} · {m.points} оч.</small></li>
          ))}</ol>
          <Btn variant="danger" icon="x" disabled={working} onClick={() => setLeave(true)}>Покинуть клан</Btn>
        </Panel>
        <Modal open={leave} title="Покинуть клан?" onClose={() => setLeave(false)}>
          <p>Ваши очки перестанут считаться в клане. Вернуться можно в любой момент, если есть места.</p>
          <div className="modal-actions"><Btn variant="ghost" onClick={() => setLeave(false)}>Остаться</Btn><Btn variant="danger" onClick={() => { setLeave(false); void op('leave', {}, 'Вы покинули клан'); }}>Покинуть</Btn></div>
        </Modal>
      </>
    );
  }
  return (
    <>
      <Panel title="Создать клан" icon="flag">
        <p className="muted small">Объединяйтесь с друзьями: вместе выполняйте недельную цель и получайте награды.</p>
        <div className="clan-form">
          <label className="field">Название<input value={name} maxLength={config.clan.maxName} onChange={(e) => setName(e.target.value)} placeholder="Стальной кулак" /></label>
          <label className="field">Тег<input value={tag} maxLength={5} onChange={(e) => setTag(e.target.value)} placeholder="SK" /></label>
        </div>
        <Btn variant="amber" block icon="plus" disabled={working || name.trim().length < config.clan.minName || tag.trim().length < 2} onClick={() => op('create', { name, tag }, 'Клан создан')}>Создать клан</Btn>
      </Panel>
      <Panel title="Кланы" icon="profile">
        <form className="nick" onSubmit={(e) => { e.preventDefault(); void load(q); }}>
          <label className="field">Поиск<input value={q} maxLength={20} onChange={(e) => setQ(e.target.value)} placeholder="Название или тег" /></label>
          <Btn type="submit" variant="ghost">Найти</Btn>
        </form>
        {data.list.length === 0 ? <p className="muted">Кланов пока нет — создайте первый!</p> : (
          <ul className="clans">{data.list.map((r) => (
            <li key={r.id}><div><b>[{r.tag}] {r.name}</b><small className="muted">{r.members}/{config.clan.maxMembers} · {r.points} оч. за неделю</small></div>
              <Btn variant="primary" disabled={working || r.members >= config.clan.maxMembers} onClick={() => op('join', { clanId: r.id }, 'Вы вступили в клан')}>Вступить</Btn></li>
          ))}</ul>
        )}
      </Panel>
    </>
  );
}
