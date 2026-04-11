interface CloudflareEnv {
  DB: D1Database;
  GSC_CLIENT_ID?: string;
  GSC_CLIENT_SECRET?: string;
}

declare module '@cloudflare/next-on-pages' {
  export function getRequestContext<T = CloudflareEnv>(): {
    env: T;
    ctx: ExecutionContext;
    cf: IncomingRequestCfProperties;
  };
}

// html2pdf.js type declaration
declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: Record<string, unknown>;
    jsPDF?: Record<string, unknown>;
    pagebreak?: Record<string, unknown>;
  }

  interface Html2PdfInstance {
    set(options: Html2PdfOptions): Html2PdfInstance;
    from(element: HTMLElement): Html2PdfInstance;
    save(): Promise<void>;
    toPdf(): Html2PdfInstance;
    output(type: string): Promise<unknown>;
  }

  function html2pdf(): Html2PdfInstance;
  export default html2pdf;
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
