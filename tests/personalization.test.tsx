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

describe('profile avatar', () => {
  afterEach(() => {
    useSessionStore.getState().setSession({ mode: 'guest', userId: 'guest-test' });
  });

  it('shows the guest person icon for guests', async () => {
    useSessionStore.getState().setSession({ mode: 'guest', userId: 'guest-1' });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<ProfileAvatar />); });
    const json = renderer.toJSON();
    expect(json).toMatchObject({ type: 'View' });
    expect(JSON.stringify(json)).not.toContain('Pressable');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Guest profile' })).toBeTruthy();
    renderer.unmount();
  });

  it('shows the email initial for signed-in users and is not a button', async () => {
    useSessionStore.getState().setSession({ mode: 'authenticated', userId: 'u-1', email: 'ada@example.com' });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<ProfileAvatar />); });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Your profile picture' })).toBeTruthy();
    expect(JSON.stringify(renderer.toJSON())).toContain('A');
    renderer.unmount();
  });

  it('falls back to the initial when a photo fails to load', async () => {
    useSessionStore.getState().setSession({ mode: 'authenticated', userId: 'u-1', email: 'ada@example.com' });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<ProfileAvatar photoUrl="https://invalid.example/photo.jpg" />); });
    const image = renderer.root.findByType(Image);
    await act(async () => { image.props.onError(); });
    expect(JSON.stringify(renderer.toJSON())).toContain('A');
    renderer.unmount();
  });

  it('updates immediately on sign-out', async () => {
    useSessionStore.getState().setSession({ mode: 'authenticated', userId: 'u-1', email: 'ada@example.com' });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<ProfileAvatar />); });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Your profile picture' })).toBeTruthy();
    await act(async () => { useSessionStore.getState().setSession({ mode: 'guest', userId: 'guest-2' }); });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Guest profile' })).toBeTruthy();
    renderer.unmount();
  });
});

describe('search empty state', () => {
  beforeEach(() => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unmocked network request blocked by personalization test'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('never names catalog providers and offers tappable suggestions', async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<QueryClientProvider client={queryClient}><SearchScreen /></QueryClientProvider>);
    });
    const text = JSON.stringify(renderer.toJSON());
    expect(text).toContain('Find something to watch tonight');
    expect(text).not.toMatch(/TMDb|AniList/);
    const input = renderer.root.findByProps({ accessibilityLabel: 'Search movies, shows and anime' });
    expect(input.props.value).toBe('');
    const chip = renderer.root.findByProps({ accessibilityLabel: 'Search for Dune' });
    await act(async () => { chip.props.onPress(); });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Search movies, shows and anime' }).props.value).toBe('Dune');
    await act(async () => { renderer.unmount(); });
  });
});
