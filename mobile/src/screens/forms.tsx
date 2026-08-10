/**
 * The four field-entry forms, kept together because they share the same
 * shape: pick a family (already chosen by the caller), fill a short form,
 * save locally, optionally attach photos.
 *
 * Saving writes to SQLite immediately and marks the row for export. Attaching
 * a photo is a separate step that cannot fail the save — the same rule the
 * desktop follows for documents.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import {
  Body, Button, Card, Chips, Empty, Field, Heading, ListRow, Notice, Screen,
} from '../ui/components';
import {
  createAssessment, createAssistance, createBeneficiary, createVisit,
  listBeneficiaries, type BeneficiaryRow, type AttachmentRow,
} from '../db/repository';
import { attachPhoto, listAttachments, removeAttachment } from '../services/attachments';
import type { FieldStackParams } from '../navigation-types';

const VISIT_STATUS = ['مكتملة', 'مجدولة', 'ملغاة'];
const NEED_LEVELS = ['شديد الحاجة', 'متوسط الحاجة', 'قليل الحاجة'];
const OWNERSHIP = ['ملك', 'إيجار', 'أخرى'];
const BENEFICIARY_CATEGORIES = ['يتيم', 'مسن', 'مريض', 'ذوي إعاقة', 'أخرى'];
const GENDERS = ['ذكر', 'أنثى'];
const ASSISTANCE_TYPES = [
  'طرود غذائية', 'مساعدات مالية', 'كسوة', 'بطانيات', 'صوبات',
  'أدوية', 'وجبات', 'كفالات', 'مساعدات طارئة', 'أخرى',
];
const ASSISTANCE_SOURCES = ['مخزون', 'تبرع', 'ميزانية الجمعية', 'أخرى'];

const todayIso = () => new Date().toISOString();

function toIntOrNull(text: string): number | null {
  const value = Number(text.replace(/[^\d]/g, ''));
  return text.trim() === '' || !Number.isFinite(value) ? null : value;
}

function dinarsToFils(text: string): number {
  const value = Number(text.replace(/[^\d.]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) : 0;
}

/** Photo attachments for a record that has just been saved. */
function AttachmentsPanel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [items, setItems] = useState<AttachmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setItems(await listAttachments(entityType, entityId));
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAttach(useCamera: boolean) {
    setError(null);
    setBusy(true);
    try {
      const updated = await attachPhoto({ entityType, entityId, useCamera });
      if (updated) setItems(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرفاق الصورة');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Heading>المرفقات ({items.length})</Heading>
      {error ? <Notice text={error} tone="danger" /> : null}
      <Button title="التقاط صورة" onPress={() => handleAttach(true)} loading={busy} />
      <Button title="اختيار من المعرض" variant="secondary" onPress={() => handleAttach(false)} loading={busy} />
      {items.map((item) => (
        <ListRow
          key={item.id}
          title={item.fileName}
          subtitle={`${Math.round(item.sizeBytes / 1024)} كيلوبايت — اضغط للحذف`}
          onPress={async () => {
            await removeAttachment(item.id, item.localPath);
            await load();
          }}
        />
      ))}
    </Card>
  );
}

// ── Field visit ──────────────────────────────────────────────────────────────

export function VisitFormScreen() {
  const route = useRoute<RouteProp<FieldStackParams, 'VisitForm'>>();
  const navigation = useNavigation();
  const { familyId } = route.params;

  const [purpose, setPurpose] = useState('');
  const [findings, setFindings] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<string | null>('مكتملة');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const id = await createVisit({
        familyId,
        visitDate: todayIso(),
        purpose: purpose.trim() || null,
        findings: findings.trim() || null,
        recommendation: recommendation.trim() || null,
        notes: notes.trim() || null,
        status: status ?? 'مكتملة',
      });
      setSavedId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الزيارة');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Card>
          <Heading>زيارة ميدانية</Heading>
          {error ? <Notice text={error} tone="danger" /> : null}
          {savedId ? <Notice text="تم حفظ الزيارة على الهاتف." tone="success" /> : null}
          <Field label="سبب الزيارة" value={purpose} onChangeText={setPurpose} editable={!savedId} />
          <Field label="النتيجة / ما تمت ملاحظته" multiline value={findings} onChangeText={setFindings} editable={!savedId} />
          <Field label="التوصية" multiline value={recommendation} onChangeText={setRecommendation} editable={!savedId} />
          <Field label="ملاحظات" multiline value={notes} onChangeText={setNotes} editable={!savedId} />
          <Chips label="الحالة" options={VISIT_STATUS} value={status} onChange={setStatus} />
          {savedId ? (
            <Button title="إنهاء" onPress={() => navigation.goBack()} />
          ) : (
            <View>
              <Button title="حفظ الزيارة" onPress={handleSave} loading={saving} />
              <Button title="إلغاء" variant="secondary" onPress={() => navigation.goBack()} />
            </View>
          )}
        </Card>
        {savedId ? <AttachmentsPanel entityType="field_visits" entityId={savedId} /> : null}
      </ScrollView>
    </Screen>
  );
}

