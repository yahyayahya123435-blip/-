/**
 * Everything recorded about one family, and the entry points for recording
 * more. This is where a field worker spends most of a visit, so the actions
 * sit at the top rather than below the history.
 */
import React, { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Body, Button, Card, Empty, Heading, ListRow, Loading, Screen } from '../ui/components';
import {
  getFamily, listAssessments, listAssistances, listBeneficiaries, listVisits,
  type AssessmentRow, type AssistanceRow, type BeneficiaryRow, type FamilyRow, type VisitRow,
} from '../db/repository';
import type { FieldStackParams } from '../navigation-types';

export function FamilyDetailScreen() {
  const route = useRoute<RouteProp<FieldStackParams, 'FamilyDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<FieldStackParams>>();
  const { familyId } = route.params;

  const [family, setFamily] = useState<FamilyRow | null>(null);
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [assistances, setAssistances] = useState<AssistanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [f, b, v, a, s] = await Promise.all([
      getFamily(familyId),
      listBeneficiaries(familyId),
      listVisits(familyId),
      listAssessments(familyId),
      listAssistances(familyId),
    ]);
    setFamily(f);
    setBeneficiaries(b);
    setVisits(v);
    setAssessments(a);
    setAssistances(s);
    setLoading(false);
  }, [familyId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  if (!family) {
    return (
      <Screen>
        <Empty text="الأسرة غير موجودة" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView>
        <Card>
          <Heading>{family.headOfFamilyName}</Heading>
          {family.wifeName ? <Body>الزوجة: {family.wifeName}</Body> : null}
          <Body muted>الرقم الوطني: {family.headNationalId ?? 'غير مسجل'}</Body>
          <Body muted>أفراد دفتر العائلة: {family.familyBookMembersCount ?? 'غير مسجل'}</Body>
          <Body muted>الهاتف: {family.phone ?? '—'}</Body>
          <Body muted>الحي: {family.neighborhood ?? '—'}</Body>
          <Body muted>درجة الاحتياج: {family.needLevel ?? '—'}</Body>
          {family.dirty === 1 ? <Body muted>الحالة: لم يتم تصديرها إلى الكمبيوتر بعد</Body> : null}
        </Card>

        <Card>
          <Heading>تسجيل سريع</Heading>
          <Button title="+ زيارة ميدانية" onPress={() => navigation.navigate('VisitForm', { familyId })} />
          <Button title="+ بحث اجتماعي" onPress={() => navigation.navigate('AssessmentForm', { familyId })} />
          <Button title="+ مساعدة" onPress={() => navigation.navigate('AssistanceForm', { familyId })} />
          <Button title="+ مستفيد" variant="secondary" onPress={() => navigation.navigate('BeneficiaryForm', { familyId })} />
        </Card>

        <Card>
          <Heading>المستفيدون ({beneficiaries.length})</Heading>
          {beneficiaries.length === 0 ? (
            <Body muted>لا يوجد مستفيدون مسجلون</Body>
          ) : (
            beneficiaries.map((b) => (
              <ListRow key={b.id} title={b.fullName} subtitle={b.category ?? b.status} />
            ))
          )}
        </Card>

        <Card>
          <Heading>الزيارات ({visits.length})</Heading>
          {visits.length === 0 ? (
            <Body muted>لا توجد زيارات مسجلة</Body>
          ) : (
            visits.map((v) => (
              <ListRow
                key={v.id}
                title={v.purpose || 'زيارة ميدانية'}
                subtitle={`${v.visitDate.slice(0, 10)} — ${v.status}`}
              />
            ))
          )}
        </Card>

        <Card>
          <Heading>البحث الاجتماعي ({assessments.length})</Heading>
          {assessments.length === 0 ? (
            <Body muted>لا توجد بحوث اجتماعية</Body>
          ) : (
            assessments.map((a) => (
              <ListRow
                key={a.id}
                title={a.needLevel || 'بحث اجتماعي'}
                subtitle={a.assessmentDate.slice(0, 10)}
              />
            ))
          )}
        </Card>

        <Card>
          <Heading>المساعدات ({assistances.length})</Heading>
          {assistances.length === 0 ? (
            <Body muted>لا توجد مساعدات مسجلة</Body>
          ) : (
            assistances.map((a) => (
              <ListRow
                key={a.id}
                title={a.assistanceTypeName || 'مساعدة'}
                subtitle={`${a.disbursedAt.slice(0, 10)}${a.amountFils ? ` — ${(a.amountFils / 1000).toFixed(2)} د.أ` : ''}`}
              />
            ))
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}
