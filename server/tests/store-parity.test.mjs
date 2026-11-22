import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPgStore } from '../store/pg-store.mjs';
import { createFileStore } from '../store/file-store.mjs';
import { withEnsure } from '../store/with-ensure.mjs';
import { createState } from '../game/legacy.mjs';
import { summarize } from '../api.mjs';

const deps = { createState, summarize, qualifyLevel: 3 };
const fnNames = (o) => Object.keys(o).filter((k) => typeof o[k] === 'function').sort();

test('интерфейс хранилищ PostgreSQL и файлового совпадает — ничего не пропадает в разных режимах', () => {
  const fakePool = { connect: async () => { throw new Error('no db'); }, query: async () => { throw new Error('no db'); } };
  const pg = createPgStore(fakePool, deps);
  const file = createFileStore(null, deps);
  assert.deepEqual(fnNames(pg), fnNames(file));
  for (const m of ['transact', 'leaderboard', 'rankOf', 'recordReferral', 'referralOf', 'referralStats', 'dueForNotify']) assert.ok(fnNames(pg).includes(m), m);
});

test('обёртка миграций пропускает ВСЕ методы и ждёт миграции перед каждым вызовом', async () => {
  const fakePool = { connect: async () => { throw new Error('db-called'); }, query: async () => { throw new Error('db-called'); } };
  const pg = createPgStore(fakePool, deps);
  let ensured = 0;
  const wrapped = withEnsure(pg, async () => { ensured += 1; });
  assert.deepEqual(fnNames(wrapped), fnNames(pg));
  for (const name of fnNames(pg)) {
    ensured = 0;
    await assert.rejects(() => wrapped[name]('1', '2', async () => ({})), /db-called/);
    assert.equal(ensured, 1, `${name}: миграции не дождались`);
  }
});
