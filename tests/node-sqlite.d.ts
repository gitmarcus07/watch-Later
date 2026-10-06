declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: (string | number | null)[]): object;
      all(...params: (string | number | null)[]): unknown[];
      get(...params: (string | number | null)[]): unknown;
    };
    close(): void;
  }
}
