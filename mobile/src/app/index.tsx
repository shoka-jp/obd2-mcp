import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { AppState, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { messages, type Language } from '../components/strings';
import { PhoneSession, type Observations } from '../core/session';
import { makeWifiTransport } from '../core/socket';
import { DemoTransport, isPrivateIPv4 } from '../core/transport';

type Phase = 'home' | 'setup' | 'connecting' | 'ready' | 'reading' | 'result';
type Problem = 'connect' | 'invalid' | 'closed' | null;
type Copy = typeof messages.ja;

function Action({ label, onPress, secondary = false, disabled = false, testID }:
  { label: string; onPress(): void; secondary?: boolean; disabled?: boolean; testID?: string }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} testID={testID}
    style={({ pressed }) => [styles.action, secondary && styles.actionSecondary, disabled && styles.disabled, pressed && styles.pressed]}>
    <Text style={[styles.actionText, secondary && styles.actionSecondaryText]}>{label}</Text>
  </Pressable>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>;
}

function displayCodes(codes: string[] | null, t: Copy): string {
  return codes === null ? t.unknown : codes.length ? codes.join(', ') : t.none;
}
function displayNumber(value: number | null, unit: string, t: Copy): string {
  return value === null ? t.unknown : `${value.toLocaleString()} ${unit}`;
}
function makeNote(result: Observations, t: Copy): string {
  return [result.simulated ? t.noteSimulation : t.noteReal,
    `${t.noteTime}: ${new Date(result.collectedAt).toLocaleString()}`,
    `${t.warning}: ${result.milOn === null ? t.unknown : result.milOn ? t.on : t.off}`,
    `${t.stored}: ${displayCodes(result.stored, t)}`,
    `${t.pending}: ${displayCodes(result.pending, t)}`,
    `${t.current}: ${t.engine} ${displayNumber(result.rpm, 'rpm', t)}, ${t.coolant} ${displayNumber(result.coolant, '°C', t)}`,
    `${t.freeze}: ${t.freezeCode}: ${result.freezeCode ?? t.unknown}, ${t.engine} ${displayNumber(result.freezeRpm, 'rpm', t)}, ${t.coolant} ${displayNumber(result.freezeCoolant, '°C', t)}`,
    ...(result.incomplete ? [t.noteIncomplete] : []), t.noteQuestion].join('\n');
}

