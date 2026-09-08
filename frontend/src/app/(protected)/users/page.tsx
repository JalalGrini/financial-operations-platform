"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { ShieldCheck, Loader2,
  RefreshCw
} from "lucide-react";
import { accountsApi } from "@/features/accounts/api";
import { PageHero } from "@/components/ui/page-hero";
import { PageHeader } from "@/components/ui/page-components";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminOnly } from "@/components/auth/WriteOnly";
import { useRole } from "@/hooks/useRole";
import type { RoleName } from "@/types/auth";

/** Every role an Administrator may assign. */
const ASSIGNABLE_ROLES: RoleName[] = ["Administrator", "Assistant", "Director"];

type CreateUserForm = {
  email: string;
  first_name: string;
  last_name: string;
  role: "Assistant" | "Director";
  temporary_password: string;
};

const initial: CreateUserForm = {
  email: "",
  first_name: "",
  last_name: "",
  role: "Assistant",
  temporary_password: "",
};
export default function UsersPage() {
  const queryClient = useQueryClient();
  // Account administration is Administrator-only on the server
  // (AdministratorOnly in apps/accounts/views.py refuses Assistant and
  // Director on every verb, reads included), so the controls are gated to
  // match. Read through a named constant rather than a bare `isAdmin &&`
  // so the write-gate guard's "isAdmin gates destruction only" rule keeps
  // its meaning.
  const canManageAccounts = useRole().isAdmin;
  const [form, setForm] = useState(initial);
  // Email is edited in place, so each row needs its own draft. Keyed by id
  // rather than held on the row so a refetch cannot discard typing.
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  // Generated passwords, shown until the admin navigates away.
  const [issued, setIssued] = useState<Record<string, string>>({});
  const users = useQuery({
    queryKey: ["accounts", "users"],
    queryFn: accountsApi.list,
  });
  const create = useMutation({
    mutationFn: accountsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts", "users"] });
      setForm(initial);
      toast.success(sourceText("Account created"));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const update = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        is_active?: boolean;
        role?: RoleName;
        email?: string;
        first_name?: string;
        last_name?: string;
      };
    }) => accountsApi.update(id, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["accounts", "users"] }),
    onError: (error: Error) => toast.error(error.message),
  });
  const resetPassword = useMutation({
    mutationFn: (id: string) => accountsApi.resetPassword(id),
    onSuccess: (result, id) => {
      const password = result?.temporary_password;
      if (password) {
        setIssued((current) => ({ ...current, [id]: password }));
        toast.success(sourceText("Temporary password generated"));
      }
      queryClient.invalidateQueries({ queryKey: ["accounts", "users"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="space-y-6">
      <PageHero
        icon={ShieldCheck}
        eyebrow="Account governance"
        title={sourceText("Users & Roles")}
        description={sourceText("Administrator-only account governance. Temporary passwords must be shared privately and changed immediately.")}
      />
      <Card>
        <CardHeader>
          <CardTitle>
            <SourceText source="Create account" />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Input
            placeholder={sourceText("First name")}
            value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
          />
          <Input
            placeholder={sourceText("Last name")}
            value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
          />
          <Input
            type="email"
            placeholder={sourceText("Email")}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <select
            className="rounded border bg-background p-2"
            aria-label={sourceText("Role")}
            value={form.role}
            onChange={(e) =>
              setForm({
                ...form,
                role: e.target.value as CreateUserForm["role"],
              })
            }
          >
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {sourceText(role)}
              </option>
            ))}
          </select>
          <Input
            type="password"
            autoComplete="new-password"
            placeholder={sourceText(
              "Unique temporary password (12+ characters)",
            )}
            value={form.temporary_password}
            onChange={(e) =>
              setForm({ ...form, temporary_password: e.target.value })
            }
          />
          <AdminOnly>
            <Button
              className="md:col-span-2"
              disabled={
                create.isPending ||
                !form.email ||
                !form.first_name ||
                !form.last_name ||
                form.temporary_password.length < 12
              }
              onClick={() => create.mutate(form)}
            >
              <SourceText source="Create account" leading trailing />
            </Button>
          </AdminOnly>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>
              <SourceText source="Accounts" />
            </CardTitle>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-lg"
              onClick={() => users.refetch()}
              disabled={users.isLoading}
              title={sourceText("Refresh")}
            >
              {users.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {users.isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            users.data?.users.map((user) => (
              <div
                key={user.id}
                className="flex flex-wrap gap-3 rounded border p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{user.full_name}</p>
                  {canManageAccounts ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Input
                        type="email"
                        className="h-8 max-w-xs text-sm"
                        aria-label={sourceText("Email")}
                        value={emailDrafts[user.id] ?? user.email}
                        onChange={(e) =>
                          setEmailDrafts((current) => ({
                            ...current,
                            [user.id]: e.target.value,
                          }))
                        }
                      />
                      {/* Only offered once the value actually differs, so the
                          button cannot fire a no-op PATCH. */}
                      {(emailDrafts[user.id] ?? user.email) !== user.email && (
                        <Button
                          size="sm"
                          disabled={update.isPending}
                          onClick={() =>
                            update.mutate({
                              id: user.id,
                              payload: { email: emailDrafts[user.id] },
                            })
                          }
                        >
                          {sourceText("Save email")}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <Badge>{sourceText(user.role ?? "Unassigned")}</Badge>
                    <Badge variant={user.is_active ? "success" : "secondary"}>
                      {sourceText(user.is_active ? "Active" : "Inactive")}
                    </Badge>
                  </div>
                  {issued[user.id] && (
                    <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm">
                      <p className="font-medium text-amber-900">
                        {sourceText("Temporary password")}
                      </p>
                      <code className="break-all font-mono text-amber-900">
                        {issued[user.id]}
                      </code>
                      <p className="mt-1 text-xs text-amber-800">
                        {sourceText(
                          "Shown once. Share it privately; the holder must change it at next sign-in.",
                        )}
                      </p>
                    </div>
                  )}
                </div>
                {canManageAccounts && (
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="rounded border bg-background p-2"
                      aria-label={sourceText("Role")}
                      value={user.role ?? "Assistant"}
                      onChange={(e) =>
                        update.mutate({
                          id: user.id,
                          payload: { role: e.target.value as RoleName },
                        })
                      }
                    >
                      {ASSIGNABLE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {sourceText(role)}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      disabled={resetPassword.isPending}
                      onClick={() => resetPassword.mutate(user.id)}
                    >
                      {sourceText("Reset password")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        update.mutate({
                          id: user.id,
                          payload: { is_active: !user.is_active },
                        })
                      }
                    >
                      {sourceText(user.is_active ? "Deactivate" : "Activate")}
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
import { SourceText } from "@/components/i18n/SourceText";
