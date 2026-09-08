import Image from "next/image";
import { sourceText } from "@/lib/i18n/source-catalog";

export function Logo({
  size = 32,
  showText = true,
}: {
  size?: number;
  showText?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Image
        src="/brand/3rb-header-logo.png"
        alt={sourceText("Groupe 3RB")}
        width={160}
        height={36}
        priority
        className="object-contain"
        style={{
          height: size,
          width: showText ? "auto" : size,
          maxWidth: showText ? 160 : size,
        }}
      />
      {showText ? (
        <span className="truncate text-sm font-bold tracking-tight text-foreground">
          {sourceText("Groupe 3RB")}
        </span>
      ) : null}
    </div>
  );
}
