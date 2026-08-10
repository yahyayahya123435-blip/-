/**
 * Flat, cross-family lists for the remaining tabs. They exist so a field
 * worker can answer "what did I record today?" without walking through each
 * family, and to make unexported work visible.
 */
import React, { useCallback, useState } from 'react';
import { FlatList } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Empty, ListRow, Loading, Screen } from '../ui/components';
import {
  listAssessments, listAssistances, listBeneficiaries, listVisits,
  type AssessmentRow, type AssistanceRow, type BeneficiaryRow, type VisitRow,
} from '../db/repository';
import type { FieldStackParams } from '../navigation-types';

export function BeneficiariesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FieldStackParams>>();
  const [rows, setRows] = useState<BeneficiaryRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listBeneficiaries().then(setRows);
    }, []),
  );

  if (rows === null) return <Screen><Loading /></Screen>;
  if (rows.length === 0) return <Screen><Empty text="لا يوجد مستفيدون مسجلون بعد." /></Screen>;

  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ListRow
            title={item.fullName}
            subtitle={[item.category, item.phone].filter(Boolean).join(' • ') || item.status}
            onPress={() => navigation.navigate('FamilyDetail', { familyId: item.familyId })}
          />
        )}
      />
    </Screen>
  );
}

export function VisitsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FieldStackParams>>();
  const [rows, setRows] = useState<VisitRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listVisits().then(setRows);
    }, []),
  );

  if (rows === null) return <Screen><Loading /></Screen>;
  if (rows.length === 0) return <Screen><Empty text="لا توجد زيارات مسجلة بعد." /></Screen>;

  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ListRow
            title={item.purpose || 'زيارة ميدانية'}
            subtitle={`${item.visitDate.slice(0, 10)} — ${item.status}`}
            onPress={() => navigation.navigate('FamilyDetail', { familyId: item.familyId })}
          />
        )}
      />
    </Screen>
  );
}

export function AssessmentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FieldStackParams>>();
  const [rows, setRows] = useState<AssessmentRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listAssessments().then(setRows);
    }, []),
  );

  if (rows === null) return <Screen><Loading /></Screen>;
  if (rows.length === 0) return <Screen><Empty text="لا توجد بحوث اجتماعية مسجلة بعد." /></Screen>;

  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ListRow
            title={item.needLevel || 'بحث اجتماعي'}
            subtitle={item.assessmentDate.slice(0, 10)}
            onPress={() => navigation.navigate('FamilyDetail', { familyId: item.familyId })}
          />
        )}
      />
    </Screen>
  );
}

export function AssistancesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FieldStackParams>>();
  const [rows, setRows] = useState<AssistanceRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listAssistances().then(setRows);
    }, []),
  );

  if (rows === null) return <Screen><Loading /></Screen>;
  if (rows.length === 0) return <Screen><Empty text="لا توجد مساعدات مسجلة بعد." /></Screen>;

  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ListRow
            title={item.assistanceTypeName || 'مساعدة'}
            subtitle={`${item.disbursedAt.slice(0, 10)}${
              item.amountFils ? ` — ${(item.amountFils / 1000).toFixed(2)} د.أ` : ''
            }`}
            onPress={() => navigation.navigate('FamilyDetail', { familyId: item.familyId })}
          />
        )}
      />
    </Screen>
  );
}
