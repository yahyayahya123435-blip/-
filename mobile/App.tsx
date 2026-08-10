/**
 * غصون زهران - العمل الميداني
 *
 * A fully offline Android app for recording families, beneficiaries, social
 * assessments, field visits and assistances while away from the office. There
 * is no network code anywhere in this app: data lives in a local SQLite
 * database and leaves only through a transfer file the user shares by hand.
 */
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import { getDatabase } from './src/db/client';
import { LockScreen } from './src/screens/LockScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { FamiliesScreen } from './src/screens/FamiliesScreen';
import { FamilyDetailScreen } from './src/screens/FamilyDetailScreen';
import { TransferScreen } from './src/screens/TransferScreen';
import {
  AssessmentsScreen, AssistancesScreen, BeneficiariesScreen, VisitsScreen,
} from './src/screens/ListScreens';
import {
  AssessmentFormScreen, AssistanceFormScreen, BeneficiaryFormScreen, VisitFormScreen,
} from './src/screens/forms';
import { Loading, Notice, Screen } from './src/ui/components';
import { colors } from './src/ui/theme';
import type { FieldStackParams } from './src/navigation-types';

const Stack = createNativeStackNavigator<FieldStackParams>();
const Tab = createBottomTabNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: colors.brand },
  headerTintColor: '#ffffff',
  headerTitleAlign: 'center' as const,
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tab.Screen name="الرئيسية" component={HomeScreen} options={tabIcon('🏠')} />
      <Tab.Screen name="الأسر" component={FamiliesScreen} options={tabIcon('👪')} />
      <Tab.Screen name="المستفيدون" component={BeneficiariesScreen} options={tabIcon('🧑')} />
      <Tab.Screen name="الزيارات" component={VisitsScreen} options={tabIcon('🚗')} />
      <Tab.Screen name="البحث" component={AssessmentsScreen} options={tabIcon('📋')} />
      <Tab.Screen name="المساعدات" component={AssistancesScreen} options={tabIcon('🎁')} />
      <Tab.Screen name="النقل" component={TransferScreen} options={tabIcon('📤')} />
    </Tab.Navigator>
  );
}

function tabIcon(emoji: string) {
  return {
    tabBarIcon: ({ color }: { color: string }) => <Text style={{ fontSize: 18, color }}>{emoji}</Text>,
  };
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Open (and if needed create) the local database before anything renders,
    // so no screen ever queries a database that does not exist yet.
    getDatabase()
      .then(() => setReady(true))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'تعذر فتح قاعدة البيانات المحلية');
        setReady(true);
      });
  }, []);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <Screen>
          <Loading />
        </Screen>
      </SafeAreaProvider>
    );
  }

  if (error) {
    return (
      <SafeAreaProvider>
        <Screen>
          <Notice tone="danger" text={error} />
        </Screen>
      </SafeAreaProvider>
    );
  }

  if (!unlocked) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <LockScreen onUnlocked={() => setUnlocked(true)} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer>
        <Stack.Navigator screenOptions={screenOptions}>
          <Stack.Screen
            name="Tabs"
            component={Tabs}
            options={{ title: 'غصون زهران - العمل الميداني' }}
          />
          <Stack.Screen name="FamilyDetail" component={FamilyDetailScreen} options={{ title: 'ملف الأسرة' }} />
          <Stack.Screen name="VisitForm" component={VisitFormScreen} options={{ title: 'زيارة ميدانية' }} />
          <Stack.Screen name="AssessmentForm" component={AssessmentFormScreen} options={{ title: 'بحث اجتماعي' }} />
          <Stack.Screen name="AssistanceForm" component={AssistanceFormScreen} options={{ title: 'تسجيل مساعدة' }} />
          <Stack.Screen name="BeneficiaryForm" component={BeneficiaryFormScreen} options={{ title: 'مستفيد جديد' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
