"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { SourceText } from "@/components/i18n/SourceText";
import { Popover } from "@/components/ui/popover";
import { Combobox } from "@/components/ui/searchable-select";
import {
  collaborationApi,
  EligibleUser,
  Mention,
} from "@/features/collaboration/api";

function asUserList(payload: unknown): EligibleUser[] {
  if (Array.isArray(payload)) return payload;
  const obj = (payload ?? {}) as { results?: EligibleUser[] };
  return Array.isArray(obj.results) ? obj.results : [];
}

function asMentionList(payload: unknown): Mention[] {
  if (Array.isArray(payload)) return payload;
  const obj = (payload ?? {}) as { results?: Mention[] };
  return Array.isArray(obj.results) ? obj.results : [];
}

function looksLikeEmail(value: string): boolean {
  return value.includes("@");
}

/** First + last for the tag UI. Never promote an email to the primary label. */
function personLabel(person: {
  full_name?: string;
  first_name?: string;
  last_name?: string;
}): string {
  const composed = `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();
  for (const candidate of [person.full_name?.trim() ?? "", composed]) {
    if (candidate && !looksLikeEmail(candidate)) return candidate;
  }
  return "";
}

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
  const [user, setUser] = useState("");
  const [message, setMessage] = useState("");
  const taggingRef = useRef(false);

  const usersQuery = useQuery({
    queryKey: ["collaboration", "eligible-users"],
    queryFn: async () => asUserList(await collaborationApi.users()),
    enabled: open,
  });
  const mentions = useQuery({
    queryKey: ["mentions", "target", resourceType, targetId],
    queryFn: () => collaborationApi.targetMentions(resourceType, targetId),
    enabled: open,
  });

  const users = usersQuery.data ?? [];
  const options = useMemo(
    () =>
      users.map((item) => {
        const name = personLabel(item) || sourceText("Unnamed user");
        const roles = item.roles.join(", ");
        const hintParts = [roles];
        if (item.email && !looksLikeEmail(name)) hintParts.push(item.email);
        return {
          value: item.id,
          label: name,
          hint: hintParts.filter(Boolean).join(" · "),
        };
      }),
    [users],
  );

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
    onSettled: () => {
      taggingRef.current = false;
    },
  });
  const untag = useMutation({
    mutationFn: collaborationApi.untag,
    onSuccess: () => {
      refresh();
      toast.success(sourceText("Tag removed"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const apply = (userId: string) => {
    if (!userId || tag.isPending || taggingRef.current) return;
    taggingRef.current = true;
    tag.mutate({
      resource_type: resourceType,
      target_id: targetId,
      tagged_user: userId,
      message: message.trim(),
    });
  };

  const rows = asMentionList(mentions.data);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setUser("");
          setMessage("");
        }
      }}
      width={384}
      align="start"
      side="bottom"
      collisionPadding={8}
      overflow="visible"
      className="p-0"
      trigger={
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon" : undefined}
          title={compact ? sourceText("Tag user") : undefined}
          aria-label={sourceText("Tag user")}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <UserPlus className="h-4 w-4" />
          {!compact && <SourceText source="Tag user" leading trailing />}
        </Button>
      }
    >
      <div
        className="space-y-3 p-4"
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-1.5">
          <Combobox
            value={user}
            onChange={setUser}
            placeholder={sourceText("Choose a user")}
            searchPlaceholder={sourceText("Type to search")}
            emptyMessage={
              usersQuery.isLoading
                ? sourceText("Loading...")
                : users.length === 0
                  ? sourceText("No eligible users")
                  : sourceText("No match found")
            }
            options={options}
            ariaLabel={sourceText("Choose a user")}
          />
        </div>

        <textarea
          value={message}
          maxLength={500}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={sourceText("Optional context")}
          className="min-h-16 w-full rounded-lg border bg-background p-2 text-sm"
        />

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onPointerDown={(event) => {
              event.stopPropagation();
              setOpen(false);
            }}
          >
            <SourceText source="Cancel" leading trailing />
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!user || tag.isPending}
            loading={tag.isPending}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              apply(user);
            }}
          >
            <SourceText source="Tag" leading trailing />
          </Button>
        </div>

        {rows.length > 0 && (
          <div className="border-t pt-3">
            <p className="mb-2 text-sm font-medium">
              <SourceText source="Active tags" />
            </p>
            {rows.map((row) => {
              const name =
                personLabel({ full_name: row.tagged_user_name }) ||
                sourceText("Unnamed user");
              return (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-2 py-1 text-sm"
                >
                  <span className="truncate font-medium">{name}</span>
                  {row.can_untag && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={sourceText("Remove tag")}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        untag.mutate(row.id);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Popover>
  );
}