// ── Social assessment ────────────────────────────────────────────────────────

export function AssessmentFormScreen() {
  const route = useRoute<RouteProp<FieldStackParams, 'AssessmentForm'>>();
  const navigation = useNavigation();
  const { familyId } = route.params;

  const [income, setIncome] = useState('');
  const [expenses, setExpenses] = useState('');
  const [ownership, setOwnership] = useState<string | null>(null);
  const [rooms, setRooms] = useState('');
  const [housingCondition, setHousingCondition] = useState('');
  const [healthCondition, setHealthCondition] = useState('');
  const [chronicDiseases, setChronicDiseases] = useState('');
  const [disabilities, setDisabilities] = useState('');
  const [children, setChildren] = useState('');
  const [orphans, setOrphans] = useState('');
  const [students, setStudents] = useState('');
  const [unemployed, setUnemployed] = useState('');
  const [obligations, setObligations] = useState('');
  const [basicNeeds, setBasicNeeds] = useState('');
  const [needLevel, setNeedLevel] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState('');
  const [notes, setNotes] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const id = await createAssessment({
        familyId,
        assessmentDate: todayIso(),
        monthlyIncomeFils: dinarsToFils(income),
        monthlyExpensesFils: dinarsToFils(expenses),
        housingCondition: housingCondition.trim() || null,
        housingOwnership: ownership,
        roomsCount: toIntOrNull(rooms),
        healthCondition: healthCondition.trim() || null,
        chronicDiseases: chronicDiseases.trim() || null,
        disabilities: disabilities.trim() || null,
        childrenCount: toIntOrNull(children),
        orphansCount: toIntOrNull(orphans),
        studentsCount: toIntOrNull(students),
        unemployedCount: toIntOrNull(unemployed),
        financialObligations: obligations.trim() || null,
        basicNeeds: basicNeeds.trim() || null,
        needLevel,
        recommendation: recommendation.trim() || null,
        notes: notes.trim() || null,
      });
      setSavedId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ البحث الاجتماعي');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Card>
          <Heading>بحث اجتماعي</Heading>
          {error ? <Notice text={error} tone="danger" /> : null}
          {savedId ? <Notice text="تم حفظ البحث الاجتماعي على الهاتف." tone="success" /> : null}
          <Field label="الدخل الشهري (د.أ)" keyboardType="decimal-pad" value={income} onChangeText={setIncome} editable={!savedId} />
          <Field label="المصاريف الشهرية (د.أ)" keyboardType="decimal-pad" value={expenses} onChangeText={setExpenses} editable={!savedId} />
          <Chips label="ملكية السكن" options={OWNERSHIP} value={ownership} onChange={setOwnership} />
          <Field label="عدد الغرف" keyboardType="number-pad" value={rooms} onChangeText={setRooms} editable={!savedId} />
          <Field label="وضع السكن" value={housingCondition} onChangeText={setHousingCondition} editable={!savedId} />
          <Field label="الحالة الصحية" value={healthCondition} onChangeText={setHealthCondition} editable={!savedId} />
          <Field label="الأمراض المزمنة" value={chronicDiseases} onChangeText={setChronicDiseases} editable={!savedId} />
          <Field label="الإعاقات" value={disabilities} onChangeText={setDisabilities} editable={!savedId} />
          <Field label="عدد الأطفال" keyboardType="number-pad" value={children} onChangeText={setChildren} editable={!savedId} />
          <Field label="عدد الأيتام" keyboardType="number-pad" value={orphans} onChangeText={setOrphans} editable={!savedId} />
          <Field label="عدد الطلاب" keyboardType="number-pad" value={students} onChangeText={setStudents} editable={!savedId} />
          <Field label="عدد العاطلين عن العمل" keyboardType="number-pad" value={unemployed} onChangeText={setUnemployed} editable={!savedId} />
          <Field label="الالتزامات المالية" multiline value={obligations} onChangeText={setObligations} editable={!savedId} />
          <Field label="الاحتياجات الأساسية" multiline value={basicNeeds} onChangeText={setBasicNeeds} editable={!savedId} />
          <Chips label="درجة الاحتياج" options={NEED_LEVELS} value={needLevel} onChange={setNeedLevel} />
          <Field label="توصية الباحث" multiline value={recommendation} onChangeText={setRecommendation} editable={!savedId} />
          <Field label="ملاحظات" multiline value={notes} onChangeText={setNotes} editable={!savedId} />
          {savedId ? (
            <Button title="إنهاء" onPress={() => navigation.goBack()} />
          ) : (
            <View>
              <Button title="حفظ البحث" onPress={handleSave} loading={saving} />
              <Button title="إلغاء" variant="secondary" onPress={() => navigation.goBack()} />
            </View>
          )}
        </Card>
        {savedId ? <AttachmentsPanel entityType="social_assessments" entityId={savedId} /> : null}
      </ScrollView>
    </Screen>
  );
}

// ── Assistance ───────────────────────────────────────────────────────────────

