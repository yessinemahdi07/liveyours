import type { DeletableKind } from "./contracts";

export const DELETE_EVENT = "liveyours:delete";
export const REFRESH_EVENT = "liveyours:refresh";
export const PALETTE_EVENT = "liveyours:palette";
export const CAPTURE_EVENT = "liveyours:capture";

export interface DeletedItemNotice {
  kind: DeletableKind;
  id: number;
  label: string;
}

export function announceDeletedItem(detail: DeletedItemNotice) {
  window.dispatchEvent(new CustomEvent<DeletedItemNotice>(DELETE_EVENT, { detail }));
}

export function announceDataRefresh() {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}
