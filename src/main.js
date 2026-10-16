import { randomSeed, sha256Hex } from './lib/hash.js';
import { canonicalRoster } from './lib/roster.js';
import { commitmentOf, draw, envelope, rosterDigest, MAX_WINNERS, VERSION } from './lib/lottery.js';
import { encodeState, decodeState } from './lib/codec.js';
import { verifyResult } from './lib/verify.js';
import { RISKS, LEVEL_LABEL, stuffingAttempts } from './lib/risks.js';
import { $, $$, esc, groupHex, fingerprint, copy, toast, fmtDeadline } from './ui/dom.js';
import { rememberAnnouncement, seenAnnouncement, rememberOwn, ownDrafts } from './ui/store.js';
import verifyScript from '../scripts/verify.mjs?raw';

const view = $('#view');
const state = { kind: 'home', data: null, verification: null };
const origin = () => `${location.origin}${location.pathname}`;
const urlFor = (frag) => `${origin()}#${frag}`;

function hashBlock(hash, label) {
  return `
    <div class="hashbox">
      ${fingerprint(hash)}
      <div class="hashbox-text">
        <div class="eyebrow">${esc(label)}</div>
        <code class="hash">${esc(groupHex(hash))}</code>
        <button class="link" data-copy="${esc(hash)}">ハッシュをコピー</button>
      </div>
    </div>`;
}

const LEVEL_ICON = { blocked: '防', detectable: '見', open: '穴' };
function risksSection(result) {
  const n = result?.names.length;
  const k = result?.winners.length;
  return `
    <section class="panel" id="risks">
      <h2>主催者が不正できる余地</h2>
      <p class="lead">コミットメント方式は「あとから種を替える」ことは防げますが、万能ではありません。主催者にできてしまうことを全部並べます。</p>
      <ul class="risks">
        ${RISKS.map(
          (r) => `
          <li class="risk risk-${r.level}">
            <span class="risk-badge" aria-hidden="true">${LEVEL_ICON[r.level]}</span>
            <div>
              <div class="risk-head"><strong>${esc(r.title)}</strong><span class="pill pill-${r.level}">${LEVEL_LABEL[r.level]}</span></div>
              <p>${esc(r.how)}</p>
              ${r.attempts && n ? `<p class="note">このくじ(${n}人から${k}人)なら、特定の1人を当てるのに主催者が試す名簿の数はおよそ <b>${stuffingAttempts(n, k).toLocaleString()} 通り</b>。手元の計算なら一瞬で終わる回数です。</p>` : ''}
            </div>
          </li>`,
        ).join('')}
      </ul>
    </section>`;
}

