# See what obd2-mcp returns / 実行結果で見るobd2-mcp

**No vehicle or AI subscription is needed for this demo.** The included MCP client reads a simulated vehicle and prints the tool responses. It does not generate an AI diagnosis.

**車もAIの契約も不要です。** 付属のMCPクライアントで模擬車両を読み、ツールの応答を表示します。AIによる診断文を生成するデモではありません。

## Run it / 実行する

With Node.js 22 or 24 and npm, run the release package directly. Git and a build are not needed:

```bash
npm exec --yes --package=https://github.com/shoka-jp/obd2-mcp/releases/download/v0.6.2/obd2-mcp-0.6.2.tgz -- obd2-mcp --demo --summary
```

The demo explicitly selects mock mode, calls six read-only tools, and displays a short summary. It never calls `clear_dtcs`. Add `--lang ja` for the Japanese summary, `--scenario cleared` (or another [mock scenario](../README.md#try-another-mock-scenario)) for a different simulated car, or remove `--summary` for the complete JSON responses. From a source checkout, `npm run demo` and `npm run demo:ja` do the same after building.

Node.js 22または24とnpmがあれば、Gitやビルドなしでリリースパッケージを直接実行できます。日本語で表示するには次を実行します。

```bash
npm exec --yes --package=https://github.com/shoka-jp/obd2-mcp/releases/download/v0.6.2/obd2-mcp-0.6.2.tgz -- obd2-mcp --demo --summary --lang ja
```

デモはモックを明示指定して6つの読み取りツールを呼び、要約と次の確認手順を表示します。コード消去は行いません。`--scenario cleared` などで別の模擬シナリオを選べます。`--summary` を外すとすべてのJSON応答を確認できます。ソースから実行する場合は、ビルド後に `npm run demo`・`npm run demo:ja` で同じ結果を確認できます。

The summary explains the example P0420 code and suggests preserving the data for a technician; it cannot identify a failed part. Its code description can be checked against [Ford's OBD system operation summary](https://www.fordservicecontent.com/Ford_Content/catalog/motorcraft/OBD_Operation_Summary_to_Gasoline_MY_2024_2025.pdf). The Japanese summary is available with `--lang ja`.

## Observed output / 実際に取得した結果

Captured on 2026-10-29 using Node.js 24.22.1, the source build, and the MCP SDK client on Linux. The mock vehicle's default scenario has not changed since; later releases add other scenarios, tools and sensors. This is real program output from **simulated data**, not a real-car test or a screenshot of an AI conversation. The table selects fields from the responses; use the JSON command above for complete responses.

| Tool | Selected result / 結果の抜粋 |
| --- | --- |
| `connection_status` | connected: true; adapter: ELM327 v1.5 (obd2-mcp mock); simulated: true |
| `read_dtcs` | stored_dtcs: ["P0420"]; pending_dtcs: []; mil_on: true; dtc_count: 1 |
| `read_freeze_frame` | dtc: P0420; speed: 98 km/h; rpm: 2210; coolant: 88 °C |
| `read_live_data` | speed: 0 km/h; rpm: 740; coolant: 89 °C |

This makes the distinction between conditions recorded when a code was set and the current readings visible. A code and these readings alone do not establish a failed component.

故障コードが記録されたときの状態と、現在の読み取り値の違いを確認できます。このコードと数値だけで故障部品が確定するわけではありません。

## Try it with an AI assistant / AIと組み合わせる

Follow the [client setup guide](./try-mock.md) (Claude Desktop extension, `npx` or source), then ask, or use the `check_engine_light` guided prompt:

> Read the mock vehicle's trouble codes, freeze frame, and live data. Separate observations from hypotheses and list what still needs verification. Do not clear codes.

> モック車両の故障コード・フリーズフレーム・ライブデータを読み、観測した事実と仮説を分けて、不足している確認事項を整理して。コードは消去しないで。

## Help shape the next improvement / 改善に参加する

Did the demo run on your setup? If you hit a problem, [report it](https://github.com/shoka-jp/obd2-mcp/issues/new?template=bug_report.md) with your Node.js version, OS, exact steps, and sanitized error output. Tried a real adapter? Use the [real setup report](https://github.com/shoka-jp/obd2-mcp/issues/new?template=hardware-report.yml). Documentation corrections are welcome through the [contribution guide](../CONTRIBUTING.md).

実行できなかった場合は、Node.jsのバージョン・OS・再現手順・個人情報を除いたエラーをIssueで共有してください。説明の修正も歓迎します。

[Follow the developer / 開発者をフォロー](https://github.com/shoka-jp) · [Support the open-source work / 開発を支援](https://github.com/sponsors/shoka-jp)
