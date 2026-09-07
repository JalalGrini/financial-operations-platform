"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { SourceText } from "@/components/i18n/SourceText";
import {
  collaborationApi,
  EligibleUser,
  Mention,
} from "@/features/collaboration/api";
export function TagAction({
  resourceType,
  targetId,
  compact = false,
}: {
  resourceType: string;
  targetId: string;
  /** When true, renders only the icon button (no "Tag user" label). Use in table rows. */
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<EligibleUser[]>([]);
  const [user, setUser] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (open)
      collaborationApi
        .users()
        .then(setUsers)
        .catch((error) =>
          toast.error(
            error instanceof Error
              ? error.message
              : "Unable to load eligible users",
          ),
        );
  }, [open]);
  const mentions = useQuery({
    queryKey: ["mentions", "target", resourceType, targetId],
    queryFn: () => collaborationApi.targetMentions(resourceType, targetId),
    enabled: open,
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["mentions"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
  const tag = useMutation({
    mutationFn: collaborationApi.tag,
    onSuccess: () => {
      refresh();
      setUser("");
      setMessage("");
      toast.success(sourceText("User tagged"));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const untag = useMutation({
    mutationFn: collaborationApi.untag,
    onSuccess: () => {
      refresh();
      toast.success(sourceText("Tag removed"));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const rows: Mention[] = mentions.data?.results ?? mentions.data ?? [];
  return (
    <div className="relative">
      <Button
        variant="outline"
        size={compact ? "icon" : undefined}
        title={compact ? sourceText("Tag user") : undefined}
        onClick={() => setOpen(!open)}
      >
        <UserPlus className="h-4 w-4" />
        {!compact && <SourceText source="Tag user" leading trailing />}
      </Button>
      {open && (
        <div className="absolute end-0 z-40 mt-2 w-96 space-y-3 rounded border bg-popover p-4 shadow-xl">
          <select
            value={user}
            onChange={(event) => setUser(event.target.value)}
            className="w-full rounded border bg-background p-2"
          >
            <option value="">
              <SourceText source="Choose a user" />
            </option>
            {users.map((item) => (
              <option key={item.id} value={item.id}>
                {item.full_name} — {item.roles.join(", ")}
              </option>
            ))}
          </select>
          <textarea
            value={message}
            maxLength={500}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={sourceText("Optional context")}
            className="w-full rounded border bg-background p-2"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              <SourceText source="Cancel" leading trailing />
            </Button>
            <Button
              disabled={!user || tag.isPending}
              onClick={() =>
                tag.mutate({
                  resource_type: resourceType,
                  target_id: targetId,
                  tagged_user: user,
                  message,
                })
              }
            >
              <SourceText source="Tag" leading trailing />
            </Button>
          </div>
          {rows.length > 0 && (
            <div className="border-t pt-3">
              <p className="mb-2 text-sm font-medium">
                <SourceText source="Active tags" />
              </p>
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-2 py-1 text-sm"
                >
                  <span>{row.tagged_user_name}</span>
                  {row.can_untag && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove tag for ${row.tagged_user_name}`}
                      onClick={() => untag.mutate(row.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
