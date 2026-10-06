export type SessionMode = 'guest' | 'authenticated' | 'unauthenticated';

export type SessionState =
  | { mode: 'guest'; userId: string }
  | { mode: 'authenticated'; userId: string }
  | { mode: 'unauthenticated' };
