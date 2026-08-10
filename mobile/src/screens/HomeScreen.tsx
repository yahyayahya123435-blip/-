/**
 * The field worker's landing screen: what is stored on this phone, and how
 * much of it is still waiting to be carried to the office.
 */
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Body, Card, Heading, Loading, Notice, Screen } from '../ui/components';
import { getCounts, type FieldCounts } from '../db/repository';
import { getLastExportAt } from '../services/transfer';
import { getOperatorName } from '../services/lock';
import { colors, radius, spacing } from '../ui/theme';

export function HomeScreen() {
  const [counts, setCounts] = useState<FieldCounts | null>(null);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [c, exported, name] = await Promise.all([
      getCounts(),
      getLastExportAt(),
      getOperatorName(),
    ]);
    setCounts(c);
    setLastExport(exported);
    setOperator(name);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!counts) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        <Card>
          <Heading>الرئيسية</Heading>
          <Body muted>{operator ? `الموظف: ${operator}` : 'العمل الميداني'}</Body>
          <Body muted>
            {lastExport
              ? `آخر تصدير: ${lastExport.slice(0, 16).replace('T', ' ')}`
              : 'لم يتم تصدير أي بيانات بعد'}
          </Body>
        </Card>

        {counts.pendingExport > 0 ? (
          <Notice
            tone="warning"
            text={`${counts.pendingExport} سجلاً لم يُصدَّر بعد إلى الكمبيوتر. افتح شاشة "النقل" لتصديرها.`}
          />
        ) : (
          <Notice tone="success" text="كل السجلات تم تصديرها إلى الكمبيوتر." />
        )}

        <View style={styles.grid}>
          <Stat label="الأسر" value={counts.families} />
          <Stat label="المستفيدون" value={counts.beneficiaries} />
          <Stat label="الزيارات" value={counts.visits} />
          <Stat label="البحث الاجتماعي" value={counts.assessments} />
          <Stat label="المساعدات" value={counts.assistances} />
          <Stat label="بانتظار التصدير" value={counts.pendingExport} />
        </View>

        <Card>
          <Body muted>
            التطبيق يعمل بدون إنترنت. لا توجد مزامنة تلقائية — النقل بين الهاتف والكمبيوتر يتم
            يدوياً عبر ملف نقل واحد.
          </Body>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  stat: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '700', color: colors.brandDark },
  statLabel: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
