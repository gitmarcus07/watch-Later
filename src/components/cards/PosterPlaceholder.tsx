import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { radius } from '@/theme';

export function PosterPlaceholder() {
  return <LinearGradient colors={['#41365C', '#25243A', '#171A24']} style={styles.poster}><View style={styles.glow} /><Ionicons name="film-outline" color="rgba(255,255,255,0.78)" size={34} /></LinearGradient>;
}

const styles = StyleSheet.create({ poster: { width: 142, height: 190, borderRadius: radius.large, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, glow: { position: 'absolute', top: -54, right: -32, width: 130, height: 130, borderRadius: radius.pill, backgroundColor: 'rgba(182,156,255,0.14)' }, });
