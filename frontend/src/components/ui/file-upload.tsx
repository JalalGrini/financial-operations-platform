"use client";

import * as React from "react";
import { Upload, X, File, Image, FileText, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";

import { sourceText } from "@/lib/i18n/source-catalog";
// ---------------------------------------------------------------------------
// FileUpload -- drag-and-drop file upload zone
// Inspired by shadcnblocks.com + 21st.dev file-upload patterns
// ---------------------------------------------------------------------------

export interface FileUploadProps {
  /** Called when files are selected/dropped */
  onFilesChange: (files: File[]) => void;
  /** Accepted MIME types or extensions (e.g. "image/*,.pdf") */
  accept?: string;
  /** Allow multiple files */
  multiple?: boolean;
  /** Max file size in bytes (default 10 MB) */
  maxSize?: number;
  /** Max number of files */
  maxFiles?: number;
  /** List of already-selected files (for controlled usage) */
  value?: File[];
  className?: string;
  disabled?: boolean;
  label?: string;
  hint?: string;
  error?: string;
}

function FileIcon({ file }: { file: File }) {
  if (file.type.startsWith("image/")) return <Image className="size-4 text-blue-500" />;
  if (file.type === "application/pdf") return <FileText className="size-4 text-red-500" />;
  if (file.type.includes("spreadsheet") || file.name.endsWith(".xlsx") || file.name.endsWith(".csv"))
    return <FileSpreadsheet className="size-4 text-green-500" />;
  return <File className="size-4 text-muted-foreground" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUpload({
  onFilesChange,
  accept,
  multiple = false,
  maxSize = 10 * 1024 * 1024,
  maxFiles = 5,
  value,
  className,
  disabled,
  label = "Drop files here or click to upload",
  hint,
  error,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [files, setFiles] = React.useState<File[]>(value ?? []);
  const [sizeError, setSizeError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setSizeError(null);
    const oversized = arr.filter((f) => f.size > maxSize);
    if (oversized.length) {
      setSizeError(`File too large — max ${formatBytes(maxSize)}`);
      return;
    }
    const merged = multiple
      ? [...files, ...arr].slice(0, maxFiles)
      : arr.slice(0, 1);
    setFiles(merged);
    onFilesChange(merged);
  };

  const removeFile = (idx: number) => {
    const updated = files.filter((_, i) => i !== idx);
    setFiles(updated);
    onFilesChange(updated);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled) addFiles(e.dataTransfer.files);
  };

  const displayError = error || sizeError;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={sourceText("Upload files")}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && !disabled && inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed",
          "px-6 py-10 text-center transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isDragging
            ? "border-primary bg-primary/5 text-primary"
            : displayError
              ? "border-destructive bg-destructive/5"
              : "border-border bg-muted/20 hover:border-primary/40 hover:bg-primary/3",
          disabled && "cursor-not-allowed opacity-50 pointer-events-none",
        )}
      >
        <span
          className={cn(
            "grid size-12 place-items-center rounded-full border border-border bg-background shadow-sm",
            isDragging && "border-primary/40 bg-primary/10",
          )}
        >
          <Upload
            className={cn(
              "size-5 transition-transform",
              isDragging ? "text-primary -translate-y-0.5" : "text-muted-foreground",
            )}
          />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => e.target.files && addFiles(e.target.files)}
        disabled={disabled}
      />

      {/* Error */}
      {displayError && (
        <p className="text-xs font-medium text-destructive" role="alert">{displayError}</p>
      )}

      {/* File list */}
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((file, idx) => (
            <li
              key={idx}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
            >
              <FileIcon file={file} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{file.name}</p>
                <p className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  aria-label={`Remove ${file.name}`}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
