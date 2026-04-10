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
