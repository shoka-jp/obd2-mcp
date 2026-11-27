# Try vehicle diagnostics without a car / 車なしで試す診断デモ

This walkthrough uses simulated data, not a real vehicle. AI wording varies; the goal is to inspect tool output and distinguish observations from hypotheses.

## Run the standalone demo

No AI client, car, or adapter is required. With Node.js 22 or 24 and npm, run the release package directly, without Git:

```bash
npm exec --yes --package=https://github.com/shoka-jp/obd2-mcp/releases/download/v0.8.0/obd2-mcp-0.8.0.tgz -- obd2-mcp --demo --summary
npm exec --yes --package=https://github.com/shoka-jp/obd2-mcp/releases/download/v0.8.0/obd2-mcp-0.8.0.tgz -- obd2-mcp --demo --summary --lang ja
```

Or, from a source checkout (Git required):

```bash
git clone https://github.com/shoka-jp/obd2-mcp.git
cd obd2-mcp
npm ci
npm run demo
npm run demo:ja
```

`npm run demo` prints an English summary; `npm run demo:ja` prints a Japanese
summary. Both build the project and use simulated data. See the [captured mock
output](./demo-results.md) for an example. A successful run is not a diagnosis
and does not prove that a real vehicle or adapter is compatible.

## Optional: connect an MCP client

Every option starts with the simulated vehicle.

