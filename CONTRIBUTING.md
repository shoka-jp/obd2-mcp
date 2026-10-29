# Contributing to obd2-mcp

English and Japanese reports and contributions are welcome.

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

Use the mock vehicle for development. Clearly distinguish mock results from real-hardware results. Include adapter and OS details for hardware-specific changes; never claim compatibility you have not tested.

Keep English and Japanese user-facing instructions aligned. Do not include VINs, credentials, or personal information in fixtures or logs.

Preserve explicit confirmation for clearing diagnostic codes. Avoid changes that silently erase diagnostic evidence.

## 日本語

小さなドキュメント修正や、再現手順つきの不具合報告から歓迎します。開発時はモック車両を利用し、`npm ci` → 修正 → `npm test` の順で確認してください。PRには変更理由と検証結果を記載し、実車で未検証の対応を保証しないでください。利用者向けの説明は英日で揃え、ログやテストデータから個人情報を除いてください。
