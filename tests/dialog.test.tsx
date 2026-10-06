import { act, create } from 'react-test-renderer';
import { DialogCard, ToastCard, showDialog, showToast, useDialogStore } from '@/components/feedback/AppDialog';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('themed dialog system', () => {
  beforeEach(() => {
    useDialogStore.setState({ queue: [], toast: null });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows one dialog at a time and queues extras in order', () => {
    const first = showDialog({ type: 'error', title: 'First', message: 'one' });
    const second = showDialog({ type: 'info', title: 'Second', message: 'two' });
    expect(useDialogStore.getState().queue.map((request) => request.title)).toEqual(['First', 'Second']);
    let firstResult: boolean | undefined;
    void first.then((confirmed) => { firstResult = confirmed; });
    act(() => { useDialogStore.getState().dismissCurrent(true); });
    expect(useDialogStore.getState().queue.map((request) => request.title)).toEqual(['Second']);
    void second.then(() => undefined);
    act(() => { useDialogStore.getState().dismissCurrent(false); });
    expect(useDialogStore.getState().queue).toHaveLength(0);
    return expect(first).resolves.toBe(true).then(() => expect(firstResult).toBe(true));
  });

  it('resolves false when dismissed without confirming', async () => {
    const pending = showDialog({ type: 'warning', title: 'Delete list?', primaryAction: { label: 'Delete', destructive: true }, secondaryAction: { label: 'Cancel' } });
    act(() => { useDialogStore.getState().dismissCurrent(false); });
    await expect(pending).resolves.toBe(false);
  });

  it('replaces the toast and auto-dismisses it', () => {
    showToast('List created', 'success');
    expect(useDialogStore.getState().toast).toMatchObject({ message: 'List created', type: 'success' });
    showToast('Saved to list', 'success');
    expect(useDialogStore.getState().toast).toMatchObject({ message: 'Saved to list' });
    act(() => { jest.advanceTimersByTime(2600); });
    expect(useDialogStore.getState().toast).toBeNull();
  });

  it('renders an error dialog with a single OK action', async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<DialogCard request={{ type: 'error', title: "Couldn't update your library", message: "Couldn't update your watchlist. Try again.", primaryAction: { label: 'OK' } }} onPrimary={() => undefined} onSecondary={() => undefined} />);
    });
    const text = JSON.stringify(renderer.toJSON());
    expect(text).toContain("Couldn't update your library");
    expect(text).toContain('OK');
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'OK' }).length).toBeGreaterThanOrEqual(1);
    renderer.unmount();
  });

  it('renders confirm dialogs with a destructive primary action', async () => {
    let pressed = '';
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<DialogCard request={{ type: 'warning', title: 'Delete list?', message: 'Gone.', primaryAction: { label: 'Delete', destructive: true }, secondaryAction: { label: 'Cancel' } }} onPrimary={() => { pressed = 'delete'; }} onSecondary={() => { pressed = 'cancel'; }} />);
    });
    const labels = [renderer.root.findByProps({ accessibilityLabel: 'Delete' }), renderer.root.findByProps({ accessibilityLabel: 'Cancel' })];
    expect(labels).toHaveLength(2);
    act(() => { (labels[0].props as { onPress: () => void }).onPress(); });
    expect(pressed).toBe('delete');
    renderer.unmount();
  });

  it('renders toast content with its message', async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<ToastCard toast={{ id: 1, message: 'Added to watchlist', type: 'success' }} />);
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('Added to watchlist');
    renderer.unmount();
  });

  it('defaults to a single OK action when none is provided', () => {
    void showDialog({ type: 'info', title: 'Heads up', message: 'Just so you know.' });
    expect(useDialogStore.getState().queue[0]).toMatchObject({ primaryAction: { label: 'OK' }, dismissible: true });
    act(() => { useDialogStore.getState().dismissCurrent(true); });
  });
});
