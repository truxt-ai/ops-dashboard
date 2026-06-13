export type AuditFixture = Record<string, unknown> | string;

export type TestApiClient = {
  readonly baseURL: string;
  start(): Promise<void>;
  cleanup(): Promise<void>;
  dashboardPath(pathname?: string): string;
};
