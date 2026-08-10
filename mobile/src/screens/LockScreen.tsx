/**
 * First launch sets a PIN and the field worker's name (that name travels with
 * every record into the transfer package, so the office knows who entered
 * what). Subsequent launches just ask for the PIN.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { Body, Button, Card, Field, Heading, Loading, Notice, Screen } from '../ui/components';
import { configurePin, isPinConfigured, verifyPin } from '../services/lock';

export function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [checking, setChecking] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [operator, setOperator] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isPinConfigured()
      .then(setConfigured)
      .catch(() => setConfigured(false))
      .finally(() => setChecking(false));
  }, []);

  async function handleSetup() {
    setError(null);
    if (pin !== confirmPin) {
      setError('الرمزان غير متطابقين');
      return;
    }
    setBusy(true);
    try {
      await configurePin(pin, operator);
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الرمز');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock() {
    setError(null);
    if (Date.now() < lockedUntil) return;
    setBusy(true);
    try {
      const result = await verifyPin(pin);
      if (result.ok) {
        setPin('');
        onUnlocked();
        return;
      }
      if (result.lockoutMs > 0) {
        setLockedUntil(Date.now() + result.lockoutMs);
        setError(`رمز غير صحيح — انتظر ${Math.ceil(result.lockoutMs / 1000)} ثانية قبل المحاولة`);
      } else {
        setError('رمز غير صحيح');
      }
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Card>
          <Heading>غصون زهران - العمل الميداني</Heading>
          {configured ? (
            <>
              <Body muted>أدخل رمز الدخول لفتح التطبيق</Body>
              {error ? <Notice text={error} tone="danger" /> : null}
              <Field
                label="رمز الدخول"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
                value={pin}
                onChangeText={setPin}
              />
              <Button title="دخول" onPress={handleUnlock} loading={busy} disabled={pin.length < 4} />
            </>
          ) : (
            <>
              <Body muted>
                الإعداد الأول: اختر رمز دخول للتطبيق وأدخل اسمك. يُحفظ الاسم مع كل سجل حتى يعرف
                المكتب من أدخل البيانات.
              </Body>
              {error ? <Notice text={error} tone="danger" /> : null}
              <Field label="اسم الموظف" required value={operator} onChangeText={setOperator} />
              <Field
                label="رمز الدخول (4-8 أرقام)"
                required
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
                value={pin}
                onChangeText={setPin}
              />
              <Field
                label="تأكيد الرمز"
                required
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
                value={confirmPin}
                onChangeText={setConfirmPin}
              />
              <Notice
                text="التطبيق يعمل بدون إنترنت بالكامل، والبيانات تبقى داخل الهاتف ولا تُرسل إلى أي خادم."
                tone="info"
              />
              <Button
                title="حفظ والمتابعة"
                onPress={handleSetup}
                loading={busy}
                disabled={pin.length < 4 || operator.trim().length < 2}
              />
            </>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}
