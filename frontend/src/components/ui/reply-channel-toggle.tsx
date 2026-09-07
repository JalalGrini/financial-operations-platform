"use client";

import { Mail, MessageCircle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { SourceText } from "@/components/i18n/SourceText";

export type ReplyChannel = "email" | "sms" | "whatsapp";

const CHANNELS: Array<{
  value: ReplyChannel;
  label: string;
  icon: typeof Mail;
}> = [
  { value: "email", label: "Email", icon: Mail },
  { value: "sms", label: "SMS", icon: MessageSquare },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
];

interface ReplyChannelToggleProps {
  value: ReplyChannel;
  onChange: (value: ReplyChannel) => void;
  className?: string;
}

export function ReplyChannelToggle({
  value,
  onChange,
  className,
}: ReplyChannelToggleProps) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-center gap-2", className)}>
      <label className="text-sm font-medium">
        <SourceText source="Reply via" />
      </label>
      <div className="inline-flex rounded-lg border border-border p-0.5">
        {CHANNELS.map((channel) => {
          const Icon = channel.icon;
          const active = value === channel.value;
          return (
            <button
              key={channel.value}
              type="button"
              onClick={() => onChange(channel.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <SourceText source={channel.label} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
