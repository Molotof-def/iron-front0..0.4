/** Оборачивает все методы хранилища: перед вызовом гарантирует, что миграции БД выполнены. */
export function withEnsure(store, ensure) {
  const out = { kind: store.kind };
  for (const [name, fn] of Object.entries(store)) {
    if (typeof fn === 'function') out[name] = async (...args) => { await ensure(); return fn.apply(store, args); };
  }
  return out;
}