function howSection() {
  return `
    <section class="panel" id="how">
      <h2>しくみ — 封筒のたとえ</h2>
      <ol class="steps">
        <li><b>封をする</b>(締め切り前): 主催者は「種」というでたらめな数を決め、封筒に入れて封をします。公開するのは封筒の<b>指紋</b>(SHA-256 ハッシュ)だけ。指紋から中身は分かりませんが、中身を少しでも変えると指紋がまったく別物になります。</li>
        <li><b>締め切る</b>: 応募を締め切って名簿を確定します。</li>
        <li><b>封を開ける</b>: 主催者が種を明かします。誰でも「種の指紋が告知と同じか」と「名簿と種から計算した当選者」を確かめられます。名簿と種が決まれば、当選者は一通りに決まります。</li>
      </ol>
      <details class="detail">
        <summary>くじの計算手順(全部)</summary>
        <ol class="algo">
          <li>封筒の中身は1行: <code>${esc(VERSION)} winners=当選人数 seed=種(16進64桁)</code>。この SHA-256 が告知のハッシュです。</li>
          <li>名簿を整える: Unicode NFC にそろえ、空白をまとめ、空行を除き、文字コード順に並べ、改行でつなぐ。その SHA-256 が「名簿のハッシュ」です。<b>入力した順番は結果に影響しません。</b></li>
          <li>乱数: <code>${esc(VERSION)} draw seed=種 roster=名簿のハッシュ block=0</code> の SHA-256(32バイト)を4バイトずつ読み、32ビットの整数を8個とります。足りなくなったら block=1, 2, … と続けます。</li>
          <li>残り <i>n</i> 人から1人選ぶ: 整数を <i>n</i> で割った余りの番号の人。ただし偏りを除くため、2<sup>32</sup> − (2<sup>32</sup> mod <i>n</i>) 以上の値は捨てて引き直します。</li>
          <li>選んだ人を先頭に移し(Fisher–Yates)、当選人数ぶん繰り返します。先に選ばれた順が順位です。</li>
        </ol>
      </details>
      <details class="detail">
        <summary>なぜ値を捨てるのか(剰余による偏り)</summary>
        <p>8面のサイコロで3人から選ぶとします。目(0〜7)を3で割った余りにすると:</p>
        <div class="dice">
          ${[0, 1, 2, 3, 4, 5, 6, 7].map((v) => `<span class="die ${v >= 6 ? 'die-x' : ''}"><b>${v}</b><small>${v >= 6 ? '捨てる' : `→ ${v % 3}番`}</small></span>`).join('')}
        </div>
        <p>そのままだと 0番と1番は3回ずつ、2番は2回しか出ません。6と7を捨てて振り直せば、3人とも2回ずつで公平です。このアプリは 2<sup>32</sup> 通りの値で同じことをしています(捨てる確率は人数が少なければ10億分の1程度)。</p>
      </details>
    </section>`;
}

/* ---------------- ホーム ---------------- */
function renderHome() {
  const drafts = ownDrafts();
  view.innerHTML = `
    <section class="hero">
      <h1>くじの結果を、<br class="sp" />主催者以外の誰でも<br />あとから確かめられる。</h1>
      <p class="lead">主催者は先に「種」の指紋(ハッシュ)だけを公開し、締め切りのあとで種を明かします。名簿と種から当選者は一通りに決まるので、あとからの差し替えは誰にでも見抜けます。</p>
      <div class="flow" aria-hidden="true">
        <div><span class="flow-n">1</span>封をする<small>ハッシュを告知</small></div>
        <div><span class="flow-n">2</span>締め切る<small>名簿を確定</small></div>
        <div><span class="flow-n">3</span>封を開ける<small>誰でも再計算</small></div>
      </div>
    </section>

    <div class="grid2">
      <section class="panel" id="create">
        <h2>くじを作る <small>主催者</small></h2>
        <form id="createForm" class="form">
          <label>くじの名前<input name="title" maxlength="80" placeholder="例: 10月の読書会 プレゼント抽選" required /></label>
          <div class="row">
            <label>当選人数<input name="winners" type="number" min="1" max="${MAX_WINNERS}" value="3" required /></label>
            <label>締め切り(表示用)<input name="deadline" type="datetime-local" /></label>
          </div>
          <button class="btn primary" type="submit"><span class="seal small" aria-hidden="true">封</span>種を作って封をする</button>
          <p class="hint">種は 256 ビットの乱数をこのブラウザで作ります。自分で決めた数は使えません(推測されやすいため)。</p>
        </form>
        ${
          drafts.length
            ? `<div class="drafts"><div class="eyebrow">この端末の主催控え</div>${drafts
                .slice(0, 5)
                .map((d) => `<a href="#${esc(d.frag)}">${esc(d.title)} <small>${esc(d.commit.slice(0, 8))}…</small></a>`)
                .join('')}</div>`
            : ''
        }
      </section>

      <section class="panel" id="check">
        <h2>結果を確かめる <small>参加者</small></h2>
        <form id="checkForm" class="form">
          <label>主催者から届いた結果のURL<textarea name="url" rows="3" placeholder="https://…/#r=…" required></textarea></label>
          <button class="btn" type="submit">確かめる</button>
        </form>
        <div class="or">または</div>
        <button class="btn ghost" id="demo">見本のくじで一通り試す</button>
        <p class="hint">7人から2人を選ぶ見本を、封をする → 告知 → 結果の順に作ります。</p>
      </section>
    </div>
    ${howSection()}
    ${risksSection()}`;

  $('#createForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    await createLottery({ title: f.get('title').trim(), winners: Number(f.get('winners')), deadline: f.get('deadline') || '' });
  });
  $('#checkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = new FormData(e.target).get('url');
    const s = await decodeState(raw);
    if (!s) return toast('くじのURLとして読めませんでした');
    location.hash = raw.slice(raw.indexOf('#') + 1);
  });
  $('#demo').addEventListener('click', () => demo());
}

