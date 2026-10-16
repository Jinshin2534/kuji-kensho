# SPEC — kuji-kensho

## 25. くじ検証 (`kuji-kensho`) — 道具×暗号
- **一行**: 抽選の結果を、主催者以外の誰でもあとから再計算して確かめられるくじ引きツール。
- **核**: 主催者は先に「種のハッシュ」だけを公開し、締め切り後に種を明かす。参加者名簿と種から結果が一意に決まるので、後からの差し替えは誰にでも見抜ける(コミットメント方式)。
- **正直さ**: 主催者が不正できる余地(種を選び直す・名簿をいじる)をUIで全部列挙し、どれがこの方式で防げて、どれが防げないかを書く。
- **技術**: Vite+素のJS / Web Crypto(SHA-256) / 抽選と検証は純粋関数。同じ入力からは同じ結果が出ることを、ブラウザでもNodeでもテストで固定する。
- **公開**: Vercel(状態はURLに埋め込み、サーバなし)
- **難所**: 偏りのない抽選(剰余による偏りを除く棄却サンプリング)。結果を一般の人に納得させる説明。

---

# 共通ルール(アプリ20本量産フェーズ)

- **規模**: 1〜2日で「公開まで」行ける範囲に絞る。上の仕様で一点突破し、機能を足さない。
- **作風**: 一点突破のコンセプト / ブラウザ内で完結(サーバ不要) / カメラ・センサー・数理を使った遊び心 / 「正直さ」を設計で守る(測れないときは測れないと言う、根拠と誤差を見せる) / 純粋ロジック+テスト。
- **構成(Webアプリ)**: Vite + 素のJS + pnpm。中核ロジックは `src/lib/` の純粋関数にして Vitest で固くテストし、配線・描画と分ける。`window.__app` を公開して、ヘッドレスでも検証できるようにする。
- **カメラ/マイク/センサー**: 実機がなくても検証できるよう、合成データやデモ入力で動くモードを用意する。
- **ポート**: 下に指定した番号を `strictPort` で固定する(既存アプリとの衝突回避)。
- **参考になる既存作**: `~/ranzo_project/` 配下(例: takibiban, otomon, uchikeshi, sokomi, shikisougi)。品質の基準はこれらに合わせる。
- **公開**: GitHub(public) `Jinshin2534/<slug>` を gh で作成して push。Webアプリは Vercel に GitHub 連携でデプロイする(push で自動デプロイ)。Vercel 向きでないもの(CLI等)は簡素なLPを GitHub Pages で公開する。
- **完了時**: 公開URLを確かめたうえで、メモリ `/Users/nokokoro/.claude/projects/-Users-nokokoro-ranzo-project/memory/` に `<slug>.md` を追加し、`MEMORY.md` に既存の行と同じ形式で1行追記する(公開URL・port・テスト数・ハマりどころ)。
- **コミット**: 末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` をつける。
- **仕様は確定済み**。細部は自分で判断して進め、ユーザーに聞くのは本当に決められないときだけにする。
- **このアプリのポート**: 5930
- **slug**: `kuji-kensho`

# リポジトリ構成と公開手順

- このワークツリーは `app-ideas` リポジトリのブランチ `kuji-kensho`。アプリはこのワークツリー直下に作る。
- main から引き継いだ `README.md` はこのアプリ用に書き換え、`IDEAS.md` は削除してよい(main 側には影響しない)。
- 公開用の GitHub リポジトリはアプリごとに別に作る:
  1. `gh repo create Jinshin2534/kuji-kensho --public`
  2. `git remote add kuji-kensho https://github.com/Jinshin2534/kuji-kensho.git`
  3. `git push kuji-kensho HEAD:main`(以後の更新も `git push kuji-kensho HEAD:main`)
- `app-ideas` 自体には push しない。リモート名はアプリの slug にして、ほかのアプリのリモートと混ぜない。
- Vercel は GitHub の `Jinshin2534/kuji-kensho` を連携し、main への push で自動デプロイされるようにする。
