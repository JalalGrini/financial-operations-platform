"use client";

import React, { useRef, useState, type FC } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Camera, X } from "lucide-react";
import { sourceText } from "@/lib/i18n/source-catalog";

interface EmployeeAvatarProps {
  photo?: string | null;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  editable?: boolean;
  onPhotoChange?: (file: File) => void;
  onPhotoDelete?: () => void;
}

const sizeConfig = {
  xs: { container: "h-7 w-7", text: "text-[10px]", icon: 10 },
  sm: { container: "h-8 w-8", text: "text-xs", icon: 12 },
  md: { container: "h-10 w-10", text: "text-sm", icon: 14 },
  lg: { container: "h-12 w-12", text: "text-base", icon: 16 },
  xl: { container: "h-20 w-20", text: "text-2xl", icon: 24 },
};

// `as const` keeps each entry a 2-tuple; without it TypeScript widens them to
// string[], which does not satisfy getGradient's [string, string] return type.
const GRADIENT_PAIRS = [
  ["#6366f1", "#8b5cf6"],
  ["#0ea5e9", "#6366f1"],
  ["#10b981", "#0ea5e9"],
  ["#f59e0b", "#ef4444"],
  ["#ec4899", "#8b5cf6"],
  ["#14b8a6", "#10b981"],
  ["#f97316", "#f59e0b"],
  ["#6366f1", "#ec4899"],
] as const;

function getInitials(firstName?: string, lastName?: string, fullName?: string): string {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }
  if (fullName) {
    const parts = fullName.trim().split(" ") as [string, string];
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return fullName[0]?.toUpperCase() ?? "?";
  }
  return "?";
}

function getGradient(name: string): readonly [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENT_PAIRS[Math.abs(hash) % GRADIENT_PAIRS.length];
}

export const EmployeeAvatar: FC<EmployeeAvatarProps> = ({
  photo,
  firstName,
  lastName,
  fullName,
  size = "md",
  className,
  editable = false,
  onPhotoChange,
  onPhotoDelete,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const cfg = sizeConfig[size];
  const initials = getInitials(firstName, lastName, fullName);
  const name = fullName || `${firstName ?? ""}${lastName ?? ""}`;
  const [from, to] = getGradient(name || "EF");
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = Boolean(photo) && failedSrc !== photo;

  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <motion.div
        className={cn(
          "relative overflow-hidden rounded-full ring-2 ring-white/20",
          cfg.container,
        )}
        whileHover={editable ? { scale: 1.05 } : undefined}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        {showPhoto && photo ? (
          // Cookie-authenticated photo URLs must be a native <img>.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={name || "Employee"}
            className="h-full w-full object-cover"
            onError={() => setFailedSrc(photo)}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center font-semibold text-white select-none"
            style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
          >
            <span className={cfg.text}>{initials}</span>
          </div>
        )}

        {/* Editable overlay */}
        {editable && (
          <motion.div
            initial={{ opacity: 0 }}
            whileHover={{ opacity: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/50 cursor-pointer gap-0.5"
            onClick={() => fileRef.current?.click()}
          >
            <Camera size={cfg.icon} className="text-white" />
          </motion.div>
        )}
      </motion.div>

      {/* Delete button (only when editable + has photo) */}
      {editable && photo && onPhotoDelete && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
          onClick={onPhotoDelete}
          // Logical -end-, not -right-: this badge sits on the trailing corner,
          // which flips in Arabic.
          className="absolute -top-0.5 -end-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white shadow-md"
          title={sourceText("Remove photo")}
          aria-label={sourceText("Remove photo")}
        >
          <X size={8} strokeWidth={3} />
        </motion.button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            if (file.size > 5 * 1024 * 1024) return;
            onPhotoChange?.(file);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
};
