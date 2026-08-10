/**
 * The only way data moves between this phone and the office computer.
 *
 * Export builds a .gztransfer file and hands it to the share sheet; import
 * accepts the desktop's family list. Nothing happens automatically and
 * nothing needs a network connection.
 */
import React, { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from '@react-navigation/native';
import { Body, Button, Card, Heading, Notice, Screen } from '../ui/components';
import { exportTransferPackage, getLastExportAt, importDesktopPackage, shareTransferPackage } from '../services/transfer';
import { getCounts, type FieldCounts } from '../db/repository';

export function TransferScreen() {
  const [counts, setCounts] = useState<FieldCounts | null>(null);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [busy, setBusy] = useState<'export' | 'full' | 'import' | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'success' | 'danger' | 'warning' } | null>(null);

  const load = useCallback(async () => {
    setCounts(await getCounts());
    setLastExport(await getLastExportAt());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleExport(fullExport: boolean) {
    setMessage(null);
    setBusy(fullExport ? 'full' : 'export');
    try {
      const result = await exportTransferPackage(fullExport);
      if (result.recordCount === 0 && result.attachmentCount === 0) {
        setMessage({ text: 'لا توجد سجلات جديدة للتصدير.', tone: 'warning' });
      } else {
        setMessage({
          text: `تم إنشاء ${result.fileName} — ${result.recordCount} سجلاً و${result.attachmentCount} مرفقاً.`,
          tone: 'success',
        });
        await shareTransferPackage(result.fileUri);
      }
      await load();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'تعذر إنشاء ملف النقل', tone: 'danger' });
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    setMessage(null);
    setBusy('import');
    try {
      const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (picked.canceled || picked.assets.length === 0) return;
      const result = await importDesktopPackage(picked.assets[0].uri);
      setMessage({
        text: `تم استيراد ${result.created} سجلاً جديداً وتحديث ${result.updated}${
          result.skipped ? `، وتم تخطي ${result.skipped} سجلاً` : ''
        }.`,
        tone: 'success',
      });
      await load();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'تعذر استيراد الملف', tone: 'danger' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <ScrollView>
        <Card>
          <Heading>تصدير بيانات العمل</Heading>
          <Body muted>
            {lastExport
              ? `آخر تصدير: ${lastExport.slice(0, 16).replace('T', ' ')}`
              : 'لم يتم تصدير أي بيانات بعد'}
          </Body>
          <Body muted>
            {counts ? `${counts.pendingExport} سجلاً جاهزاً للتصدير` : ''}
          </Body>
          {message ? <Notice text={message.text} tone={message.tone} /> : null}
          <Button
            title="تصدير السجلات الجديدة والمعدلة"
            onPress={() => handleExport(false)}
            loading={busy === 'export'}
            disabled={busy !== null}
          />
          <Button
            title="تصدير كل البيانات"
            variant="secondary"
            onPress={() => handleExport(true)}
            loading={busy === 'full'}
            disabled={busy !== null}
          />
          <Body muted>
            بعد التصدير، أرسل الملف إلى الكمبيوتر بأي طريقة (كابل، واتساب، بريد)، ثم افتح في
            البرنامج شاشة "النقل من الهاتف" واستورده.
          </Body>
        </Card>

        <Card>
          <Heading>استيراد بيانات الأسر من الكمبيوتر</Heading>
          <Body muted>
            استورد ملف النقل الصادر من البرنامج على الكمبيوتر ليحتوي الهاتف على قائمة الأسر
            والمستفيدين المعتمدة.
          </Body>
          <Button
            title="اختيار ملف نقل"
            onPress={handleImport}
            loading={busy === 'import'}
            disabled={busy !== null}
          />
          <Body muted>
            السجلات التي عدّلتها على الهاتف ولم تُصدَّر بعد لن يتم استبدالها بالاستيراد.
          </Body>
        </Card>
      </ScrollView>
    </Screen>
  );
}
