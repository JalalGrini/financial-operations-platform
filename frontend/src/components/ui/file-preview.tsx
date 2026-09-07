
"use client";
import React from "react";
import { createPortal } from "react-dom";
import { X, Download, FileText, FileSpreadsheet, FileImage, File } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { sourceText } from "@/lib/i18n/source-catalog";
const PREVIEWABLE_IMAGES = ["image/jpeg","image/png","image/gif","image/webp","image/bmp","image/svg+xml"];
const PREVIEWABLE_PDF = ["application/pdf"];
const PREVIEWABLE_TEXT = ["text/plain","text/csv"];

function getTypeInfo(mimeType: string, fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (PREVIEWABLE_IMAGES.includes(mimeType) || ["jpg","jpeg","png","gif","webp","bmp","svg"].includes(ext)) return "image";
  if (PREVIEWABLE_PDF.includes(mimeType) || ext === "pdf") return "pdf";
  if (["csv"].includes(ext) || mimeType === "text/csv") return "csv";
  if (PREVIEWABLE_TEXT.includes(mimeType) || ext === "txt") return "text";
  if (["xlsx","xls"].includes(ext) || mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "excel";
  if (["docx","doc"].includes(ext) || mimeType.includes("wordprocessing") || mimeType.includes("msword")) return "word";
  return "unknown";
}

interface FilePreviewProps {
  url: string;
  fileName: string;
  mimeType?: string;
  className?: string;
  showDownload?: boolean;
}

export function FilePreview({ url, fileName, mimeType = "", className, showDownload = true }: FilePreviewProps) {
  const type = getTypeInfo(mimeType, fileName);

  return (
    <div className={cn("rounded-xl border border-border bg-muted/30 overflow-hidden", className)}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background">
        <div className="flex items-center gap-2 text-sm font-medium truncate">
          {type === "image" && <FileImage className="h-4 w-4 text-blue-500 shrink-0" />}
          {type === "pdf" && <FileText className="h-4 w-4 text-red-500 shrink-0" />}
          {(type === "excel" || type === "csv" || type === "text") && <FileSpreadsheet className="h-4 w-4 text-green-500 shrink-0" />}
          {type === "word" && <FileText className="h-4 w-4 text-blue-600 shrink-0" />}
          {type === "unknown" && <File className="h-4 w-4 text-muted-foreground shrink-0" />}
          <span className="truncate">{fileName}</span>
        </div>
        {showDownload && (
          <a href={url} download={fileName} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost" className="gap-1.5 text-xs shrink-0">
              <Download className="h-3.5 w-3.5" />
              {sourceText("Download")}
            </Button>
          </a>
        )}
      </div>

      <div className="p-3">
        {type === "image" && (
          <img src={url} alt={fileName} className="max-h-[500px] mx-auto rounded-lg object-contain" />
        )}
        {type === "pdf" && (
          <embed src={url} type="application/pdf" className="w-full h-[500px] rounded-lg" />
        )}
        {(type === "text" || type === "csv") && (
          <iframe src={url} className="w-full h-64 rounded-lg border border-border bg-background text-sm font-mono" title={fileName} />
        )}
        {type === "excel" && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <FileSpreadsheet className="h-12 w-12 text-green-500" />
            <p className="text-sm text-muted-foreground max-w-xs">
              Excel preview not available — download the file to view it.
            </p>
            <a href={url} download={fileName}>
              <Button size="sm" className="gap-1.5">
                <Download className="h-4 w-4" />
                {sourceText("Download")}
              </Button>
            </a>
          </div>
        )}
        {type === "word" && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <FileText className="h-12 w-12 text-blue-600" />
            <p className="text-sm text-muted-foreground max-w-xs">
              {sourceText("Word documents cannot be rendered in the browser. Download to view.")}
            </p>
            <a href={url} download={fileName}>
              <Button size="sm" className="gap-1.5"><Download className="h-4 w-4" />Download {fileName}</Button>
            </a>
          </div>
        )}
        {type === "unknown" && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <File className="h-12 w-12 text-muted-foreground" />
            {/* JSX text is not a JS string literal, so the previous `Can\'t`
                rendered the backslash verbatim. */}
            <p className="text-sm text-muted-foreground">Can&apos;t render this file type in the browser.</p>
            <a href={url} download={fileName}>
              <Button size="sm" variant="outline" className="gap-1.5"><Download className="h-4 w-4" />{sourceText("Download")}</Button>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

interface FilePreviewModalProps {
  url: string;
  fileName: string;
  mimeType?: string;
  onClose: () => void;
}

/**
 * Portalled for the same reason as ConfirmDialog: `position: fixed` resolves
 * against the nearest transformed ancestor, and ProtectedLayout wraps every page
 * in a framer-motion `motion.div` that animates `y`. Rendered inline, this
 * "full screen" preview was actually sized and centred to the page content box.
 * createPortal moves it to document.body, outside that transformed subtree.
 */
export function FilePreviewModal({ url, fileName, mimeType, onClose }: FilePreviewModalProps) {
  // Escape should close a full-screen preview; it previously only closed on a
  // backdrop click.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={fileName}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-auto rounded-2xl bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 rounded-full p-1.5 bg-muted/80 hover:bg-muted transition-colors"
          aria-label={sourceText("Close preview")}
        >
          <X className="h-4 w-4" />
        </button>
        <FilePreview url={url} fileName={fileName} mimeType={mimeType} className="rounded-2xl border-0" />
      </div>
    </div>,
    document.body,
  );
}