- **Claude Desktop:** download `obd2-mcp-0.8.0.mcpb` from the [v0.8.0 release](https://github.com/shoka-jp/obd2-mcp/releases/tag/v0.8.0) and open it with Claude Desktop. No terminal is needed.
- **Claude Code, without Git:** after running the demo above once (so npm has the package cached), register the same package:

  ```bash
  claude mcp add obd2 --env OBD2MCP_CONNECTION=mock -- npx -y --package=https://github.com/shoka-jp/obd2-mcp/releases/download/v0.8.0/obd2-mcp-0.8.0.tgz obd2-mcp
  ```

  On native Windows, put `cmd /c` before `npx`.
- **Claude Code, from the source checkout:** continue below.

From the same checkout:

```bash
npm run build
node -p "require('node:path').resolve('dist/index.js')"
```

Replace `/absolute/path/to/obd2-mcp/dist/index.js` below with the absolute path
printed by the last command. Windows JSON configuration can use forward
slashes. Follow the main [README](../README.md) for Claude Desktop configuration
instead.

Register an explicitly simulated connection:

```bash
claude mcp add obd2 --env OBD2MCP_CONNECTION=mock -- node "/absolute/path/to/obd2-mcp/dist/index.js"
```

If a server named obd2 is already registered, inspect its configuration before changing it. Confirm the connection is mock before proceeding.

## Three prompts

Or use the server's guided prompt `check_engine_light` (in Claude Code: `/mcp__obd2__check_engine_light`), which runs a similar sequence.

1. "Use connection_status and read_dtcs on the mock vehicle. Show the tool results separately from your interpretation."
2. "Read the freeze frame and live data. Which observations could help investigate the stored code, and which information is still missing?"
3. "Summarize the observations, possible explanations, and what would need verification on a real vehicle. Do not clear any codes."

The documented mock scenario is a warm idling sedan with a stored P0420 and the malfunction indicator on. A successful demo means the tools return simulated diagnostic data. It does not establish the cause of a real fault or prove adapter compatibility.

To explore other simulated cases, set `OBD2MCP_MOCK_SCENARIO` to `healthy`, `misfire`, `lean`, `evap`, `cleared`, or `partial` in the MCP server's environment and restart it. See [mock scenarios](../README.md#try-another-mock-scenario) for setup and limitations.

## If it does not work

Check Node.js availability and that the client can start the MCP server. For a real adapter, see [connection troubleshooting](./troubleshooting.md). Include the package version, client, OS, exact reproduction steps, and sanitized error output in a [bug report](https://github.com/shoka-jp/obd2-mcp/issues/new?template=bug_report.md). Never post VINs or credentials.

## 日本語

### AIクライアントなしで試す

AIクライアント・車・アダプターは不要です。Node.js 22または24とnpmがあれば、Gitを使わずにリリースパッケージを直接実行できます。

```bash
npm exec --yes --package=https://github.com/shoka-jp/obd2-mcp/releases/download/v0.8.0/obd2-mcp-0.8.0.tgz -- obd2-mcp --demo --summary --lang ja
```

ソースから実行する場合（Gitが必要）：

```bash
git clone https://github.com/shoka-jp/obd2-mcp.git
cd obd2-mcp
npm ci
npm run demo
npm run demo:ja
```

`npm run demo` は英語、`npm run demo:ja` は日本語の要約を表示します。どちらもビルド後に模擬データを使用します。[模擬出力の例](./demo-results.md)も参照できます。実行できても実車の故障診断や、車両・アダプターとの互換性を証明するものではありません。

### 次の選択肢：MCPクライアントにつなぐ

どの方法も最初は模擬車両で動きます。

- **Claude Desktop：** [v0.8.0リリース](https://github.com/shoka-jp/obd2-mcp/releases/tag/v0.8.0)から `obd2-mcp-0.8.0.mcpb` をダウンロードし、Claude Desktopで開きます。ターミナルは不要です。
- **Claude Code（Git不要）：** 上のデモを一度実行してパッケージをキャッシュしてから、同じパッケージを登録します。

  ```bash
  claude mcp add obd2 --env OBD2MCP_CONNECTION=mock -- npx -y --package=https://github.com/shoka-jp/obd2-mcp/releases/download/v0.8.0/obd2-mcp-0.8.0.tgz obd2-mcp
  ```

  Windows（WSLではない環境）では `npx` の前に `cmd /c` を付けます。
- **Claude Code（ソースから）：** 以下に進みます。

ソースから使う場合は、Claude Codeを用意し、同じフォルダーで次を実行します。最後に表示されるパスは、使用するパソコンやフォルダーによって異なります。

```bash
npm run build
node -p "require('node:path').resolve('dist/index.js')"
```

次の `/absolute/path/to/obd2-mcp/dist/index.js` を、最後に表示された絶対パスに置き換えて実行します。これは車両に接続しないモックの登録です。

```bash
claude mcp add obd2 --env OBD2MCP_CONNECTION=mock -- node "/absolute/path/to/obd2-mcp/dist/index.js"
```

同名の登録がある場合は既存設定を確認し、モック接続であることを確認してから進んでください。Claude Desktopを使う場合は[設定例](../README.ja.md)を参照してください。

次の順番で質問します。サーバーのガイド付きプロンプト `check_engine_light`（Claude Codeでは `/mcp__obd2__check_engine_light`）でも、同様の流れで確認できます。

1. 「モック車両に対してconnection_statusとread_dtcsを実行し、ツールの出力と解釈を分けて表示して」
2. 「フリーズフレームとライブデータを読み、原因を調べる材料と、まだ不足している情報を整理して」
3. 「観測した事実・原因の仮説・実車なら確認が必要な点をまとめて。コードは消去しないで」

モックは暖機済みのセダンで、P0420が記録され警告灯が点いた想定です。模擬データの取得を体験するもので、実車の故障原因やアダプタの適合を証明するものではありません。

別の模擬例を試すには、MCPサーバーの環境変数 `OBD2MCP_MOCK_SCENARIO` に `healthy`、`misfire`、`lean`、`evap`、`cleared`、`partial` のいずれかを設定し、再起動してください。設定方法と注意点は[日本語README](../README.ja.md)を参照してください。

## Next steps / 次にできること

- Explore [automotive-ai-skills](https://github.com/shoka-jp/automotive-ai-skills) for structured investigation workflows.
- [Follow shoka](https://github.com/shoka-jp) or [support the projects](https://github.com/sponsors/shoka-jp).
- Share what worked and where you got stuck through an issue. 試せた環境や詰まった手順をIssueで教えてください。
- Tried a real adapter? Use the [real setup report](https://github.com/shoka-jp/obd2-mcp/issues/new?template=hardware-report.yml). 実機で試した結果は[動作報告](https://github.com/shoka-jp/obd2-mcp/issues/new?template=hardware-report.yml)から送れます。
