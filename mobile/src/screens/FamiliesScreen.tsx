/**
 * The family list and the family entry form.
 *
 * Everything a field worker records hangs off a family, so this screen also
 * acts as the hub: opening a family leads to its beneficiaries, visits,
 * assessments and assistances.
 */
import React, { useCallback, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Body, Button, Card, Chips, Empty, Field, Heading, ListRow, Loading, Notice, Screen,
} from '../ui/components';
import {
  createFamily, findSimilarFamilies, listFamilies, updateFamily,
  type FamilyRow,
} from '../db/repository';
import type { FieldStackParams } from '../navigation-types';

const HOUSING = ['ملك', 'إيجار', 'أخرى'];
const NEED_LEVELS = ['شديد الحاجة', 'متوسط الحاجة', 'قليل الحاجة'];
const MARITAL = ['أعزب', 'متزوج', 'مطلق', 'أرمل'];

/** Dinars typed by the user → integer fils. Money is never a float. */
function dinarsToFils(text: string): number {
  const value = Number(text.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 1000);
}

function filsToDinars(fils: number): string {
  return fils ? (fils / 1000).toString() : '';
}

export function FamiliesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FieldStackParams>>();
  const [families, setFamilies] = useState<FamilyRow[] | null>(null);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FamilyRow | null>(null);

  const load = useCallback(async (term = '') => {
    setFamilies(await listFamilies(term));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(search);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  if (formOpen) {
    return (
      <FamilyForm
        initial={editing}
        onCancel={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={async () => {
          setFormOpen(false);
          setEditing(null);
          await load(search);
        }}
      />
    );
  }

  return (
    <Screen>
      <Field
        label="بحث"
        placeholder="الاسم، الهاتف أو الرقم الوطني"
        value={search}
        onChangeText={(text) => {
          setSearch(text);
          void load(text);
        }}
      />
      <Button title="+ إضافة أسرة" onPress={() => setFormOpen(true)} />

      {families === null ? (
        <Loading />
      ) : families.length === 0 ? (
        <Empty text="لا توجد أسر مسجلة على هذا الهاتف بعد." />
      ) : (
        <FlatList
          data={families}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ListRow
              title={item.headOfFamilyName}
              subtitle={[item.wifeName, item.phone, item.neighborhood]
                .filter(Boolean)
                .join(' • ') || 'بدون بيانات إضافية'}
              badge={item.dirty === 1 ? 'غير مُصدَّر' : undefined}
              onPress={() => navigation.navigate('FamilyDetail', { familyId: item.id })}
            />
          )}
        />
      )}
    </Screen>
  );
}

function FamilyForm({
  initial, onCancel, onSaved,
}: {
  initial: FamilyRow | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [headOfFamilyName, setHeadOfFamilyName] = useState(initial?.headOfFamilyName ?? '');
  const [wifeName, setWifeName] = useState(initial?.wifeName ?? '');
  const [headNationalId, setHeadNationalId] = useState(initial?.headNationalId ?? '');
  const [bookCount, setBookCount] = useState(
    initial?.familyBookMembersCount != null ? String(initial.familyBookMembersCount) : '',
  );
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [neighborhood, setNeighborhood] = useState(initial?.neighborhood ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [maritalStatus, setMaritalStatus] = useState<string | null>(initial?.maritalStatus ?? null);
  const [housingType, setHousingType] = useState<string | null>(initial?.housingType ?? null);
  const [needLevel, setNeedLevel] = useState<string | null>(initial?.needLevel ?? null);
  const [incomeSource, setIncomeSource] = useState(initial?.incomeSource ?? '');
  const [income, setIncome] = useState(filsToDinars(initial?.monthlyIncomeFils ?? 0));
  const [expenses, setExpenses] = useState(filsToDinars(initial?.monthlyExpensesFils ?? 0));
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const [duplicates, setDuplicates] = useState<FamilyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    if (headOfFamilyName.trim().length < 2) {
      setError('اسم رب الأسرة مطلوب');
      return;
    }

    // Same rule as the desktop: warn once, then let the user proceed.
    if (duplicates.length === 0) {
      const similar = await findSimilarFamilies(
        headOfFamilyName.trim(),
        headNationalId.trim() || undefined,
        phone.trim() || undefined,
        initial?.id,
      );
      if (similar.length > 0) {
        setDuplicates(similar);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        headOfFamilyName: headOfFamilyName.trim(),
        wifeName: wifeName.trim() || null,
        headNationalId: headNationalId.trim() || null,
        familyBookMembersCount: bookCount.trim() === '' ? null : Number(bookCount),
        phone: phone.trim() || null,
        neighborhood: neighborhood.trim() || null,
        address: address.trim() || null,
        maritalStatus,
        housingType,
        needLevel,
        incomeSource: incomeSource.trim() || null,
        monthlyIncomeFils: dinarsToFils(income),
        monthlyExpensesFils: dinarsToFils(expenses),
        notes: notes.trim() || null,
      };
      if (initial) {
        await updateFamily(initial.id, payload);
      } else {
        await createFamily(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الأسرة');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Card>
          <Heading>{initial ? 'تعديل بيانات الأسرة' : 'أسرة جديدة'}</Heading>
          {error ? <Notice text={error} tone="danger" /> : null}
          {duplicates.length > 0 ? (
            <Notice
              tone="warning"
              text={
                'توجد سجلات مشابهة على الهاتف:\n' +
                duplicates
                  .map((d) => `• ${d.headOfFamilyName}${d.phone ? ` — ${d.phone}` : ''}`)
                  .join('\n') +
                '\nاضغط حفظ مرة أخرى للمتابعة رغم التشابه.'
              }
            />
          ) : null}

          <Field label="اسم رب الأسرة / المنتسب" required value={headOfFamilyName} onChangeText={setHeadOfFamilyName} />
          <Field label="اسم الزوجة" value={wifeName} onChangeText={setWifeName} />
          <Field label="الرقم الوطني" keyboardType="number-pad" value={headNationalId} onChangeText={setHeadNationalId} />
          <Field label="عدد الأفراد في دفتر العائلة" keyboardType="number-pad" value={bookCount} onChangeText={setBookCount} />
          <Field label="الهاتف" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          <Field label="الحي" value={neighborhood} onChangeText={setNeighborhood} />
          <Field label="العنوان" value={address} onChangeText={setAddress} />
          <Chips label="الحالة الاجتماعية" options={MARITAL} value={maritalStatus} onChange={setMaritalStatus} />
          <Chips label="وضع السكن" options={HOUSING} value={housingType} onChange={setHousingType} />
          <Chips label="درجة الاحتياج" options={NEED_LEVELS} value={needLevel} onChange={setNeedLevel} />
          <Field label="مصدر الدخل" value={incomeSource} onChangeText={setIncomeSource} />
          <Field label="الدخل الشهري (د.أ)" keyboardType="decimal-pad" value={income} onChangeText={setIncome} />
          <Field label="المصاريف الشهرية (د.أ)" keyboardType="decimal-pad" value={expenses} onChangeText={setExpenses} />
          <Field label="ملاحظات" multiline value={notes} onChangeText={setNotes} />

          <View>
            <Button title={duplicates.length > 0 ? 'حفظ رغم ذلك' : 'حفظ'} onPress={handleSave} loading={saving} />
            <Button title="إلغاء" variant="secondary" onPress={onCancel} />
          </View>
          <Body muted>
            الرقم الوطني وعدد أفراد دفتر العائلة اختياريان — اتركهما فارغين إذا لم تتوفر البيانات.
          </Body>
        </Card>
      </ScrollView>
    </Screen>
  );
}
