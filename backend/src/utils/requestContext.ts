import { AsyncLocalStorage } from "async_hooks";

export interface RequestContextData {
  requestId: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContextData>();

export function getCurrentRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}
