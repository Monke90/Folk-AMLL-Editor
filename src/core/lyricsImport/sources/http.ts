/** A failed request to a lyrics service. `status` is 0 for network errors and timeouts. */
export class ImportHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ImportHttpError'
  }
}

/** fetch with a timeout, turning failures into {@link ImportHttpError} */
export async function fetchChecked(
  url: string,
  service: string,
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(url, { signal: controller.signal })
  } catch (e) {
    console.error(`${service} request failed`, e)
    throw new ImportHttpError(
      controller.signal.aborted
        ? `${service} did not respond in time`
        : `Could not reach ${service}`,
      0,
    )
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok)
    throw new ImportHttpError(
      `${service} request failed: ${response.status} ${response.statusText}`.trim(),
      response.status,
    )
  return response
}
