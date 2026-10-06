import { act, create } from 'react-test-renderer';
import { Image } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query/queryClient';
import { getGreeting, useGreeting } from '@/features/home/greeting';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { useSessionStore } from '@/store/app/sessionStore';
import SearchScreen from '../app/(tabs)/search';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()) },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
}));

jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'View' }));

afterEach(() => {
  queryClient.clear();
});

function at(hour: number, minute = 0): Date {
  return new Date(2026, 5, 15, hour, minute, 0, 0);
}

describe('time-based greeting', () => {
  it.each([
    [4, 59, 'Good night.'],
    [5, 0, 'Good morning.'],
    [11, 59, 'Good morning.'],
    [12, 0, 'Good afternoon.'],
    [16, 59, 'Good afternoon.'],
    [17, 0, 'Good evening.'],
    [20, 59, 'Good evening.'],
    [21, 0, 'Good night.'],
    [0, 0, 'Good night.'],
    [23, 30, 'Good night.'],
  ])('says %s at %i:%i', (hour, minute, expected) => {
    expect(getGreeting(at(hour, minute))).toBe(expected);
  });

  it('hook reflects the current device time', async () => {
    const Probe = () => <>{useGreeting()}</>;
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<Probe />); });
    expect(renderer.toJSON()).toBe(getGreeting(new Date()));
    await act(async () => { renderer.unmount(); });
  });
});
