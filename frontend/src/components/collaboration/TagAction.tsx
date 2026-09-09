"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { SourceText } from "@/components/i18n/SourceText";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
    <>
      <Button
        variant="outline"
        size={compact ? "icon" : undefined}
        title={compact ? sourceText("Tag user") : undefined}
        aria-label={sourceText("Tag user")}
        onClick={() => setOpen(true)}
      >
        <UserPlus className="h-4 w-4" />
        {!compact && <SourceText source="Tag user" leading trailing />}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="default">
          <DialogHeader>
            <DialogTitle>
              <SourceText source="Tag a colleague" />
            </DialogTitle>
            <DialogDescription>
              <SourceText source="They will see this record in Tagged for me, with your optional note." />
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block space-y-1.5 text-sm font-medium">
              <SourceText source="Choose a user" />
              <SearchableSelect
                value={user}
                onChange={setUser}
                placeholder={sourceText("Choose a user")}
                searchPlaceholder={sourceText("Search...")}
                options={users.map((item) => ({
                  value: item.id,
                  label: item.full_name,
                  hint: item.roles.join(", "),
                }))}
              />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              <SourceText source="Optional context" />
              <textarea
                value={message}
                maxLength={500}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={sourceText("Optional context")}
                className="min-h-24 w-full rounded-lg border bg-background p-3 text-sm"
              />
            </label>
            {rows.length > 0 && (
              <div className="rounded-xl border bg-muted/40 p-3">
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
          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
