import { StyleSheet } from 'react-native';

export const colors = { ink: '#172033', muted: '#61708a', blue: '#155eef', pale: '#f1f5fb', line: '#dbe3ed', white: '#ffffff', green: '#176b4d', orange: '#a85d0a' };

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pale },
  topbar: { backgroundColor: colors.white, borderBottomColor: colors.line, borderBottomWidth: 1, paddingHorizontal: 18, paddingVertical: 14 },
  topbarInner: { width: '100%', maxWidth: 920, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 },
  brand: { color: colors.ink, fontSize: 18, fontWeight: '800', flexGrow: 1 },
  status: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  back: { color: colors.blue, fontSize: 15, fontWeight: '700' },
  page: { padding: 18, alignItems: 'center', paddingBottom: 50 },
  content: { width: '100%', maxWidth: 920, gap: 16 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '800', marginTop: 6 },
  message: { color: colors.muted, fontSize: 14 },
  card: { backgroundColor: colors.white, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: colors.line, gap: 12 },
  button: { backgroundColor: colors.blue, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  secondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  disabled: { opacity: 0.45 },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  secondaryText: { color: colors.ink },
  label: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 11, color: colors.ink, fontSize: 16, minHeight: 45 },
  body: { color: colors.ink, fontSize: 15, lineHeight: 21 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  section: { color: colors.ink, fontSize: 19, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
});