async function createLottery({ title, winners, deadline, seed = randomSeed() }) {
  const commit = await commitmentOf(winners, seed);
  const frag = await encodeState('o', { title, winners, deadline, seed });
  rememberOwn({ title, commit, frag });
  location.hash = frag;
  return { commit, frag };
}

/* ---------------- 主催者の控え ---------------- */
async function renderOrganizer(d) {
  const commit = await commitmentOf(d.winners, d.seed);
  const announce = urlFor(await encodeState('a', { title: d.title, winners: d.winners, deadline: d.deadline, commit }));
  const post = `【${d.title}】抽選の告知です。\n当選 ${d.winners} 人${d.deadline ? ` / 締め切り ${fmtDeadline(d.deadline)}` : ''}\n種のハッシュ: ${commit}\n締め切り後に種を明かします。結果は誰でも再計算できます。\n${announce}`;
  view.innerHTML = `
    <section class="panel warn-panel">
      <div class="eyebrow">主催者の控え</div>
      <h1 class="title">${esc(d.title)}</h1>
      <p class="warn"><b>このページのURLには種が入っています。誰にも見せないでください。</b> 締め切り前に種が漏れると、参加者が結果を先に計算できてしまいます。控えはこの端末にも残しています。</p>
      <button class="btn ghost small" data-copy="${esc(location.href)}" data-label="控えのURLをコピーしました">控えのURLをコピー(自分用)</button>
    </section>

    <section class="panel">
      <h2><span class="step">1</span>告知する</h2>
      <p>次の文面を、SNS の投稿など<b>参加者全員が同じものを見る場所に1回だけ</b>出してください。人によって違うハッシュを見せていないことの証拠になります。</p>
      ${hashBlock(commit, '種のハッシュ(封筒の指紋)')}
      <pre class="post">${esc(post)}</pre>
      <div class="actions">
        <button class="btn primary" data-copy="${esc(post)}" data-label="告知文をコピーしました">告知文をコピー</button>
        <a class="btn ghost" href="${esc(announce)}" target="_blank" rel="noopener">参加者の見え方を開く</a>
      </div>
    </section>

    <section class="panel">
      <h2><span class="step">2</span>締め切ったら名簿を入れて、封を開ける</h2>
      <form id="closeForm" class="form">
        <label>参加者の名簿(1行に1人)<textarea name="roster" rows="9" placeholder="佐藤 花子&#10;鈴木 一郎&#10;…"></textarea></label>
        <div id="rosterInfo" class="hint">名簿を入れてください。</div>
        <button class="btn primary" type="submit" id="openBtn" disabled>締め切って種を明かす</button>
        <p class="hint">名簿は文字コード順に並べ替えてから使うので、入力の順番は結果に関係しません。同じ名前の人がいるときは「田中(東京)」のように区別してください。</p>
      </form>
    </section>
    ${risksSection()}`;

  const ta = $('#closeForm textarea');
  const info = $('#rosterInfo');
  const btn = $('#openBtn');
  const update = async () => {
    const { names, duplicates } = canonicalRoster(ta.value);
    btn.disabled = names.length === 0 || duplicates.length > 0;
    if (!names.length) info.textContent = '名簿を入れてください。';
    else if (duplicates.length) info.innerHTML = `<span class="bad">同じ名前があります: ${esc(duplicates.join('、'))}</span>`;
    else info.innerHTML = `${names.length}人${names.length <= d.winners ? '(当選人数以下なので全員当選)' : ''} ・ 名簿のハッシュ <code>${esc((await rosterDigest(names)).slice(0, 16))}…</code>`;
  };
  ta.addEventListener('input', update);
  $('#closeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await closeLottery(d, ta.value);
  });
}

