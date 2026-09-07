import * as React from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// ---------------------------------------------------------------------------
// AvatarGroup -- stacked avatar pile for teams/owners
// Inspired by ui.watermelon.sh + 21st.dev avatar stack patterns
//
// Usage:
//   <AvatarGroup
//     avatars={[
//       { name: "Alice Martin", src: "/photos/alice.jpg" },
//       { name: "Bob Dupont" },
//       { name: "Carla Ng", src: "/photos/carla.jpg" },
//     ]}
//     max={3}
//   />
// ---------------------------------------------------------------------------

export interface AvatarMeta {
  name: string;
  src?: string;
  /** Override initials (defaults to first letters of each word in name) */
  initials?: string;
}

function getInitials(name: string, override?: string): string {
  if (override) return override.slice(0, 2).toUpperCase();
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Deterministic color from name so the same person always gets the same hue
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-orange-100 text-orange-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-700",
  "bg-teal-100 text-teal-700",
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash];
}

const sizeClass = {
  xs: "size-6 text-[9px]",
  sm: "size-8 text-xs",
  default: "size-9 text-sm",
  lg: "size-11 text-base",
};

const overlapClass = {
  xs: "-ms-1.5",
  sm: "-ms-2",
  default: "-ms-2.5",
  lg: "-ms-3",
};

export interface AvatarGroupProps {
  avatars: AvatarMeta[];
  max?: number;
  size?: "xs" | "sm" | "default" | "lg";
  className?: string;
}

export function AvatarGroup({
  avatars,
  max = 4,
  size = "default",
  className,
}: AvatarGroupProps) {
  const visible = avatars.slice(0, max);
  const overflow = avatars.length - max;

  return (
    <div
      className={cn("flex items-center", className)}
      title={avatars.map((a) => a.name).join(", ")}
    >
      {visible.map((avatar, idx) => (
        <Avatar
          key={idx}
          className={cn(
            "ring-2 ring-background",
            sizeClass[size],
            idx > 0 && overlapClass[size],
          )}
          title={avatar.name}
        >
          {avatar.src && (
            <AvatarImage src={avatar.src} alt={avatar.name} />
          )}
          <AvatarFallback
            className={cn("font-semibold text-[0.65em]", colorFor(avatar.name))}
          >
            {getInitials(avatar.name, avatar.initials)}
          </AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full ring-2 ring-background",
            "bg-muted text-muted-foreground font-semibold",
            sizeClass[size],
            overlapClass[size],
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SingleAvatar -- named avatar with label (for table cells, cards, etc.)
// ---------------------------------------------------------------------------

export interface SingleAvatarProps {
  name: string;
  src?: string;
  subtitle?: string;
  size?: "xs" | "sm" | "default";
  className?: string;
}

export function SingleAvatar({
  name,
  src,
  subtitle,
  size = "sm",
  className,
}: SingleAvatarProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Avatar className={cn("shrink-0", sizeClass[size])}>
        {src && <AvatarImage src={src} alt={name} />}
        <AvatarFallback
          className={cn("font-semibold text-[0.65em]", colorFor(name))}
        >
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
