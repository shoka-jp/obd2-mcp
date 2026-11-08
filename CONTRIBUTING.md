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