export function AssistanceFormScreen() {
  const route = useRoute<RouteProp<FieldStackParams, 'AssistanceForm'>>();
  const navigation = useNavigation();
  const { familyId } = route.params;

  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryRow[]>([]);
  const [beneficiaryId, setBeneficiaryId] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [notes, setNotes] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBeneficiaries(familyId).then((rows) => {
      setBeneficiaries(rows);
      if (rows.length === 1) setBeneficiaryId(rows[0].id);
    });
  }, [familyId]);

  async function handleSave() {
    setError(null);
    if (!beneficiaryId) {
      setError('اختر المستفيد أولاً — يمكنك إضافته من شاشة الأسرة');
      return;
    }
    setSaving(true);
    try {
      const id = await createAssistance({
        familyId,
        beneficiaryId,
        assistanceTypeName: type,
        amountFils: dinarsToFils(amount),
        quantity: toIntOrNull(quantity),
        unit: unit.trim() || null,
        source,
        disbursedAt: todayIso(),
        notes: notes.trim() || null,
      });
      setSavedId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ المساعدة');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Card>
          <Heading>تسجيل مساعدة</Heading>
          {error ? <Notice text={error} tone="danger" /> : null}
          {savedId ? <Notice text="تم حفظ المساعدة على الهاتف." tone="success" /> : null}

          {beneficiaries.length === 0 ? (
            <Notice tone="warning" text="لا يوجد مستفيدون لهذه الأسرة — أضف مستفيداً أولاً." />
          ) : (
            <Chips
              label="المستفيد"
              options={beneficiaries.map((b) => b.fullName)}
              value={beneficiaries.find((b) => b.id === beneficiaryId)?.fullName ?? null}
              onChange={(name) =>
                setBeneficiaryId(name ? beneficiaries.find((b) => b.fullName === name)?.id ?? null : null)
              }
            />
          )}

          <Chips label="نوع المساعدة" options={ASSISTANCE_TYPES} value={type} onChange={setType} />
          <Chips label="المصدر" options={ASSISTANCE_SOURCES} value={source} onChange={setSource} />
          <Field label="القيمة (د.أ)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} editable={!savedId} />
          <Field label="الكمية" keyboardType="number-pad" value={quantity} onChangeText={setQuantity} editable={!savedId} />
          <Field label="الوحدة" value={unit} onChangeText={setUnit} editable={!savedId} />
          <Field label="ملاحظات" multiline value={notes} onChangeText={setNotes} editable={!savedId} />

          {savedId ? (
            <Button title="إنهاء" onPress={() => navigation.goBack()} />
          ) : (
            <View>
              <Button title="حفظ المساعدة" onPress={handleSave} loading={saving} disabled={beneficiaries.length === 0} />
              <Button title="إلغاء" variant="secondary" onPress={() => navigation.goBack()} />
            </View>
          )}
          <Body muted>
            المساعدات المسجلة من الهاتف لا تخصم من المخزون — يتم ربطها بالمخزون في الكمبيوتر بعد
            الاستيراد.
          </Body>
        </Card>
        {savedId ? <AttachmentsPanel entityType="assistances" entityId={savedId} /> : null}
      </ScrollView>
    </Screen>
  );
}

// ── Beneficiary ──────────────────────────────────────────────────────────────

export function BeneficiaryFormScreen() {
  const route = useRoute<RouteProp<FieldStackParams, 'BeneficiaryForm'>>();
  const navigation = useNavigation();
  const { familyId } = route.params;

  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    if (fullName.trim().length < 2) {
      setError('اسم المستفيد مطلوب');
      return;
    }
    setSaving(true);
    try {
      await createBeneficiary({
        familyId,
        fullName: fullName.trim(),
        nationalId: nationalId.trim() || null,
        phone: phone.trim() || null,
        birthDate: birthDate.trim() || null,
        gender,
        category,
        notes: notes.trim() || null,
      });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ المستفيد');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Card>
          <Heading>مستفيد جديد</Heading>
          {error ? <Notice text={error} tone="danger" /> : null}
          <Field label="الاسم الكامل" required value={fullName} onChangeText={setFullName} />
          <Field label="الرقم الوطني" keyboardType="number-pad" value={nationalId} onChangeText={setNationalId} />
          <Field label="الهاتف" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          <Field label="تاريخ الميلاد (YYYY-MM-DD)" placeholder="1990-01-01" value={birthDate} onChangeText={setBirthDate} />
          <Chips label="الجنس" options={GENDERS} value={gender} onChange={setGender} />
          <Chips label="الفئة" options={BENEFICIARY_CATEGORIES} value={category} onChange={setCategory} />
          <Field label="ملاحظات" multiline value={notes} onChangeText={setNotes} />
          <Button title="حفظ" onPress={handleSave} loading={saving} />
          <Button title="إلغاء" variant="secondary" onPress={() => navigation.goBack()} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

/** Shared empty-state used by the list tabs when nothing has been entered. */
export function NothingYet({ text }: { text: string }) {
  return <Empty text={text} />;
}
