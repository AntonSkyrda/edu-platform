export type ApiResult = 'success' | 'error';

export interface ApiResponse<T> {
  status_code: number;
  detail: T;
  result: ApiResult;
}
