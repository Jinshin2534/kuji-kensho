// 結果の検証。主催者の言い分(結果URLの中身)を信じず、手元で全部計算し直す。
import { isHex64 } from './hash.js';
import { canonicalRoster } from './roster.js';
import { commitmentOf, draw, envelope, MAX_WINNERS } from './lottery.js';

/**
 * status: ok = 確かめられた / fail = おかしい / unknown = この情報だけでは確かめられない
 * @param record 結果URLの中身 { title, winners, commit, seed, roster, claimed }
 * @param opts.announcedCommit 参加者が「告知で見た」ハッシュ(結果URLの外から持ってくる値)
 */
export async function verifyResult(record, { announcedCommit } = {}) {
  const checks = [];
  const add = (id, status, label, detail) => checks.push({ id, status, label, detail });
  const winners = record?.winners;
  const seed = record?.seed;
  const commit = String(record?.commit ?? '').toLowerCase();

  const paramsOk = Number.isInteger(winners) && winners >= 1 && winners <= MAX_WINNERS && isHex64(seed);
  add('params', paramsOk ? 'ok' : 'fail', '種と当選人数の形式', paramsOk ? `種は256ビット、当選は${winners}人` : '種は16進数64桁、当選人数は整数である必要があります');

  let recomputedCommit = null;
  if (paramsOk) {
    recomputedCommit = await commitmentOf(winners, seed);
    const same = recomputedCommit === commit;
    add('seal', same ? 'ok' : 'fail', '明かした種は、封をしたときの種と同じか',
      same ? '種と当選人数からハッシュを計算し直すと、結果に書かれたハッシュと一致しました' : `計算し直したハッシュ ${recomputedCommit.slice(0, 16)}… が、結果に書かれた ${commit.slice(0, 16) || '(なし)'}… と違います`);
  }

  const announced = String(announcedCommit ?? '').trim().toLowerCase();
  if (!announced) {
    add('announce', 'unknown', '締め切り前に告知されたハッシュと同じか', '告知で見たハッシュを入れると照合します。結果URLの中のハッシュだけでは、主催者があとから作り直した可能性を消せません');
  } else {
    const same = announced === commit;
    add('announce', same ? 'ok' : 'fail', '締め切り前に告知されたハッシュと同じか', same ? 'あなたが告知で見たハッシュと一致しました' : 'あなたが告知で見たハッシュと違います。種か当選人数があとから変わっています');
  }

  const { names, duplicates } = canonicalRoster(record?.roster ?? []);
  const rosterOk = names.length > 0 && duplicates.length === 0;
  add('roster', rosterOk ? 'ok' : 'fail', '名簿が使える形か', rosterOk ? `${names.length}人。並べ替えてから使うので、名簿の順番は結果に関係しません` : duplicates.length ? `同じ名前があります: ${duplicates.join('、')}` : '名簿が空です');

  let result = null;
  if (paramsOk && rosterOk) {
    result = await draw({ seed, winners, roster: names });
    const claimed = Array.isArray(record?.claimed) ? record.claimed : null;
    if (claimed) {
      const same = claimed.length === result.winners.length && claimed.every((n, i) => n === result.winners[i]);
      add('claim', same ? 'ok' : 'fail', '発表された当選者は、計算し直した結果と同じか', same ? '順位まで一致しました' : '発表された当選者と、計算し直した当選者が違います');
    }
  }

  const failed = checks.some((c) => c.status === 'fail');
  const unknown = checks.some((c) => c.status === 'unknown');
  return {
    verdict: failed ? 'fail' : unknown ? 'partial' : 'ok',
    checks,
    result,
    envelope: paramsOk ? envelope(winners, seed) : null,
    recomputedCommit,
  };
}
