"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus, X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { SourceText } from "@/components/i18n/SourceText";
import { Popover } from "@/components/ui/popover";
import {
  collaborationApi,
  EligibleUser,
  Mention,
} from "@/features/collaboration/api";

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

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

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return (parts[0]?.[0] ?? "?").toUpperCase();
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
  const [query, setQuery] = useState("");
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
  const filtered = useMemo(() => {
    const needle = fold(query.trim());
    if (!needle) return users;
    return users.filter((item) => {
      const haystack = fold(
        `${personLabel(item)} ${item.full_name} ${item.email} ${item.roles.join(" ")}`,
      );
      return needle.split(/\s+/).every((term) => haystack.includes(term));
    });
  }, [query, users]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["mentions"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
  const tag = useMutation({
    mutationFn: collaborationApi.tag,
    onSuccess: () => {
      refresh();
      setUser("");
      setQuery("");
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

  const rows = asMentionList(mentions.data);
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
  const chooseUser = (
    event: { preventDefault: () => void; stopPropagation: () => void },
    userId: string,
  ) => {
    // Parent Dialog/DismissableLayer preventDefault on pointerdown for
    // [data-efop-overlay], which cancels the following click. Nested overflow
    // containers also drop click on some browsers. Select and tag here.
    event.preventDefault();
    event.stopPropagation();
    setUser(userId);
    apply(userId);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
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
          <div className="flex items-center gap-2 rounded-lg border bg-background px-2">
            <Search
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={sourceText("Choose a user")}
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label={sourceText("Choose a user")}
            />
          </div>
          <ul
            role="listbox"
            aria-label={sourceText("Choose a user")}
            className="max-h-44 overflow-y-auto overscroll-contain rounded-lg border bg-background p-1"
          >
            {usersQuery.isLoading && (
              <li className="px-2 py-4 text-center text-xs text-muted-foreground">
                <SourceText source="Loading..." />
              </li>
            )}
            {!usersQuery.isLoading && filtered.length === 0 && (
              <li className="px-2 py-4 text-center text-xs text-muted-foreground">
                {users.length === 0 ? (
                  <SourceText source="No eligible users" />
                ) : (
                  <SourceText source="No match found" />
                )}
              </li>
            )}
            {filtered.map((item) => {
              const selected = item.id === user;
              const name = personLabel(item) || sourceText("Unnamed user");
              const roleHint = item.roles.join(", ");
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-label={name}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      chooseUser(event, item.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      chooseUser(event, item.id);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start transition-colors ${
                      selected
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300"
                      aria-hidden="true"
                    >
                      {initialsFor(name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {name}
                      </span>
                      {roleHint ? (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {roleHint}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
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
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold"
                      aria-hidden="true"
                    >
                      {initialsFor(name)}
                    </span>
                    <span className="truncate font-medium">{name}</span>
                  </span>
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