async function closeLottery(d, rosterInput) {
  const r = await draw({ seed: d.seed, winners: d.winners, roster: rosterInput });
  const frag = await encodeState('r', { title: d.title, winners: d.winners, deadline: d.deadline, commit: r.commitment, seed: d.seed, roster: r.names, claimed: r.winners });
  location.hash = frag;
  return frag;
}

/* ---------------- 告知(参加者向け) ---------------- */
function renderAnnounce(d) {
  const seen = rememberAnnouncement({ commit: d.commit, title: d.title });
  view.innerHTML = `
    <section class="panel">
      <div class="eyebrow">抽選の告知</div>
      <h1 class="title">${esc(d.title)}</h1>
      <dl class="facts">
        <div><dt>当選</dt><dd>${esc(d.winners)} 人</dd></div>
        ${d.deadline ? `<div><dt>締め切り</dt><dd>${esc(fmtDeadline(d.deadline))}</dd></div>` : ''}
      </dl>
      ${hashBlock(d.commit, '種のハッシュ(封筒の指紋)')}
      <div class="callout">
        <p><b>この指紋を覚えておいてください。</b> 結果が出たら、結果ページの指紋がこれと同じかを見比べます。色の模様が同じなら、ほぼ間違いなく同じハッシュです。</p>
        <p class="hint">この端末には ${esc(new Date(seen.at).toLocaleString('ja-JP'))} に見たことを記録しました。同じ端末で結果を開くと自動で照合します。別の端末で見るなら、スクリーンショットを残すか、上のハッシュをメモしてください。</p>
      </div>
    </section>
    ${howSection()}`;
}

