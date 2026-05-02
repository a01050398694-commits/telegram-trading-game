// Why: parallel collector orchestration with per-source timeout + structured failure tracking.
// Source: AskBit src/lib/chat/collectors/safe-collect.ts (read-only reference, ported verbatim).

export interface SafeResult<T> {
  data: T | null;
  source: string;
  elapsed: number;
  error?: string;
}

export interface CollectionMeta {
  collectedSources: string[];
  failedSources: { source: string; error: string }[];
  totalElapsed: number;
}

export async function safeCollect<T>(
  source: string,
  fn: () => Promise<T | null>,
  timeoutMs = 5000
): Promise<SafeResult<T>> {
  const start = Date.now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    return { data: result, source, elapsed: Date.now() - start };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[safe-collect] ${source} failed: ${message}`);
    return { data: null, source, elapsed: Date.now() - start, error: message };
  }
}

export function buildCollectionMeta(results: SafeResult<unknown>[]): CollectionMeta {
  const collectedSources: string[] = [];
  const failedSources: { source: string; error: string }[] = [];
  let maxElapsed = 0;

  for (const r of results) {
    if (r.elapsed > maxElapsed) maxElapsed = r.elapsed;
    if (r.error) {
      failedSources.push({ source: r.source, error: r.error });
    } else if (r.data !== null) {
      collectedSources.push(r.source);
    }
  }

  return { collectedSources, failedSources, totalElapsed: maxElapsed };
}
