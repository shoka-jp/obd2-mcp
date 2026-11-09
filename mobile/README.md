# Phone app prototype / スマートフォンアプリの試作

This source prototype is intended for Android and iPhone. It is **not yet an
App Store or Google Play release**, and it has not been tested with a physical
phone, adapter, or vehicle. The native TCP dependency is reported as untested
on React Native's New Architecture by Expo Doctor; native builds and real
devices need verification before distribution.

The app has a fictional sample and an experimental read-only connection for a
Wi-Fi ELM327-compatible adapter with a TCP interface. It shows stored and
pending codes, the warning-light status, selected current values and freeze
frame values when available. Missing, inconsistent and unsupported responses
remain unknown. It can open the system sharing sheet with a workshop note.
The app does not request a VIN, clear codes, contact an AI service or
automatically send readings. A code is not a diagnosis. Do not operate while
driving; use a qualified professional for safety-critical work.

Only Wi-Fi adapters with a supported TCP interface are in scope; Bluetooth,
BLE, USB and other adapter protocols are not implemented. The example IP and
port are not a compatibility guarantee. Some phones may lose Internet access
while connected to an adapter's Wi-Fi. On iPhone, the system may ask for local
network access. Use only networks and adapters you trust.

The current Expo/React Native defaults target Android SDK 36. Before targeting
SDK 37 or later, add and verify Android's `ACCESS_LOCAL_NETWORK` runtime
permission flow; Android 17 enforces this permission for apps targeting 37+.

## Development

Use Node.js 22 or 24. From this directory:

```bash
npm ci
npm test
npm run typecheck
npm run lint
npx expo export --platform all
```

The browser export is **sample-only**; it cannot connect to an adapter. The
TCP library contains native code, so real connections require a custom native
development build; Expo Go alone is insufficient. To create local builds use
`npx expo run:android` with Android Studio/SDK or `npx expo run:ios` with Xcode
on macOS. iPhone device distribution also requires appropriate Apple signing.
The sample application identifiers in `app.json` must be reviewed for the
maintainer's accounts before distribution.

The ELM and DTC parsers in `src/core/vendor/` are copied from the server at the
repository root. A test checks that they remain identical; update and review
both copies together. The application additionally applies an allowlist that
excludes mode 04, mode 09 and arbitrary commands.

The app icon is rendered from the companion Automotive AI Skills project logo.

## 日本語

Android・iPhone向けの**ソースコード段階の試作**です。ストアでは配布しておらず、実際のスマホ・アダプター・車両での検証もまだです。通信ライブラリは新しいReact Native構成での互換性が未確認と報告されているため、配布前に両OSのビルドと実機確認が必要です。

架空のサンプルを見たり、TCP接続できるWi-Fi型ELM327互換アダプターから、保存・保留コード、警告灯、取得できた現在値と記録時の値を読み取ったりする設計です。取得できない値は「不明」として扱い、整備士向けメモを端末の共有画面で共有できます。車台番号は取得せず、コード消去やAIへの自動送信も行いません。コードだけでは故障を確定できません。運転中は操作せず、安全に関わる作業は専門家に依頼してください。

現段階ではBluetooth・BLE・USB接続は未対応です。IPアドレスとポートは機器ごとに異なり、表示例は対応を保証しません。診断機のWi-Fi接続中はインターネットが使えない場合があり、iPhoneではローカルネットワークへのアクセス許可が必要になることがあります。信頼できる機器とネットワークで使用してください。

現在のExpo/React Nativeの標準設定はAndroid SDK 36を対象とします。SDK 37以降を対象にする前に、Android 17のローカルネットワーク権限の要求と拒否時の動作を実装・検証してください。

上の開発コマンドでサンプルと通信処理を検証できます。ブラウザー版はサンプル専用です。実機接続には独自のネイティブ開発ビルドが必要で、Expo Goだけでは使えません。AndroidにはAndroid Studio/SDK、iOSのローカルビルドにはmacOSとXcodeが必要です。iPhoneへの配布にはAppleの署名も必要です。`app.json`の識別子は配布前に確認してください。