/* ---------------- 結果と検証 ---------------- */
async function renderResult(d, announcedInput) {
  const seen = seenAnnouncement(String(d.commit).toLowerCase());
  const announced = announcedInput ?? (seen ? d.commit : '');
  const v = await verifyResult(d, { announcedCommit: announced });
  state.verification = v;
  const res = v.result;
  const verdictText = {
    ok: ['確かめられました', '封の中身・告知のハッシュ・当選者が、すべて計算どおりです。'],
    partial: ['計算は合っています。あと1つ確認を', '告知で見たハッシュと照合すると、確認が完了します。'],
    fail: ['おかしな点があります', '下の ✕ の項目を見てください。この結果は信用できません。'],
  }[v.verdict];
  const mark = { ok: '✓', fail: '✕', unknown: '?' };

  view.innerHTML = `
    <section class="panel">
      <div class="eyebrow">抽選の結果</div>
      <h1 class="title">${esc(d.title || '(名前なし)')}</h1>
      <div class="verdict verdict-${v.verdict}">
        <span class="verdict-mark" aria-hidden="true">${{ ok: '✓', partial: '?', fail: '✕' }[v.verdict]}</span>
        <div><strong>${verdictText[0]}</strong><p>${verdictText[1]}</p></div>
      </div>

      ${
        res
          ? `<h2 class="h-sub">当選者${res.everyoneWins ? '<small>(応募が当選人数以下なので全員)</small>' : ''}</h2>
             <ol class="winners">${res.winners.map((n, i) => `<li><span class="rank">${i + 1}</span><span class="name">${esc(n)}</span></li>`).join('')}</ol>
             <p class="hint">応募 ${res.names.length} 人から ${res.winners.length} 人。順位は選ばれた順です。</p>`
          : ''
      }
    </section>

    <section class="panel">
      <h2>告知のハッシュと照合する</h2>
      ${hashBlock(String(d.commit).toLowerCase(), 'この結果に書かれたハッシュ')}
      ${seen && announcedInput == null ? `<p class="good">この端末で ${esc(new Date(seen.at).toLocaleString('ja-JP'))} に見た告知のハッシュと一致しました。</p>` : ''}
      <form id="announceForm" class="form inline">
        <label>あなたが告知で見たハッシュ<input name="announced" value="${esc(announcedInput ?? '')}" placeholder="64桁。最初の8桁だけでも大まかに比べられます" autocomplete="off" spellcheck="false" /></label>
        <button class="btn" type="submit">照合</button>
      </form>
      <p class="hint">大事なのは「結果URLの中のハッシュ」ではなく「締め切り前に告知されたハッシュ」です。主催者は結果URLを丸ごと作り直せるからです。</p>
      <ul class="checks">
        ${v.checks.map((c) => `<li class="check check-${c.status}"><span class="check-mark">${mark[c.status]}</span><div><b>${esc(c.label)}</b><p>${esc(c.detail)}</p></div></li>`).join('')}
      </ul>
    </section>

    ${
      res
        ? `<section class="panel">
      <h2>名簿に自分の名前があるか</h2>
      <p>名前が消されていないかは、本人にしか確かめられません。</p>
      <input id="findName" class="search" placeholder="名前を入れる" autocomplete="off" />
      <div id="findOut" class="hint"></div>
      <details class="detail"><summary>名簿の全員(${res.names.length}人)</summary><ol class="roster">${res.names.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>
      <p class="hint">名簿のハッシュ: <code>${esc(res.digest)}</code></p></details>
    </section>

    <section class="panel">
      <h2>計算の手順を見る</h2>
      <p>このページが表示している当選者は、下の計算をこのブラウザでやり直した結果です。</p>
      <div class="trace">
        <div class="trace-row"><span class="trace-k">封筒の中身</span><code class="wrap">${esc(v.envelope)}</code></div>
        <div class="trace-row"><span class="trace-k">その SHA-256</span><code class="wrap">${esc(v.recomputedCommit)}</code></div>
        <div class="trace-row"><span class="trace-k">名簿の SHA-256</span><code class="wrap">${esc(res.digest)}</code></div>
      </div>
      <div class="table-wrap"><table class="draws">
        <thead><tr><th>回</th><th>残り</th><th>乱数(32ビット)</th><th>捨てた値</th><th>余り</th><th>選ばれた人</th></tr></thead>
        <tbody>${res.trace
          .slice(0, 200)
          .map(
            (t) => `<tr><td>${t.round}</td><td>${t.remaining}人</td><td><code>${t.value.toLocaleString()}</code></td><td>${t.rejected.length ? t.rejected.map((x) => `<code>${x.toLocaleString()}</code>`).join(' ') : '—'}</td><td>${t.index}</td><td>${esc(t.picked)}</td></tr>`,
          )
          .join('')}</tbody>
      </table></div>
      <p class="hint">「余り」は 乱数 ÷ 残りの人数 の余りで、整えた名簿のうちまだ選ばれていない人の並びの何番目(0から数える)かを表します。上限 2<sup>32</sup> − (2<sup>32</sup> mod 残り) 以上の乱数が出たら捨てて引き直します。</p>
    </section>

    <section class="panel">
      <h2>このページを信じずに確かめる</h2>
      <p>主催者が細工したページかもしれない、と思ったら、別の道具で計算してください。</p>
      <h3 class="h-sub">封筒の指紋だけなら、ターミナルで</h3>
      <pre class="code">printf %s '${esc(v.envelope)}' | shasum -a 256</pre>
      <button class="link" data-copy="${esc(`printf %s '${v.envelope}' | shasum -a 256`)}">コマンドをコピー</button>
      <h3 class="h-sub">当選者まで、独立した検証スクリプトで(Node 20+)</h3>
      <p class="hint">アプリ本体のコードを使わず、公開した手順だけから書いた1ファイルです(依存なし・約70行)。中身を読んでから使ってください。</p>
      <pre class="code">node verify.mjs '${esc(location.href)}'</pre>
      <div class="actions">
        <button class="btn ghost small" id="dlScript">verify.mjs を保存</button>
        <button class="btn ghost small" data-copy="${esc(`node verify.mjs '${location.href}'`)}">コマンドをコピー</button>
      </div>
      <details class="detail"><summary>スクリプトの中身を見る</summary><pre class="code small">${esc(verifyScript)}</pre></details>
    </section>

    <section class="panel">
      <h2>結果を伝える</h2>
      <div class="actions">
        <button class="btn primary" data-copy="${esc(location.href)}" data-label="結果のURLをコピーしました">結果のURLをコピー</button>
      </div>
    </section>`
        : ''
    }
    ${risksSection(res)}`;

  $('#announceForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const val = new FormData(e.target).get('announced').trim();
    renderResult(d, val);
  });
  const find = $('#findName');
  if (find && res) {
    find.addEventListener('input', () => {
      const q = find.value.normalize('NFC').replace(/[\s　]+/gu, ' ').trim();
      const out = $('#findOut');
      if (!q) return (out.textContent = '');
      const exact = res.names.includes(q);
      const rank = res.winners.indexOf(q);
      const partial = res.names.filter((n) => n.includes(q)).slice(0, 8);
      out.innerHTML = exact
        ? `<span class="good">「${esc(q)}」は名簿にあります${rank >= 0 ? ` — <b>${rank + 1}位で当選</b>` : '(落選)'}。</span>`
        : partial.length
          ? `完全に同じ名前はありません。近い名前: ${partial.map(esc).join('、')}`
          : `<span class="bad">「${esc(q)}」は名簿にありません。</span>`;
    });
  }
  $('#dlScript')?.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([verifyScript], { type: 'text/javascript' }));
    a.download = 'verify.mjs';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

