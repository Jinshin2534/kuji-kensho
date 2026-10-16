// この端末だけの控え(localStorage)。なくても動く。
const KEY_SEEN = 'kuji:seen';
const KEY_OWN = 'kuji:own';

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 保存できない環境では控えを残さない */
  }
}

/** 参加者が告知を見たことを覚える(あとで結果と自動で照合するため) */
export function rememberAnnouncement({ commit, title }) {
  const seen = read(KEY_SEEN, {});
  if (!seen[commit]) seen[commit] = { title, at: new Date().toISOString() };
  write(KEY_SEEN, seen);
  return seen[commit];
}
export const seenAnnouncement = (commit) => read(KEY_SEEN, {})[commit] ?? null;
export function seenByTitle(title) {
  return Object.entries(read(KEY_SEEN, {}))
    .filter(([, v]) => v.title === title)
    .map(([commit, v]) => ({ commit, ...v }));
}

/** 主催者の控え(種入りURL)。この端末にだけ残る */
export function rememberOwn(entry) {
  const own = read(KEY_OWN, []).filter((e) => e.commit !== entry.commit);
  own.unshift({ ...entry, at: new Date().toISOString() });
  write(KEY_OWN, own.slice(0, 20));
}
export const ownDrafts = () => read(KEY_OWN, []);
