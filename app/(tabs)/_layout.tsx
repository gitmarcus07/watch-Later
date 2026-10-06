import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const icons = {
  index: ['home-outline', 'home'],
  search: ['search-outline', 'search'],
  watchlist: ['bookmark-outline', 'bookmark'],
  watched: ['checkmark-circle-outline', 'checkmark-circle'],
  more: ['grid-outline', 'grid'],
} as const;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.accent,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarLabelStyle: { ...typography.caption, fontSize: 10, marginTop: 1, marginBottom: 3 },
      tabBarStyle: { height: 58 + insets.bottom, backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 5, paddingBottom: Math.max(6, insets.bottom), elevation: 0 },
      tabBarItemStyle: { borderRadius: radius.medium, marginHorizontal: spacing.xs },
      tabBarAccessibilityLabel: `${route.name} tab`,
      tabBarIcon: ({ color, focused, size }) => {
        const pair = icons[route.name as keyof typeof icons];
        return <Ionicons name={pair?.[focused ? 1 : 0] ?? 'ellipse-outline'} size={size + 1} color={color} />;
      },
    })}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="watchlist" options={{ title: 'Watchlist' }} />
      <Tabs.Screen name="watched" options={{ title: 'Watched' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
