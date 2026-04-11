// Concurrency & Rate Limit Management for Cloudflare Edge Workers
// Prevents Worker CPU timeouts and API 429 Too Many Requests errors.
// NEVER use Promise.all() blindly on bulk tasks — always use processInBatches().

/**
 * Process an array of items in controlled batches with configurable concurrency.
 * Each batch waits for all items to complete before starting the next batch.
 *
 * @param items - Array of items to process
 * @param batchSize - Maximum number of concurrent operations per batch
 * @param processor - Async function to process each item
 * @param onBatchComplete - Optional callback after each batch completes (for progress tracking)
 * @returns Array of results in the same order as input items
 *
 * @example
 * // Scrape 50 URLs with max 5 concurrent requests
 * const results = await processInBatches(urls, 5, scrapeUrl);
 *
 * @example
 * // AI calls with max 3 concurrent (respecting rate limits)
 * const articles = await processInBatches(pages, 3, generateArticle, (done, total) => {
 *   console.log(`Progress: ${done}/${total}`);
 * });
 */
export async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T, index: number) => Promise<R>,
  onBatchComplete?: (completedCount: number, totalItems: number) => void
): Promise<R[]> {
  if (items.length === 0) return [];

  const results: R[] = [];
  const totalItems = items.length;

  for (let i = 0; i < totalItems; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((item, batchIndex) => {
        const globalIndex = i + batchIndex;
        return processor(item, globalIndex);
      })
    );
    results.push(...batchResults);

    // Report progress after each batch
    if (onBatchComplete) {
      onBatchComplete(Math.min(i + batchSize, totalItems), totalItems);
    }

    // Add a small delay between batches to avoid hammering APIs
    // This helps prevent 429 errors even within rate limits
    if (i + batchSize < totalItems) {
      await delay(200); // 200ms cooldown between batches
    }
  }

  return results;
}

/**
 * Process items in controlled batches, but SEQUENTIALLY within each batch.
 * Use this when order matters or when each item depends on the previous result.
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param onProgress - Optional progress callback
 * @returns Array of results in the same order as input items
 */
export async function processSequentially<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  onProgress?: (completedCount: number, totalItems: number) => void
): Promise<R[]> {
  const results: R[] = [];
  const totalItems = items.length;

  for (let i = 0; i < totalItems; i++) {
    const result = await processor(items[i], i);
    results.push(result);
    if (onProgress) {
      onProgress(i + 1, totalItems);
    }
  }

  return results;
}

/**
 * Retry a failing async operation with exponential backoff.
 * Essential for handling transient 429/500 errors from external APIs.
 *
 * @param fn - The async operation to attempt
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param baseDelay - Base delay in ms, doubled on each retry (default: 1000)
 * @returns The result of the successful operation
 * @throws The last error if all retries are exhausted
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on client errors (4xx) except 429
      if (error instanceof Error && isNonRetriableError(error.message)) {
        throw lastError;
      }

      if (attempt < maxRetries) {
        const backoffDelay = baseDelay * Math.pow(2, attempt);
        console.warn(
          `[Concurrency] Attempt ${attempt + 1}/${maxRetries + 1} failed. ` +
          `Retrying in ${backoffDelay}ms. Error: ${lastError.message}`
        );
        await delay(backoffDelay);
      }
    }
  }

  throw lastError!;
}

/**
 * Pre-configured batch sizes for different operation types.
 * These are optimized for Cloudflare Workers constraints:
 * - Worker CPU time limit: 50ms (free) / 30s (paid)
 * - Subrequest limit: 50 per invocation
 * - Memory limit: 128MB
 */
export const BATCH_SIZES = {
  /** Max concurrent LLM/AI API calls — limited to avoid 429s */
  AI_CALLS: 3,
  /** Max concurrent URL scraping requests — native fetch on Edge */
  URL_SCRAPING: 5,
  /** Max concurrent D1 database writes */
  DB_WRITES: 10,
  /** Max concurrent GSC API requests */
  GSC_API: 3,
} as const;

// ===== Internal Helpers =====

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error message indicates a non-retriable client error.
 * We retry on 429 (rate limit) and 5xx (server errors),
 * but NOT on 4xx client errors (bad request, unauthorized, etc.)
 */
function isNonRetriableError(message: string): boolean {
  // Match HTTP status codes in error messages like "OpenAI API error (401): ..."
  const statusMatch = message.match(/\((\d{3})\)/);
  if (statusMatch) {
    const status = parseInt(statusMatch[1], 10);
    // Retry on 429 (rate limit) and 5xx (server errors)
    // Don't retry on other 4xx (client errors)
    return status >= 400 && status < 500 && status !== 429;
  }
  return false;
}
