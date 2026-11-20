export class RequestError extends Error {}
export class GeminiResponseError extends Error {}

export class GeminiUnavailable extends Error {
  readonly status: number;
  readonly retryAfter: number;
  constructor(message: string, status: number, retryAfter: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function errorStatus(error: unknown) {
  if (error instanceof RequestError) return 400;
  if (error instanceof GeminiResponseError) return 502;
  if (error instanceof GeminiUnavailable) return error.status;
  return 500;
}
