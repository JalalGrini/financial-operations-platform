"use client";

import { cn } from "@/lib/utils";
import { forwardRef, useEffect, useState } from "react";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
          className,
        )}
        {...props}
      />
    );
  },
);
Avatar.displayName = "Avatar";

interface AvatarImageProps extends React.HTMLAttributes<HTMLImageElement> {
  src?: string;
  alt?: string;
}

export const AvatarImage = forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ className, alt = "", src, ...props }, ref) => {
    // Unrenderable sources must disappear so the sibling AvatarFallback shows
    // through. Without this the <img> stayed in the layout on a 404 and the
    // browser painted its own broken-image glyph plus the alt text directly
    // over the initials placeholder - which is exactly what a user row
    // pointing at a profile picture that is no longer in storage produced.
    const [failed, setFailed] = useState(false);

    // A changed src deserves a fresh attempt rather than inheriting the last
    // failure (e.g. after re-uploading a photo, which the profile page signals
    // with a cache-busting ?v= suffix).
    useEffect(() => {
      setFailed(false);
    }, [src]);

    if (!src || failed) return null;

    return (
      // Avatar sources may be protected same-origin endpoints. A native image
      // keeps browser credentials and avoids a server-side optimization fetch.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={ref}
        alt={alt}
        src={src}
        onError={() => setFailed(true)}
        className={cn("aspect-square h-full w-full", className)}
        {...props}
      />
    );
  },
);
AvatarImage.displayName = "AvatarImage";

interface AvatarFallbackProps extends React.HTMLAttributes<HTMLDivElement> {
  delayMs?: number;
}

export const AvatarFallback = forwardRef<HTMLDivElement, AvatarFallbackProps>(
  ({ className, delayMs, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex h-full w-full items-center justify-center rounded-full bg-muted",
          className,
        )}
        {...props}
      />
    );
  },
);
AvatarFallback.displayName = "AvatarFallback";
