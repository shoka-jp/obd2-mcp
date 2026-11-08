# Contributing to obd2-mcp

English and Japanese reports and contributions are welcome.

## Find a first task

Browse [open good first issues](https://github.com/shoka-jp/obd2-mcp/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22); each describes the goal and how to check the result. Leave a note on an issue before starting so others can avoid duplicating the work. Questions, reports and pull requests are welcome in English or Japanese. Many documentation and mock-based test tasks do not require a car or an AI account; check each issue for its requirements.

## Start small

- Improve setup instructions or Japanese/English documentation.
- Report a reproducible parsing or connection problem.
- Add a focused regression test for an observed bug.
- Discuss new protocols or hardware support in an issue before a large change.

## Development

1. Fork the repository and create a branch.
2. Install dependencies with `npm ci`.
3. Make one focused change.
4. Run `npm test` (build and mock-vehicle smoke test).
5. Open a pull request explaining the problem, the change, and validation.

For packaging or installation changes, also run `npm run test:package`. This verifies a clean tarball and its mock demo after installation into a temporary consumer directory. See the [release checklist](./docs/releasing.md).

Use the mock vehicle for development. Clearly distinguish mock results from real-hardware results. Include adapter and OS details for hardware-specific changes; never claim compatibility you have not tested.

Keep English and Japanese user-facing instructions aligned. Do not include VINs, credentials, or personal information in fixtures or logs.

Preserve explicit confirmation for clearing diagnostic codes. Avoid changes that silently erase diagnostic evidence.

## Issue and pull request workflow

1. **Open a focused issue when useful.** Search existing issues first. For a bug, use the [bug report](https://github.com/shoka-jp/obd2-mcp/issues/new?template=bug_report.md): describe actual and expected behavior, safe reproduction steps and the relevant environment, or say what is unknown. For an idea, use the [improvement proposal](https://github.com/shoka-jp/obd2-mcp/issues/new?template=feature-request.yml) to explain the problem and desired outcome; an implementation idea and acceptance criteria are helpful but optional. Small fixes may start with a PR; discuss larger, safety-sensitive or breaking changes in an issue first. Maintainers use `good first issue` for small tasks with clear prerequisites and completion criteria, and `help wanted` when outside help is welcome.
2. **Protect privacy.** Issues and PRs are public. Remove VINs, license plates, credentials, private network addresses, names, contact details and identifying documents from text, screenshots and logs. Do not reproduce unsafe conditions to collect evidence.
3. **Open a focused PR against `main`.** A concise title such as `fix: handle an empty response` is helpful; Japanese titles are welcome. Explain the problem, change, related issue, verification results and remaining risks in the PR template. Reference an issue with `#123`; use `Closes #123` only if the PR completes the whole issue. GitHub may close it when a PR targeting the default branch is merged if automatic closing is enabled. Use a plain reference for partial work.
4. **Verify and describe limits.** For code changes, run `npm test`; for packaging or install changes, also run `npm run test:package`. For documentation-only changes, check the affected links and state if code tests were not run. Distinguish mock results from hardware tests and preserve code-clearing confirmation. Record commands and actual results, and explain checks not run or blocked. Disclose material AI assistance and external sources where applicable; the contributor remains responsible for the content.
5. **Review before merge.** A maintainer checks scope, verification, relevant CI, safety/privacy and unresolved feedback. Investigate failing checks; if an infrastructure issue prevents a check, document the limitation and maintainer decision rather than marking it as passed. Draft PRs and questions are welcome.

## Issue・PRの進め方

1. **Issueは１件につき１つの課題を目安に。** 既存Issueを確認し、不具合は[不具合報告](https://github.com/shoka-jp/obd2-mcp/issues/new?template=bug_report.md)へ、実際の動作・期待・安全な再現手順・環境を書きます。不明な点は「不明」で大丈夫です。改善提案は[機能・改善の提案](https://github.com/shoka-jp/obd2-mcp/issues/new?template=feature-request.yml)へ、困りごとと期待する結果を記載します。実装案・完了条件は任意です。小さな修正はIssueなしでPRを開けます。大きな変更や安全に関わる変更は先に相談してください。 メンテナーは、前提と完了条件が明確な小さな課題に `good first issue`、協力を募集する課題に `help wanted` を付けます。
2. **個人情報を載せない。** IssueとPRは公開されます。車台番号、ナンバー、認証情報、非公開ネットワークアドレス、氏名・連絡先や識別できる書類は、画像やログからも取り除いてください。危険な状態を実車で再現しないでください。
3. **PRを小さく作る。** `main` 向けに作成し、背景・変更・関連Issue・検証結果・未確認事項をテンプレートに記載します。タイトルは短く具体的にし、`fix:` や `docs:` の接頭辞を使えます。日本語でも歓迎します。関連Issueは `#123` と参照でき、全体を解決する場合のみ `Closes #123` を使います。自動クローズが有効なら、既定ブランチ向けPRのマージ時に閉じられます。部分対応は番号だけを参照してください。
4. **検証と限界を記載。** コード変更では `npm test`、配布・導入の変更では `npm run test:package` も実行します。文書のみならリンクを確認し、コードテストを省いた理由を記載します。モックと実機の結果を区別し、コード消去の確認手順を維持してください。実行したコマンドと結果、未実施・実行できなかった理由を正直に記載します。AI支援や外部資料を実質的に利用した場合はその旨も書き、内容の正確さは投稿者が確認してください。
5. **マージ前に確認。** メンテナーは範囲、検証、関連CI、安全・個人情報、未解決の指摘を確認します。失敗した検証は調査し、環境要因で実行できない場合は合格扱いにせず、制約と判断を記録します。下書きPRや質問も歓迎します。

## Share feedback or edit in your browser

You can [share a question or first-use feedback](https://github.com/shoka-jp/obd2-mcp/issues/new?template=first-experience.yml) without writing code. Submitting opens a public GitHub issue and requires a GitHub account; remove identifying details before posting.

For a small documentation fix without installing Git:

1. Sign in to GitHub, open the file and select the pencil icon. If prompted, create a fork.
2. Edit and preview the change, then choose **Propose changes**.
3. Create a pull request with what changed and how you checked it. Questions are welcome if you get stuck.

## ブラウザーだけで参加する

コードを書かなくても、[初めて使った感想や質問](https://github.com/shoka-jp/obd2-mcp/issues/new?template=first-experience.yml)を送れます。送信にはGitHubアカウントが必要で、Issueは公開されます。車台番号や個人情報は書かないでください。

小さな文章の修正はGitのインストールなしでも提案できます。GitHubでファイルを開き、鉛筆アイコンを押し、案内に沿ってフォークします。修正・プレビュー後に変更を提案し、変更内容と確認したことを書いてプルリクエストを作成してください。

## 日本語

[初めての方向けIssue](https://github.com/shoka-jp/obd2-mcp/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22)から、目的と確認方法を見て選べます。作業の重複を避けるため、着手前にIssueへ一言コメントしてください。質問・報告・PRは日本語でも歓迎します。車やAIアカウントを使わずにできるドキュメントやモックのテストもあります。詳しくは各Issueをご確認ください。

配布・導入に関わる変更では `npm run test:package` も実行してください。ビルド前のソースから作った配布物を、一時ディレクトリへインストールして検証します。[公開前チェックリスト](./docs/releasing.md)も参照してください。

小さなドキュメント修正や、再現手順つきの不具合報告から歓迎します。開発時はモック車両を利用し、`npm ci` → 修正 → `npm test` の順で確認してください。PRには変更理由と検証結果を記載し、実車で未検証の対応を保証しないでください。利用者向けの説明は英日で揃え、ログやテストデータから個人情報を除いてください。
