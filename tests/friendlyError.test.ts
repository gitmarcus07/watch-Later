import { showFriendlyError, friendlyErrorMessage } from '@/lib/friendlyError';
import { AppError } from '@/domain/errors/AppError';
import { useDialogStore } from '@/components/feedback/AppDialog';
import { LOCAL_LIBRARY_PREP_NOTICE, EXISTING_ACCOUNT_NOTICE } from '@/features/auth/SupabaseAuthService';

/**
 * Every auth/sync/account failure must reach the user as a modal prompt whose
 * text names the specific problem — a silent catch or inline red text is a bug.
 */
describe('showFriendlyError', () => {
  beforeEach(() => { useDialogStore.setState({ queue: [], toast: null }); });

  it('shows the "Couldn\'t prepare this account\'s local library" text verbatim in a dialog', async () => {
    const shown = showFriendlyError(
      new AppError('database', "Couldn't prepare this account's local library."),
      "Couldn't prepare your library",
    );
    const request = useDialogStore.getState().queue[0];
    expect(request).toMatchObject({
      type: 'error',
      title: "Couldn't prepare your library",
      message: "Couldn't prepare this account's local library.",
      primaryAction: { label: 'OK' },
    });
    actDismiss(true);
    await expect(shown).resolves.toBe(true);
  });

  it('keeps user-authored notice copy intact (existing account / local-library notice)', () => {
    expect(friendlyErrorMessage(new AppError('validation', EXISTING_ACCOUNT_NOTICE))).toBe(EXISTING_ACCOUNT_NOTICE);
    expect(friendlyErrorMessage(new AppError('validation', LOCAL_LIBRARY_PREP_NOTICE))).toBe(LOCAL_LIBRARY_PREP_NOTICE);
  });

  it('never leaks raw internals for unknown errors', async () => {
    const shown = showFriendlyError(new Error('SELECT * FROM sqlite_master PANIC'), 'Something failed');
    expect(useDialogStore.getState().queue[0]?.message).not.toMatch(/sqlite_master|PANIC/);
    actDismiss(false);
    await expect(shown).resolves.toBe(false);
  });

  it('prefers an explicit message override when the caller supplies one', async () => {
    const shown = showFriendlyError(new Error('raw'), 'Sync failed', { message: 'Your library is safe — tap Sync now to try again.', actionLabel: 'Sync now' });
    expect(useDialogStore.getState().queue[0]).toMatchObject({
      message: 'Your library is safe — tap Sync now to try again.',
      primaryAction: { label: 'Sync now' },
    });
    actDismiss(true);
    await expect(shown).resolves.toBe(true);
  });

  it('never stacks two identical prompts for the same failure', async () => {
    const first = showFriendlyError(new AppError('database', "Couldn't prepare this account's local library."), 'Your library is still safe');
    const second = showFriendlyError(new AppError('database', "Couldn't prepare this account's local library."), 'Your library is still safe');
    expect(useDialogStore.getState().queue).toHaveLength(1);
    await expect(second).resolves.toBe(false);
    actDismiss(true);
    await expect(first).resolves.toBe(true);
  });
});

function actDismiss(confirmed: boolean) {
  useDialogStore.getState().dismissCurrent(confirmed);
}
