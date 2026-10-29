# Try vehicle diagnostics without a car / 車なしで試す診断デモ

This walkthrough uses simulated data, not a real vehicle. AI wording varies; the goal is to inspect tool output and distinguish observations from hypotheses.

## Setup

You need Node.js 18 or later (per the package requirements), npm/npx, and Claude Code. Follow the main [README](../README.md) for Claude Desktop configuration instead.

Register an explicitly simulated connection:

```bash
claude mcp add obd2 --env OBD2MCP_CONNECTION=mock -- npx -y obd2-mcp
```

If a server named obd2 is already registered, inspect its configuration before changing it. Confirm the connection is mock before proceeding.

## Three prompts

1. "Use connection_status and read_dtcs on the mock vehicle. Show the tool results separately from your interpretation."
2. "Read the freeze frame and live data. Which observations could help investigate the stored code, and which information is still missing?"
3. "Summarize the observations, possible explanations, and what would need verification on a real vehicle. Do not clear any codes."

The documented mock scenario is a warm idling sedan with a stored P0420 and the malfunction indicator on. A successful demo means the tools return simulated diagnostic data. It does not establish the cause of a real fault or prove adapter compatibility.

## If it does not work

Check Node.js/npx availability and that the client can start the MCP server. Include the package version, client, OS, exact reproduction steps, and sanitized error output in a [bug report](https://github.com/shoka-jp/obd2-mcp/issues/new?template=bug_report.md). Never post VINs or credentials.

## 日本語

Node.js 18以上、npm/npx、Claude Codeを用意し、上のコマンドで明示的にモック接続を登録します。同名の登録がある場合は既存設定を確認してください。

次の順番で質問します。

1. 「モック車両に対してconnection_statusとread_dtcsを実行し、ツールの出力と解釈を分けて表示して」
2. 「フリーズフレームとライブデータを読み、原因を調べる材料と、まだ不足している情報を整理して」
3. 「観測した事実・原因の仮説・実車なら確認が必要な点をまとめて。コードは消去しないで」

モックは暖機済みのセダンで、P0420が記録され警告灯が点いた想定です。模擬データの取得を体験するもので、実車の故障原因やアダプタの適合を証明するものではありません。

## Next steps / 次にできること

- Explore [automotive-ai-skills](https://github.com/shoka-jp/automotive-ai-skills) for structured investigation workflows.
- [Follow shoka](https://github.com/shoka-jp) or [support the projects](https://github.com/sponsors/shoka-jp).
- Share what worked and where you got stuck through an issue. 試せた環境や詰まった手順をIssueで教えてください。