/* ---------------- ルーティング ---------------- */
async function route() {
  const frag = location.hash.slice(1);
  if (!frag || frag === 'how' || frag === 'risks') {
    state.kind = 'home';
    state.data = null;
    if (!$('.hero')) renderHome();
    if (frag) $(`#${frag}`)?.scrollIntoView({ behavior: 'smooth' });
    else window.scrollTo({ top: 0 });
    return;
  }
  const s = await decodeState(frag);
  window.scrollTo({ top: 0 });
  if (!s) {
    state.kind = 'broken';
    view.innerHTML = `<section class="panel"><h1 class="title">このURLは読めませんでした</h1><p>途中で切れているか、書き換えられている可能性があります。主催者にURLをもう一度送ってもらってください。</p><a class="btn" href="/#">はじめに戻る</a></section>`;
    return;
  }
  state.kind = { a: 'announce', o: 'organizer', r: 'result' }[s.kind];
  state.data = s.data;
  if (s.kind === 'a') renderAnnounce(s.data);
  else if (s.kind === 'o') await renderOrganizer(s.data);
  else await renderResult(s.data);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]');
  if (b) copy(b.dataset.copy, b.dataset.label);
});
window.addEventListener('hashchange', () => route().then(() => (state.ready = true)));

/** 見本: 封をする → 告知を見る(この端末に記録) → 名簿を入れて開く、を一気に行う */
async function demo({ seed } = {}) {
  const d = { title: '見本: 読書会のプレゼント抽選', winners: 2, deadline: '', seed: seed ?? randomSeed() };
  const commit = await commitmentOf(d.winners, d.seed);
  rememberAnnouncement({ commit, title: d.title });
  const roster = ['佐藤 花子', '鈴木 一郎', '高橋 健', '田中 美咲', '伊藤 翔', '渡辺 さくら', '山本 大輝'];
  const frag = await closeLottery(d, roster.join('\n'));
  toast('見本のくじを作りました(告知はこの端末で見たことにしています)');
  return frag;
}

// ヘッドレス検証用
window.__app = {
  state,
  lib: { draw, verifyResult, commitmentOf, envelope, encodeState, decodeState, canonicalRoster, sha256Hex, randomSeed },
  demo,
  createLottery,
  closeLottery: async (rosterText) => closeLottery(state.data, rosterText),
  route,
};

route().then(() => (state.ready = true));
