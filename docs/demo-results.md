# See what obd2-mcp returns / 実行結果で見るobd2-mcp

**No vehicle or AI subscription is needed for this demo.** The included MCP client reads a simulated vehicle and prints the tool responses. It does not generate an AI diagnosis.

**車もAIの契約も不要です。** 付属のMCPクライアントで模擬車両を読み、ツールの応答を表示します。AIによる診断文を生成するデモではありません。

## Run it / 実行する

Install Git and Node.js/npm, then run:

```bash
git clone https://github.com/shoka-jp/obd2-mcp.git
cd obd2-mcp
npm ci
npm run demo
```

The demo builds the source, explicitly selects mock mode, reads four tools, and closes the connection. It never calls `clear_dtcs`. If you already cloned the project, update your checkout before running.

デモはソースをビルドし、モックを明示指定して4つの読み取りツールを呼んだ後に終了します。コード消去は行いません。すでにクローン済みの場合は最新の変更を取得してください。

## Observed output / 実際に取得した結果

Captured on 2026-10-29 using Node.js 24.22.1, the source build, and the MCP SDK client on Linux. This is real program output from **simulated data**, not a real-car test or a screenshot of an AI conversation. The table selects fields from the responses; the script prints the complete responses.

| Tool | Selected result / 結果の抜粋 |
| --- | --- |
| `connection_status` | connected: true; adapter: ELM327 v1.5 (obd2-mcp mock); simulated: true |
| `read_dtcs` | stored_dtcs: ["P0420"]; pending_dtcs: []; mil_on: true; dtc_count: 1 |
| `read_freeze_frame` | dtc: P0420; speed: 98 km/h; rpm: 2210; coolant: 88 °C |
| `read_live_data` | speed: 0 km/h; rpm: 740; coolant: 89 °C |

This makes the distinction between conditions recorded when a code was set and the current readings visible. A code and these readings alone do not establish a failed component.

故障コードが記録されたときの状態と、現在の読み取り値の違いを確認できます。このコードと数値だけで故障部品が確定するわけではありません。

## Try it with an AI assistant / AIと組み合わせる

Follow the [client setup guide](./try-mock.md), then ask:

> Read the mock vehicle's trouble codes, freeze frame, and live data. Separate observations from hypotheses and list what still needs verification. Do not clear codes.

> モック車両の故障コード・フリーズフレーム・ライブデータを読み、観測した事実と仮説を分けて、不足している確認事項を整理して。コードは消去しないで。

## Help shape the next improvement / 改善に参加する

Did the demo run on your setup? If you hit a problem, [report it](https://github.com/shoka-jp/obd2-mcp/issues/new?template=bug_report.md) with your Node.js version, OS, exact steps, and sanitized error output. Documentation corrections are welcome through the [contribution guide](../CONTRIBUTING.md).

実行できなかった場合は、Node.jsのバージョン・OS・再現手順・個人情報を除いたエラーをIssueで共有してください。説明の修正も歓迎します。

[Follow the developer / 開発者をフォロー](https://github.com/shoka-jp) · [Support the open-source work / 開発を支援](https://github.com/sponsors/shoka-jp)
