export type ArchiveState = "active" | "archived" | "all";

export function archiveStateForView(showArchived: boolean): ArchiveState {
  return showArchived ? "archived" : "active";
}

export function archiveActionForRow(row: {
  is_archived: boolean;
}): "archive" | "restore" {
  return row.is_archived ? "restore" : "archive";
}