export default function HomeScreen() {
  const [language, setLanguage] = useState<Language>('ja');
  const t = messages[language];
  const [phase, setPhase] = useState<Phase>('home');
  const [problem, setProblem] = useState<Problem>(null);
  const [host, setHost] = useState('192.168.0.10');
  const [port, setPort] = useState('35000');
  const [result, setResult] = useState<Observations | null>(null);
  const [shareStatus, setShareStatus] = useState('');
  const session = useRef<PhoneSession | null>(null);
  const currentMode = useRef<'demo' | 'device'>('demo');
  const generation = useRef(0);
  const busy = useRef(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const reset = useCallback((next: Phase = 'home', reason: Problem = null) => {
    generation.current += 1;
    busy.current = false;
    const previous = session.current;
    session.current = null;
    if (previous) void previous.close().catch(() => undefined);
    setResult(null);
    setShareStatus('');
    setProblem(reason);
    setPhase(next);
  }, []);

  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state === 'background' && currentMode.current === 'device' && session.current) reset('home', 'closed');
    });
    return () => { listener.remove(); generation.current += 1; void session.current?.close().catch(() => undefined); session.current = null; };
  }, [reset]);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: true }); }, [phase]);

  const start = async (mode: 'demo' | 'device') => {
    if (busy.current) return;
    const numericPort = Number(port);
    if (mode === 'device' && (!isPrivateIPv4(host.trim()) || !/^\d+$/.test(port) || numericPort < 1 || numericPort > 65535)) {
      setProblem('invalid');
      return;
    }
    busy.current = true;
    const attempt = ++generation.current;
    currentMode.current = mode;
    setProblem(null);
    setResult(null);
    setPhase('connecting');
    let next: PhoneSession | null = null;
    try {
      const transport = mode === 'demo' ? new DemoTransport() : makeWifiTransport(host.trim(), numericPort);
      next = new PhoneSession(transport, mode === 'demo');
      session.current = next;
      await next.connect();
      if (attempt !== generation.current) { await next.close(); return; }
      if (mode === 'demo') {
        const observations = await next.read();
        if (attempt !== generation.current) { await next.close(); return; }
        setResult(observations);
        setPhase('result');
      } else setPhase('ready');
    } catch {
      if (next) await next.close().catch(() => undefined);
      if (attempt === generation.current) { session.current = null; setProblem('connect'); setPhase(mode === 'demo' ? 'home' : 'setup'); }
    } finally { if (attempt === generation.current) busy.current = false; }
  };

  const read = async () => {
    if (busy.current || !session.current) return;
    busy.current = true;
    const attempt = ++generation.current;
    setProblem(null);
    setShareStatus('');
    setPhase('reading');
    try {
      const observations = await session.current.read();
      if (attempt === generation.current) { setResult(observations); setPhase('result'); }
    } catch {
      if (attempt === generation.current) reset('setup', 'connect');
    } finally { if (attempt === generation.current) busy.current = false; }
  };

  const share = async () => {
    if (!result) return;
    setShareStatus('');
    try {
      const note = makeNote(result, t);
      if (Platform.OS === 'web') {
        if (!globalThis.navigator?.clipboard) throw new Error('Clipboard unavailable');
        await globalThis.navigator.clipboard.writeText(note);
        setShareStatus(t.copied);
      } else await Share.share({ message: note });
    } catch { setShareStatus(t.shareError); }
  };

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <View style={styles.topbar}>
      <Text style={styles.brand}>{t.brand}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={language === 'ja' ? 'Switch to English' : '日本語に切り替える'}
        onPress={() => setLanguage(language === 'ja' ? 'en' : 'ja')} style={styles.language}>
        <Text style={styles.languageText}>{language === 'ja' ? 'EN' : '日本語'}</Text>
      </Pressable>
    </View>
    <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {phase === 'home' && <>
        <View style={styles.hero}>
          <View style={styles.heroTop}><Text style={styles.eyebrow}>A LITTLE MORE CLARITY</Text><Text style={styles.beta}>{t.beta}</Text></View>
          <Text accessibilityRole="header" style={styles.heroTitle}>{t.title}</Text>
          <Text style={styles.heroBody}>{t.intro}</Text>
          <View style={styles.heroLine}><View style={styles.dot} /><Text style={styles.heroMeta}>READ ONLY  ·  NO VIN</Text></View>
        </View>
        {problem === 'closed' && <View style={styles.notice}><Text style={styles.noticeText}>{t.closed}</Text></View>}
        {problem === 'connect' && <View style={styles.notice}><Text style={styles.noticeText}>{t.errorBody}</Text></View>}
        <View style={styles.card}>
          <Text style={styles.cardIndex}>01  /  TRY</Text><Text accessibilityRole="header" style={styles.cardTitle}>{t.trialTitle}</Text>
          <Text style={styles.body}>{t.trialBody}</Text><Action label={t.trialButton} onPress={() => void start('demo')} testID="try-demo" />
        </View>
        <View style={styles.card}>
          <Text style={styles.cardIndex}>02  /  CONNECT</Text><Text accessibilityRole="header" style={styles.cardTitle}>{t.realTitle}</Text>
          <Text style={styles.body}>{t.realBody}</Text>
          {Platform.OS === 'web' && <Text style={styles.smallNotice}>{t.webNotice}</Text>}
          <Action label={t.realButton} onPress={() => { setProblem(null); setPhase('setup'); }} secondary testID="prepare-device" />
        </View>
        <Text style={styles.footnote}>{t.safety}</Text><Text style={styles.footnote}>{t.private}</Text>
      </>}

      {phase === 'setup' && <>
        <Text style={styles.sectionKicker}>01  /  GET READY</Text><Text accessibilityRole="header" style={styles.title}>{t.setupTitle}</Text>
        <View style={styles.notice}><Text style={styles.noticeText}>{t.safety}</Text></View>
        {[t.step1, t.step2, t.step3].map((text, index) => <View style={styles.step} key={text}>
          <Text style={styles.stepNumber}>0{index + 1}</Text><Text style={styles.stepText}>{text}</Text>
        </View>)}
        <View style={styles.card}>
          <Text style={styles.inputLabel}>{t.address}</Text>
          <TextInput accessibilityLabel={t.address} style={styles.input} value={host} onChangeText={setHost}
            autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" testID="adapter-host" />
          <Text style={styles.inputLabel}>{t.port}</Text>
          <TextInput accessibilityLabel={t.port} style={styles.input} value={port} onChangeText={setPort}
            autoCapitalize="none" autoCorrect={false} keyboardType="number-pad" testID="adapter-port" />
          {problem === 'invalid' && <Text accessibilityRole="alert" style={styles.error}>{t.invalid}</Text>}
          {problem === 'connect' && <Text accessibilityRole="alert" style={styles.error}>{t.errorTitle} {t.errorBody}</Text>}
          {Platform.OS === 'web' && <Text style={styles.smallNotice}>{t.webNotice}</Text>}
          <Action label={t.connect} onPress={() => void start('device')} disabled={Platform.OS === 'web'} testID="connect-device" />
          <Action label={t.back} onPress={() => reset()} secondary />
        </View>
        <Text style={styles.footnote}>{t.private}</Text>
      </>}

      {(phase === 'connecting' || phase === 'reading') && <>
        <Text style={styles.sectionKicker}>02  /  ONE MOMENT</Text>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.title}>{phase === 'connecting' ? t.connecting : t.reading}</Text>
        <View style={styles.notice}><Text style={styles.noticeText}>{t.safety}</Text></View>
        <Action label={t.cancel} onPress={() => reset()} secondary />
      </>}

      {phase === 'ready' && <>
        <Text style={styles.sectionKicker}>02  /  CONNECTED</Text><Text accessibilityRole="header" style={styles.title}>{t.connected}</Text>
        <View style={styles.notice}><Text style={styles.noticeText}>{t.notChecked}</Text></View>
        <Text style={styles.body}>{t.safety}</Text><Action label={t.read} onPress={() => void read()} testID="read-records" />
        <Action label={t.disconnect} onPress={() => reset()} secondary />
      </>}

      {phase === 'result' && result && <>
        <Text style={styles.sectionKicker}>{result.simulated ? t.demoLabel : t.realLabel}</Text>
        <Text accessibilityRole="header" style={styles.title}>{t.resultTitle}</Text><Text style={styles.body}>{t.resultIntro}</Text>
        {result.simulated && <View style={styles.notice}><Text style={styles.noticeText}>{t.noteSimulation}</Text></View>}
        {result.incomplete && <View style={styles.notice}><Text style={styles.noticeText}>{t.incomplete}</Text></View>}
        <View style={styles.card}>
          <Text style={styles.cardIndex}>01  /  RECORDS</Text>
          <Row label={t.warning} value={result.milOn === null ? t.unknown : result.milOn ? t.on : t.off} />
          <Row label={t.stored} value={displayCodes(result.stored, t)} />
          <Row label={t.pending} value={displayCodes(result.pending, t)} />
        </View>
        <View style={styles.card}>
          <Text style={styles.cardIndex}>02  /  NOW</Text><Text style={styles.cardTitle}>{t.current}</Text>
          <Row label={t.engine} value={displayNumber(result.rpm, 'rpm', t)} />
          <Row label={t.coolant} value={displayNumber(result.coolant, '°C', t)} />
        </View>
        <View style={styles.card}>
          <Text style={styles.cardIndex}>03  /  SNAPSHOT</Text><Text style={styles.cardTitle}>{t.freeze}</Text>
          <Row label={t.freezeCode} value={result.freezeCode ?? t.unknown} />
          <Row label={t.engine} value={displayNumber(result.freezeRpm, 'rpm', t)} />
          <Row label={t.coolant} value={displayNumber(result.freezeCoolant, '°C', t)} />
        </View>
        <Action label={t.share} onPress={() => void share()} testID="share-note" />
        <Text style={styles.footnote}>{t.shareHint}</Text>{!!shareStatus && <Text accessibilityLiveRegion="polite" style={styles.footnote}>{shareStatus}</Text>}
        {!result.simulated && <Action label={t.readAgain} onPress={() => void read()} secondary />}
        <Action label={result.simulated ? t.sampleAgain : t.finish} onPress={() => reset()} secondary />
        <Text style={styles.footnote}>{t.help}</Text>
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f6f3' },
  topbar: { paddingHorizontal: 22, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#173c43', fontSize: 11, letterSpacing: 1, fontWeight: '800', flexShrink: 1 },
  language: { minWidth: 46, minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: '#bacdc8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  languageText: { color: '#174f50', fontWeight: '700', fontSize: 12 },
  content: { paddingHorizontal: 20, paddingBottom: 42, maxWidth: 680, width: '100%', alignSelf: 'center' },
  hero: { backgroundColor: '#102d37', padding: 25, borderRadius: 24, marginBottom: 16 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  eyebrow: { color: '#8be2cb', fontSize: 10, letterSpacing: 1.5, fontWeight: '800', flexShrink: 1 },
  beta: { color: '#d0f4e8', borderWidth: 1, borderColor: '#547d75', overflow: 'hidden', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, fontSize: 11, fontWeight: '700' },
  heroTitle: { color: '#fff', fontSize: 30, lineHeight: 43, fontWeight: '800', marginTop: 22, letterSpacing: -0.4 },
  heroBody: { color: '#d6e8e3', fontSize: 15, lineHeight: 25, marginTop: 14 },
  heroLine: { marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6ee1c1' },
  heroMeta: { color: '#9ed8ca', fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderColor: '#dfe8e3', borderWidth: 1, borderRadius: 20, padding: 21, marginBottom: 14 },
  cardIndex: { color: '#328a78', fontSize: 11, letterSpacing: 1.2, fontWeight: '800', marginBottom: 10 },
  cardTitle: { color: '#193b42', fontSize: 20, fontWeight: '800', lineHeight: 29, marginBottom: 7 },
  body: { color: '#425d60', fontSize: 15, lineHeight: 25, marginBottom: 18 },
  title: { color: '#173b41', fontSize: 28, lineHeight: 39, fontWeight: '800', marginBottom: 14 },
  sectionKicker: { color: '#258a75', fontWeight: '800', letterSpacing: 1.1, fontSize: 11, marginTop: 16, marginBottom: 10 },
  action: { minHeight: 52, backgroundColor: '#087968', borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12, marginTop: 10 },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 15, textAlign: 'center' },
  actionSecondary: { backgroundColor: '#ecf5f0', borderWidth: 1, borderColor: '#b9d9ce' },
  actionSecondaryText: { color: '#176455' }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.8 },
  notice: { backgroundColor: '#fff3d7', borderRadius: 14, padding: 16, marginBottom: 16 },
  noticeText: { color: '#654b24', fontSize: 14, lineHeight: 23, fontWeight: '600' },
  smallNotice: { color: '#795422', fontSize: 13, lineHeight: 21, marginBottom: 6 },
  footnote: { color: '#58706c', fontSize: 13, lineHeight: 21, marginTop: 12 },
  step: { flexDirection: 'row', gap: 13, marginVertical: 8 },
  stepNumber: { color: '#228b77', fontWeight: '800', fontSize: 12, paddingTop: 4 },
  stepText: { color: '#304d4e', fontSize: 15, lineHeight: 24, flex: 1 },
  inputLabel: { color: '#264c4c', fontWeight: '700', fontSize: 14, marginTop: 8, marginBottom: 6 },
  input: { backgroundColor: '#f6faf8', borderWidth: 1, borderColor: '#b9ceca', borderRadius: 10, minHeight: 48, paddingHorizontal: 12, color: '#193b42', fontSize: 16 },
  error: { color: '#9b322d', fontSize: 14, lineHeight: 22, marginTop: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, borderTopWidth: 1, borderColor: '#edf2ee', paddingVertical: 13 },
  rowLabel: { color: '#536e6a', fontSize: 14, lineHeight: 21, flex: 1 },
  rowValue: { color: '#183d3d', fontSize: 15, lineHeight: 22, fontWeight: '700', textAlign: 'right', flex: 1 },
});
