/** Bounds headers AND body consumption; never retries or follows command redirects. */
export async function boundedControlRequest(url: string, timeoutMs: number, init: RequestInit = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Control request deadline expired');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Control request timed out; delivery may be unknown. Do not automatically resend.'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const response = await fetch(url, { ...init, redirect: 'error', signal: controller.signal });
      const text = await response.text();
      return { ok: response.ok, status: response.status, text };
    })()]);
  } finally {
    clearTimeout(timer);
  }
}
