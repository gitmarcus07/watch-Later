import { useEffect, useState } from 'react';
import { Animated, BackHandler, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { create } from 'zustand';
import { AppButton } from '@/components/buttons/AppButton';
import { AppText } from '@/components/common/AppText';
import { colors, radius, shadows, spacing } from '@/theme';

export type DialogType = 'error' | 'warning' | 'info' | 'success';

export interface DialogAction {
  label: string;
  destructive?: boolean;
}

export interface DialogOptions {
  type: DialogType;
  title: string;
  message?: string;
  primaryAction?: DialogAction;
  secondaryAction?: DialogAction;
  /** Backdrop tap and Android back dismiss. Defaults to true. */
  dismissible?: boolean;
}

interface DialogRequest extends Required<Pick<DialogOptions, 'type' | 'title' | 'dismissible'>> {
  id: number;
  message: string;
  primaryAction: DialogAction;
  secondaryAction?: DialogAction;
  resolve: (confirmed: boolean) => void;
}

interface ToastState {
  id: number;
  message: string;
  type: DialogType;
  actionLabel?: string;
  durationMs?: number;
}

interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

const toastActions = new Map<number, () => void>();

interface DialogStore {
  queue: DialogRequest[];
  toast: ToastState | null;
  enqueue: (request: DialogRequest) => void;
  dismissCurrent: (confirmed: boolean) => void;
  notify: (message: string, type: DialogType, options?: ToastOptions) => void;
  clearToast: () => void;
}

let dialogId = 0;
let toastId = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3 ? normalized.split('').map((char) => char + char).join('') : normalized;
  const value = Number.parseInt(full.slice(0, 6), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${alpha})`;
}

const typeConfig: Record<DialogType, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  error: { icon: 'alert-circle', color: colors.error },
  warning: { icon: 'warning', color: colors.warning },
  info: { icon: 'information-circle', color: colors.accent },
  success: { icon: 'checkmark-circle', color: colors.success },
};

export const useDialogStore = create<DialogStore>((set) => ({
  queue: [],
  toast: null,
  enqueue: (request) => set((state) => ({ queue: [...state.queue, request] })),
  dismissCurrent: (confirmed) => set((state) => {
    const [current, ...rest] = state.queue;
    if (current) current.resolve(confirmed);
    return { queue: rest };
  }),
  notify: (message, type, options) => {
    if (toastTimer) clearTimeout(toastTimer);
    toastId += 1;
    const currentId = toastId;
    if (options?.onAction) toastActions.set(currentId, options.onAction);
    else toastActions.delete(currentId);
    set({ toast: { id: currentId, message, type, actionLabel: options?.actionLabel, durationMs: options?.durationMs } });
    toastTimer = setTimeout(() => useDialogStore.getState().clearToast(), options?.durationMs ?? 2600);
  },
  clearToast: () => {
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = undefined; }
    const current = useDialogStore.getState().toast;
    if (current) toastActions.delete(current.id);
    set({ toast: null });
  },
}));

/**
 * Shows a themed dialog. Resolves true when the primary action is pressed,
 * false when dismissed via secondary action, backdrop tap, or back button.
 * Only one dialog is visible at a time; extras wait in a queue.
 */
export function showDialog(options: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    dialogId += 1;
    useDialogStore.getState().enqueue({
      id: dialogId,
      type: options.type,
      title: options.title,
      message: options.message ?? '',
      primaryAction: options.primaryAction ?? { label: 'OK' },
      secondaryAction: options.secondaryAction,
      dismissible: options.dismissible ?? true,
      resolve,
    });
  });
}

/** Shows a small non-blocking toast that dismisses itself. */
export function showToast(message: string, type: DialogType = 'info', options?: ToastOptions): void {
  useDialogStore.getState().notify(message, type, options);
}

export function useDialog() {
  const dismissCurrent = useDialogStore((state) => state.dismissCurrent);
  const clearToast = useDialogStore((state) => state.clearToast);
  return { showDialog, showToast, hideDialog: () => dismissCurrent(false), hideToast: clearToast };
}

export function DialogCard({ request, content, onPrimary, onSecondary }: { request: Pick<DialogRequest, 'type' | 'title' | 'message' | 'primaryAction' | 'secondaryAction'>; content?: React.ReactNode; onPrimary: () => void; onSecondary: () => void }) {
  const config = typeConfig[request.type];
  return (
    <View style={styles.card} accessibilityRole="alert" accessibilityLabel={`${request.title}. ${request.message}`} accessibilityLiveRegion="assertive">
      <View style={[styles.iconCircle, { backgroundColor: hexToRgba(config.color, 0.14) }]}>
        <Ionicons name={config.icon} size={30} color={config.color} />
      </View>
      <AppText variant="heading3" style={styles.title}>{request.title}</AppText>
      {request.message ? <AppText variant="bodySmall" muted style={styles.message}>{request.message}</AppText> : null}
      {content}
      <View style={styles.actions}>
        {request.secondaryAction ? <View style={styles.actionButton}><AppButton label={request.secondaryAction.label} variant="secondary" onPress={onSecondary} /></View> : null}
        <View style={styles.actionButton}>
          {request.primaryAction.destructive
            ? <Pressable accessibilityRole="button" accessibilityLabel={request.primaryAction.label} onPress={onPrimary} style={({ pressed }) => [styles.destructive, pressed && styles.pressed]}><AppText variant="button" style={styles.destructiveLabel}>{request.primaryAction.label}</AppText></Pressable>
            : <AppButton label={request.primaryAction.label} onPress={onPrimary} />}
        </View>
      </View>
    </View>
  );
}

export function ToastCard({ toast }: { toast: ToastState }) {
  const config = typeConfig[toast.type];
  return (
    <View style={styles.toast} accessibilityRole="alert" accessibilityLabel={toast.message} accessibilityLiveRegion="polite">
      <Ionicons name={config.icon} size={17} color={config.color} />
      <AppText variant="bodySmall" style={styles.toastText} numberOfLines={2}>{toast.message}</AppText>
      {toast.actionLabel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={toast.actionLabel}
          onPress={() => {
            const action = toastActions.get(toast.id);
            useDialogStore.getState().clearToast();
            action?.();
          }}
          style={styles.toastAction}
        >
          <AppText variant="label" style={styles.toastActionText}>{toast.actionLabel}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function ActiveDialog({ request }: { request: DialogRequest }) {
  const dismissCurrent = useDialogStore((state) => state.dismissCurrent);
  const [fade] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(0.92));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [fade, scale, request.id]);

  useEffect(() => {
    if (!request.dismissible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      dismissCurrent(false);
      return true;
    });
    return () => subscription.remove();
  }, [dismissCurrent, request.dismissible, request.id]);

  return (
    <Modal transparent visible animationType="none" onRequestClose={() => { if (request.dismissible) dismissCurrent(false); }}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss dialog" onPress={() => { if (request.dismissible) dismissCurrent(false); }} style={StyleSheet.absoluteFill} />
        <Animated.View style={[styles.centered, { opacity: fade, transform: [{ scale }] }]}>
          <DialogCard request={request} onPrimary={() => dismissCurrent(true)} onSecondary={() => dismissCurrent(false)} />
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * Mount once at the app root. Renders the queued dialog (one at a time)
 * above everything — including the keyboard — plus the global toast.
 */
export function DialogProvider({ children }: { children: React.ReactNode }) {
  const current = useDialogStore((state) => state.queue[0]);
  const toast = useDialogStore((state) => state.toast);
  useEffect(() => () => useDialogStore.getState().clearToast(), []);
  return (
    <View style={styles.root}>
      {children}
      {current ? <ActiveDialog key={current.id} request={current} /> : null}
      {toast ? <View pointerEvents="box-none" style={styles.toastWrap}><View pointerEvents="auto" style={styles.toastPosition}><ToastCard toast={toast} /></View></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  centered: { width: '100%', maxWidth: 360 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: spacing.xl, alignItems: 'center', gap: spacing.md, ...shadows.glow },
  iconCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  title: { textAlign: 'center', color: colors.textPrimary },
  message: { textAlign: 'center', lineHeight: 21 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, width: '100%' },
  actionButton: { flex: 1 },
  destructive: { minHeight: 56, borderRadius: radius.button, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  destructiveLabel: { color: colors.background },
  pressed: { opacity: 0.82 },
  toastWrap: { position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: 108, alignItems: 'center' },
  toastPosition: { maxWidth: 420, width: '100%', alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, maxWidth: 420 },
  toastText: { color: colors.textPrimary, flexShrink: 1 },
  toastAction: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  toastActionText: { color: colors.accent },
});
