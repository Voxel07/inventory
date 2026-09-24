import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useInventory } from './inventoryContext';
import { styles } from './theme';
import type { ReactNode } from 'react';

export function Button({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>
  </Pressable>;
}

export function Field(props: TextInputProps & { label: string }) {
  return <View style={{ gap: 6 }}><Text style={styles.label}>{props.label}</Text><TextInput {...props} placeholderTextColor="#8490a5" style={[styles.input, props.style]} /></View>;
}

export function Card({ children }: { children: ReactNode }) { return <View style={styles.card}>{children}</View>; }

export function Screen({ title, children, back = false }: { title: string; children: ReactNode; back?: boolean }) {
  const router = useRouter();
  const { online, queued, issues, message } = useInventory();
  return <View style={styles.root}>
    <View style={styles.topbar}><View style={styles.topbarInner}>
      {back && <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable>}
      <Text style={styles.brand}>ASH Inventory</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/sync')}><Text style={styles.status}>{online ? 'Online' : 'Offline'} · {queued} queued{issues.length ? ` · ${issues.length} issues` : ''}</Text></Pressable>
    </View></View>
    <ScrollView contentContainerStyle={styles.page}><View style={styles.content}>
      <Text style={styles.title}>{title}</Text>
      {!!message && <Text style={styles.message}>{message}</Text>}
      {children}
    </View></ScrollView>
  </View>;
}
