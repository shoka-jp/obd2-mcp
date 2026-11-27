# Checking a used car with obd2-mcp / 中古車の現車確認に使う

[English](#english) | [日本語](#日本語)

This project has not yet verified a real vehicle or adapter combination. The example output below comes from the simulated vehicle. Results are observations, not a diagnosis, and a scan without trouble codes does not mean the car is in good condition.

## English

### When this helps

- **Before buying a used car.** Trouble codes can be cleared with a scan tool, or by disconnecting the battery, shortly before a viewing. The warning light then stays off for a while. Two things survive: **permanent trouble codes** (`read_permanent_dtcs`) stay until the car confirms the repair by itself, and **readiness monitors** stay incomplete until the car has been driven enough.
- **After a repair.** If a permanent code is still there after the workshop cleared the codes, the car has not yet confirmed the fix. This does not mean the repair failed; it usually clears by itself after normal driving.

### At the viewing

1. **Ask the seller for permission** to plug in an OBD-II adapter and read data. Only read; never clear codes on a car you do not own.
2. With the car **parked**, plug the ELM327 adapter into the OBD-II port, usually under the dashboard on the driver's side. Turn the ignition on, or let the engine idle outdoors.
3. In Claude Desktop, choose **used_car_check** from the obd2-mcp prompts in the attachment (+) menu. Optionally add what the seller said (for example "no warning lights, battery replaced last week") and your reply language.
4. Claude asks you to confirm permission and then reads the diagnostic report, the permanent codes, and, if supported, the distance driven with the warning light on and the engine run time. It gives a short summary first, then questions for the seller.
5. **After the test drive**, once parked, ask Claude to read again. A pending code that appears, or monitors that complete, are more evidence. One drive may not complete every monitor.
6. Take the questions to the seller, and let a professional pre-purchase inspection check what a scan cannot see.

### Try it first without a car

In the Claude Desktop extension settings, keep **Adapter connection** as `mock` and set **Mock scenario** to `cleared`. In other clients, set `OBD2MCP_MOCK_SCENARIO=cleared`. Then run the **used_car_check** prompt. Without an AI client, `obd2-mcp --demo --summary --scenario cleared` prints the same readings. The simulated car looks like this:

| Reading | Simulated value | What it suggests |
|---|---|---|
| Stored and pending codes | none, warning light off | Nothing active right now |
| Permanent codes | `P0420` | A catalyst-efficiency fault was detected and is not yet confirmed fixed |
| Readiness monitors | catalyst, evaporative system and oxygen sensor incomplete; others complete or not supported | Codes were cleared or the battery was disconnected recently, or the car has not been driven enough since a repair |
| Distance with warning light on | 0 km | Resets to 0 when codes are cleared, so it cannot show how long the light was on before |

Useful questions for this result: when were the codes cleared or the battery replaced, and why? Was anything done on the catalytic converter or oxygen sensors, and are there repair records? Can the car be driven longer, or rechecked later, before you decide? A battery replacement explains the incomplete monitors but not the permanent `P0420`.

### Limits

- Many vehicles built before about 2010 do not answer permanent-code requests. The tool then returns `null`, which means "unknown", not "no codes".
- Monitors marked `not_supported` do not apply to that car. Some cars normally leave one monitor, often EVAP, incomplete.
- Many mechanical problems (worn suspension, rust, transmission wear, accident repairs) never set a trouble code.

## 日本語

### 役立つ場面

- **中古車を買う前。** 故障コードは、診断機やバッテリーの取り外しで現車確認の直前に消せます。そうすると、しばらくは警告灯も点きません。それでも残るものが2つあります。修理が確認されるまで残る**消去しても残る故障コード**（`read_permanent_dtcs`）と、十分に走るまで未完了のままの**レディネスモニター**です。
- **修理のあと。** 整備工場がコードを消したあとも消去しても残るコードがあれば、車はまだ修理を確認できていません。修理の失敗を意味するわけではなく、普段どおり走るうちに自然に消えるのが一般的です。

### 現車確認の当日

1. OBD-IIアダプタを挿してデータを読むことについて、**売り手の了承を得ます**。読むだけにし、自分の車ではないのでコードは絶対に消しません。
2. 車を**停車**させ、ELM327アダプタをOBD-IIポート（多くは運転席側のダッシュボード下）に挿します。イグニッションをオンにするか、屋外でアイドリングします。
3. Claude Desktopの添付（＋）メニューから、obd2-mcpのプロンプト **used_car_check** を選びます。売り手の説明（例：「警告灯なし、先週バッテリー交換」）と返答言語は任意で入力できます。
4. Claudeは了承を確認したあと、整備相談レポート、消去しても残るコード、対応していれば警告灯点灯後の走行距離とエンジン稼働時間を読みます。最初に短い要約を示し、そのあとに売り手への質問をまとめます。
5. **試乗のあと**、停車してからもう一度読んでもらいます。保留中のコードが出たり、未完了だったモニターが完了したりすれば、判断材料が増えます。1回の走行ですべてのモニターが完了するとは限りません。
6. まとめた質問を売り手に確認し、スキャンでは分からない部分はプロの購入前点検で見てもらいます。

### まず車なしで試す

Claude Desktopの拡張機能の設定で **Adapter connection** を `mock` のままにし、**Mock scenario** を `cleared` にします。ほかのクライアントでは `OBD2MCP_MOCK_SCENARIO=cleared` を設定します。そのうえで **used_car_check** を実行すると、模擬車両は次のように見えます。AIクライアントがなくても、`obd2-mcp --demo --summary --lang ja --scenario cleared` で同じ読み取り結果を表示できます。

| 読み取り項目 | 模擬データの値 | 読み取れること |
|---|---|---|
| 記録済み・保留中のコード | なし、警告灯消灯 | 今は何も検出されていない |
| 消去しても残るコード | `P0420` | 触媒の効率低下が検出され、修理がまだ確認されていない |
| レディネスモニター | 触媒・蒸発ガス・O2センサーが未完了、ほかは完了または非対応 | 最近コードを消したかバッテリーを外した、または修理後の走行がまだ足りない |
| 警告灯点灯後の走行距離 | 0 km | コード消去で0に戻るため、消去前に警告灯がどれだけ点いていたかは分からない |

この結果で売り手に聞くとよいこと：いつ、なぜコードを消したか（またはバッテリーを交換したか）。触媒やO2センサーの修理をしたか、その記録はあるか。決める前に、もう少し走ってから再確認できるか。バッテリー交換は未完了のモニターの説明にはなりますが、消去しても残る `P0420` の説明にはなりません。

### 限界

- 2010年頃より前の車の多くは、消去しても残るコードの要求に応答しません。その場合は `null`（不明）で、「コードなし」ではありません。
- `not_supported` のモニターはその車には当てはまりません。EVAPなど1つのモニターが普段から未完了の車もあります。
- 足回りの摩耗、さび、変速機の摩耗、事故修理など、故障コードを記録しない不具合は多くあります。
