interface CloudflareEnv {
  DB: D1Database;
}

declare module '@cloudflare/next-on-pages' {
  export function getRequestContext<T = CloudflareEnv>(): {
    env: T;
    ctx: ExecutionContext;
    cf: IncomingRequestCfProperties;
  };
}

// D1Database type declaration for Cloudflare Workers
interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  error?: string;
  meta?: unknown;
}

interface D1PreparedQuery {
  bind(...params: unknown[]): D1PreparedQuery;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}

interface D1Database {
  prepare(query: string): D1PreparedQuery;
  dump(): Promise<ArrayBuffer>;
  batch<T = unknown>(statements: D1PreparedQuery[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1Result>;
}
