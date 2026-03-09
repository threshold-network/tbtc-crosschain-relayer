export interface ResponseJson<T = unknown> {
  error: boolean | null;
  message: string | null;
  data: T;
}
