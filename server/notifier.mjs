// Фоновая отправка уведомлений бота о завершённых стройках, производстве и исследованиях.
import * as E from './game/engine.mjs';

const UNREACHABLE = /blocked|deactivated|chat not found|forbidden|user is deleted/i;

export function createNotifier({ store, send, clock = Date.now, log = console }) {
  return {
    /** Один проход: находит игроков с завершёнными таймерами, отправляет сообщение, возвращает число отправленных. */
    async tick() {
      const ids = await store.dueForNotify(clock(), 40);
      let sent = 0;
      for (const id of ids) {
        let lines = [];
        try {
          // Сначала помечаем уведомления отправленными (не более одного раза), затем отправляем.
          lines = await store.transact(id, {}, async (state) => {
            const next = structuredClone(state);
            E.settle(next, clock());
            return { state: next, result: E.takeNotifications(next, clock()) };
          });
        } catch (error) {
          log.error(`[notify] не удалось обработать игрока: ${String(error.message).slice(0, 120)}`);
          continue;
        }
        if (!lines.length) continue;
        try {
          await send(id, lines.join('\n'));
          sent += 1;
        } catch (error) {
          if (UNREACHABLE.test(String(error.message))) {
            // Игрок заблокировал бота или удалил чат: больше не пытаемся.
            await store.transact(id, {}, async (state) => {
              const next = structuredClone(state); next.notify.enabled = false; return { state: next };
            }).catch(() => {});
          } else log.error(`[notify] ошибка отправки: ${String(error.message).slice(0, 120)}`);
        }
      }
      return sent;
    },
  };
}
