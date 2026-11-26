# Security and vehicle-safety policy / セキュリティと車両の安全に関する方針

[English](#english) | [日本語](#日本語)

## English

obd2-mcp lets an AI assistant send commands to a vehicle through an ELM327 adapter. Problems that could change a vehicle's state, mislead someone about a vehicle's condition, or expose identifying data deserve private handling first.

### Supported versions

Fixes are made on `main` and shipped in the next release. Please use the [latest release](https://github.com/shoka-jp/obd2-mcp/releases/latest).

### Report privately

Use [GitHub private vulnerability reporting](https://github.com/shoka-jp/obd2-mcp/security/advisories/new) for anything in the list below. Please do not open a public issue for it. Include the affected version, the connection type (mock, serial or tcp), steps to reproduce (with the mock vehicle where possible), and the impact you expect.

In scope:

- **Vehicle commands without the documented safeguards** — any way to send mode 04 (clear codes) or any command other than the documented read-only requests without `OBD2MCP_ENABLE_CLEAR=1`, `confirm=true` and the user's form confirmation, including through tool arguments, connection settings or prompts.
- **Misleading results** — a crafted adapter or vehicle response that makes the server report missing, failed or unknown data as a clean or complete result.
- **Prompt injection through tool output** — adapter-controlled text (such as the `ATI` identity or error messages) that can instruct the AI client to take actions the user did not ask for.
- **Identifying data exposure** — the VIN, serial numbers or other identifiers appearing where the documentation says they are omitted (for example `read_diagnostic_report` or `list_serial_ports`).
- **Supply chain** — tampering with release assets (`.tgz`, `.mcpb`, `SHA256SUMS`), workflows or bundled dependencies.

Out of scope (use a public issue): ordinary bugs, documentation errors, adapter or vehicle compatibility (use the [real setup report](https://github.com/shoka-jp/obd2-mcp/issues/new?template=hardware-report.yml)), and the inherent limits described in the README's safety section.

### Please keep testing safe

Never test on a moving vehicle or on a vehicle you are not responsible for. Prefer the mock vehicle to demonstrate a problem. Leave the VIN, licence plate and personal details out of reports.

This project is maintained by one person on a best-effort basis. Reports are acknowledged and fixed as quickly as possible, with credit for the reporter if wanted.

## 日本語

obd2-mcpは、AIアシスタントがELM327アダプタ経由で車両にコマンドを送るためのツールです。車両の状態を変える、車両の状態を誤って伝える、個人や車両を特定できる情報が漏れる、といった問題は、まず非公開で扱います。

### 対象バージョン

修正は `main` に反映し、次のリリースで提供します。[最新リリース](https://github.com/shoka-jp/obd2-mcp/releases/latest)をお使いください。

### 非公開で報告する

以下に当てはまるものは、公開Issueではなく[GitHubの非公開脆弱性報告](https://github.com/shoka-jp/obd2-mcp/security/advisories/new)から報告してください。影響するバージョン、接続方法（mock・serial・tcp）、再現手順（できれば模擬車両で）、想定される影響を記載してください。

対象：

- **安全装置を通らない車両コマンド** — `OBD2MCP_ENABLE_CLEAR=1`、`confirm=true`、利用者のフォーム確認を経ずに、モード04（コード消去）や、文書化された読み取り以外のコマンドを送れる方法。ツール引数、接続設定、プロンプト経由を含みます。
- **誤解を招く結果** — 細工したアダプタや車両の応答で、取得できない・失敗した・不明なデータが「異常なし」や「すべて取得済み」として報告される問題。
- **ツール出力経由のプロンプトインジェクション** — アダプタが返す文字列（`ATI` の識別情報やエラーメッセージなど）で、利用者が求めていない操作をAIに指示できる問題。
- **識別情報の露出** — 文書で除外するとしている車台番号・シリアル番号などの識別情報が出力に含まれる問題（`read_diagnostic_report` や `list_serial_ports` など）。
- **サプライチェーン** — リリース資産（`.tgz`・`.mcpb`・`SHA256SUMS`）、ワークフロー、同梱する依存パッケージの改ざん。

対象外（公開Issueへ）：通常の不具合、説明の誤り、アダプタや車両との相性（[実機での動作報告](https://github.com/shoka-jp/obd2-mcp/issues/new?template=hardware-report.yml)へ）、READMEの安全設計に書かれている本来の制限。

### 安全に試してください

走行中の車両や、自分が責任を持てない車両では試さないでください。問題の再現には、できるだけ模擬車両を使ってください。車台番号・ナンバー・個人情報は報告に含めないでください。

このプロジェクトは1人で、できる範囲で運営しています。報告にはできるだけ早く対応し、希望があれば報告者のクレジットを記載します。
