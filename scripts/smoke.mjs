// ヘッドレスで一通り確かめる: node scripts/smoke.mjs [URL] [スクショ保存先]
// 封をする → 告知を見る → 名簿を入れて開く → 検証が ok、改ざんした結果URLが fail になること
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5930/';
const shots = process.argv[3];
const browser = await chromium.launch();
const errors = [];
const assert = (cond, msg) => {
  if (!cond) throw new Error(`NG: ${msg}`);
  console.log(`ok: ${msg}`);
};

for (const width of [1200, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base);
  await page.waitForFunction(() => window.__app?.state.ready);
  if (shots) await page.screenshot({ path: `${shots}/home-${width}.png`, fullPage: true });

  // 主催者: フォームから作る
  await page.fill('input[name=title]', 'テストの抽選');
  await page.fill('input[name=winners]', '2');
  await page.click('#createForm button[type=submit]');
  await page.waitForFunction(() => window.__app.state.kind === 'organizer');
  const post = await page.textContent('pre.post');
  const announceUrl = post.trim().split('\n').pop();
  const commit = /種のハッシュ: ([0-9a-f]{64})/.exec(post)[1];
  if (shots) await page.screenshot({ path: `${shots}/organizer-${width}.png`, fullPage: true });

  // 参加者: 告知を開く(この端末に記録される)
  const p2 = await ctx.newPage();
  await p2.goto(announceUrl);
  await p2.waitForFunction(() => window.__app?.state.kind === 'announce');
  assert((await p2.textContent('.hash')).replace(/\s/g, '') === commit, `[${width}] 告知ページにハッシュ`);
  if (shots) await p2.screenshot({ path: `${shots}/announce-${width}.png`, fullPage: true });

  // 主催者: 名簿を入れて開く(重複があると押せない)
  await page.fill('#closeForm textarea', '佐藤\n鈴木\n佐藤');
  assert(await page.isDisabled('#openBtn'), `[${width}] 重複があると開けない`);
  await page.fill('#closeForm textarea', '佐藤\n鈴木\n高橋\n田中\n伊藤');
  await page.click('#openBtn');
  await page.waitForFunction(() => window.__app.state.kind === 'result' && document.querySelector('.verdict'));
  const resultUrl = page.url();

  // 参加者が同じ端末で結果を開くと、告知と自動照合されて ok
  await p2.goto(resultUrl);
  await p2.waitForFunction(() => window.__app?.state.verification);
  assert((await p2.getAttribute('.verdict', 'class')).includes('verdict-ok'), `[${width}] 告知を見た端末では ok`);
  assert((await p2.$$('.winners li')).length === 2, `[${width}] 当選者2人`);
  await p2.fill('#findName', '佐藤');
  assert((await p2.textContent('#findOut')).includes('名簿にあります'), `[${width}] 名前検索`);
  if (shots) await p2.screenshot({ path: `${shots}/result-${width}.png`, fullPage: true });

  // 告知を見ていない端末では partial、手でハッシュを入れると ok、違うハッシュなら fail
  const ctx2 = await browser.newContext({ viewport: { width, height: 900 } });
  const p3 = await ctx2.newPage();
  p3.on('pageerror', (e) => errors.push(e.message));
  await p3.goto(resultUrl);
  await p3.waitForFunction(() => window.__app?.state.verification);
  assert(await p3.evaluate(() => window.__app.state.verification.verdict) === 'partial', `[${width}] 告知なしは partial`);
  await p3.fill('input[name=announced]', commit);
  await p3.click('#announceForm button');
  await p3.waitForFunction(() => window.__app.state.verification.verdict === 'ok');
  assert(true, `[${width}] ハッシュを手で入れると ok`);

  // 改ざん: 種を差し替えた結果URL
  const forged = await p3.evaluate(async (url) => {
    const { decodeState, encodeState } = window.__app.lib;
    const s = await decodeState(url);
    s.data.seed = 'cd'.repeat(32);
    return `${location.origin}/#${await encodeState('r', s.data)}`;
  }, resultUrl);
  await p3.goto(forged);
  await p3.waitForFunction(() => window.__app?.state.verification);
  assert(await p3.evaluate(() => window.__app.state.verification.verdict) === 'fail', `[${width}] 種を差し替えると fail`);
  if (shots) await p3.screenshot({ path: `${shots}/forged-${width}.png`, fullPage: true });

  // 横スクロールが出ていない
  const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 0, `[${width}] 横はみ出しなし (${overflow})`);
  await ctx.close();
  await ctx2.close();
}
await browser.close();
assert(errors.length === 0, `コンソールエラーなし ${errors.join(' | ')}`);
