"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";
interface MobileMenuButtonProps {
  onClick: () => void;
}
export function MobileMenuButton({ onClick }: MobileMenuButtonProps) {
  return (
    <button
      className="lg:hidden p-2 rounded-lg hover:bg-accent transition-colors"
      onClick={onClick}
      aria-label={sourceText("Open menu")}
    >
      <Menu className="h-6 w-6" />
    </button>
  );
}
