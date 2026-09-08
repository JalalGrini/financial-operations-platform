/** Shared upload caps. Backend copies live in apps.common.security. */

export const MAX_UPLOAD_FILES = 2;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const TICKET_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const TICKET_MAX_TOTAL_BYTES = 4 * 1024 * 1024;
export const TICKET_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

const TICKET_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const AUTH_UPLOAD_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
]);

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function validateTicketFiles(files: File[]): string | null {
  if (files.length > MAX_UPLOAD_FILES) {
    return "Too many files. Maximum is 2.";
  }
  let total = 0;
  for (const file of files) {
    if (file.size <= 0 || file.size > TICKET_MAX_FILE_BYTES) {
      return "Each file must be 2 MB or smaller.";
    }
    if (!TICKET_EXTENSIONS.has(fileExtension(file.name))) {
      return "This file type is not allowed. Use PDF, JPEG or PNG.";
    }
    total += file.size;
  }
  if (total > TICKET_MAX_TOTAL_BYTES) {
    return "Attachments together must be 4 MB or smaller.";
  }
  return null;
}

export function validateSingleUpload(
  file: File | null | undefined,
  extras?: { maxBytes?: number; extensions?: Set<string> },
): string | null {
  if (!file) return null;
  const maxBytes = extras?.maxBytes ?? MAX_FILE_BYTES;
  if (file.size <= 0 || file.size > maxBytes) {
    return "Each file must be 10 MB or smaller.";
  }
  const allowed = extras?.extensions ?? AUTH_UPLOAD_EXTENSIONS;
  if (!allowed.has(fileExtension(file.name))) {
    return "This file type is not allowed.";
  }
  return null;
}
