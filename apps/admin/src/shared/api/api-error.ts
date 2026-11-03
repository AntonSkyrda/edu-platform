export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'unknown';

type ApiErrorOptions = {
  kind: ApiErrorKind;
  status?: number;
  code?: string;
  messages?: string[];
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly messages: string[];

  constructor(message: string, options: ApiErrorOptions) {
    super(message);

    this.name = 'ApiError';
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.messages = options.messages ?? [message];
  }
}
