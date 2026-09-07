"use client";

import Image from "next/image";
import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { Camera, Mail, ShieldCheck, User2 } from "lucide-react";

import { SourceText } from "@/components/i18n/SourceText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHero } from "@/components/ui/page-hero";
import { accountsApi } from "@/features/accounts/api";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, useExperience } from "@/lib/experience";
import { sourceText } from "@/lib/i18n/source-catalog";

export default function ProfilePage() {
  const auth = useAuth();
  if (!auth.user) return null;

  return (
    <ProfileEditor
      key={auth.user.id}
      user={auth.user}
      refetchUser={auth.refetchUser}
      changePassword={auth.changePassword}
    />
  );
}

type AuthState = ReturnType<typeof useAuth>;
type CurrentUser = NonNullable<AuthState["user"]>;

function formatProfileDateTime(
  value: string | null | undefined,
  locale: "en" | "fr" | "ar",
) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDate(date, locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ProfileEditor({
  user,
  refetchUser,
  changePassword,
}: {
  user: CurrentUser;
  refetchUser: AuthState["refetchUser"];
  changePassword: AuthState["changePassword"];
}) {
  const { locale, theme, setLocale, setTheme, t } = useExperience();
  const [firstName, setFirstName] = useState(user.first_name ?? "");
  const [lastName, setLastName] = useState(user.last_name ?? "");
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwords, setPasswords] = useState({
    current: "",
    next: "",
    confirm: "",
  });

  const initials =
    `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() ||
    (user.email?.[0] ?? "?").toUpperCase();

  const avatar = user.avatar_url
    ? `${user.avatar_url}?v=${avatarVersion}`
    : null;

  // `avatar_url` only tells us the row names a file, not that the file is still
  // in storage. When the fetch 404s we fall back to the initials tile rather
  // than leaving a broken-image glyph in a 112px frame.
  //
  // Recording WHICH src failed, instead of a boolean plus an effect to reset it,
  // means a new upload is retried automatically: the stored url simply stops
  // matching. The effect version tripped react-hooks/set-state-in-effect and
  // cost an extra render pass on every avatar change.
  const [failedAvatarSrc, setFailedAvatarSrc] = useState<string | null>(null);
  const showAvatar = Boolean(avatar) && failedAvatarSrc !== avatar;

  const save = async () => {
    setIsSavingProfile(true);
    try {
      await accountsApi.updateProfile({
        first_name: firstName,
        last_name: lastName,
      });
      await refetchUser();
      toast.success(sourceText("Profile updated"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : sourceText("Profile update failed"),
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const upload = async (file?: File) => {
    if (!file) return;
    try {
      await accountsApi.uploadAvatar(file);
      setAvatarVersion((version) => version + 1);
      await refetchUser();
      toast.success(sourceText("Profile picture updated"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : sourceText("Profile picture upload failed"),
      );
    }
  };

  const remove = async () => {
    try {
      await accountsApi.removeAvatar();
      setAvatarVersion((version) => version + 1);
      await refetchUser();
      toast.success(sourceText("Profile picture removed"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : sourceText("Profile picture removal failed"),
      );
    }
  };

  const change = async () => {
    if (passwords.next !== passwords.confirm) {
      toast.error(sourceText("New passwords do not match"));
      return;
    }

    setIsSavingPassword(true);
    try {
      await changePassword(
        passwords.current,
        passwords.next,
        passwords.confirm,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : sourceText("Password change failed"),
      );
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHero
        icon={User2}
        eyebrow="Identity & security"
        title={sourceText("My Profile")}
        description="Manage self-service identity fields, profile picture, preferences, and password."
      />

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-primary/12 via-sky-100/70 to-amber-100/60 px-6 py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative">
                {showAvatar && avatar ? (
                  <Image
                    src={avatar}
                    alt={sourceText("Profile")}
                    width={112}
                    height={112}
                    unoptimized
                    onError={() => setFailedAvatarSrc(avatar)}
                    className="h-28 w-28 rounded-3xl border-4 border-white object-cover shadow-xl"
                  />
                ) : (
                  <div className="grid h-28 w-28 place-items-center rounded-3xl border-4 border-white bg-primary text-3xl font-semibold text-primary-foreground shadow-xl">
                    {initials}
                  </div>
                )}
                <label className="absolute -bottom-2 -right-2 flex cursor-pointer items-center justify-center rounded-full border bg-background p-2 shadow-md transition hover:bg-accent">
                  <Camera className="h-4 w-4" />
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(event) => upload(event.target.files?.[0])}
                  />
                </label>
              </div>

              <div className="space-y-2">
                <div>
                  <h2 className="text-2xl font-semibold text-foreground">
                    {user.full_name || user.email}
                  </h2>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(user.roles || []).map((role) => (
                    <Badge key={role} variant="secondary">
                      {role}
                    </Badge>
                  ))}
                  {user.must_change_password ? (
                    <Badge variant="destructive">
                      <SourceText source="Password change required" />
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={remove} disabled={!avatar}>
                <SourceText source="Remove picture" leading trailing />
              </Button>
              <Button onClick={save} disabled={isSavingProfile}>
                <SourceText source="Save profile" leading trailing />
              </Button>
            </div>
          </div>
        </div>

        <CardContent className="grid gap-6 pt-6 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first_name">
                  <SourceText source="First name" />
                </Label>
                <Input
                  id="first_name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">
                  <SourceText source="Last name" />
                </Label>
                <Input
                  id="last_name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <InfoPanel
                icon={<Mail className="h-4 w-4" />}
                label={sourceText("Email")}
                value={user.email}
              />
              <InfoPanel
                icon={<User2 className="h-4 w-4" />}
                label={sourceText("Full name")}
                value={
                  user.full_name || `${firstName} ${lastName}`.trim() || "—"
                }
              />
            </div>

            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>
                  <SourceText source="Profile preferences" />
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-language">
                    <SourceText source="Preferred language" />
                  </Label>
                  <select
                    id="profile-language"
                    value={locale}
                    onChange={(event) =>
                      setLocale(event.target.value as typeof locale)
                    }
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="fr">{sourceText("French")}</option>
                    <option value="en">{sourceText("English")}</option>
                    <option value="ar">{sourceText("Arabic")}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-theme">
                    <SourceText source="Preferred theme" />
                  </Label>
                  <select
                    id="profile-theme"
                    value={theme}
                    onChange={(event) =>
                      setTheme(event.target.value as typeof theme)
                    }
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="light">{t("light")}</option>
                    <option value="dark">{t("dark")}</option>
                    <option value="system">{t("system")}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-error-redirect">
                    <SourceText source="403 redirect delay" />
                  </Label>
                  <select
                    id="profile-error-redirect"
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    defaultValue="2"
                  >
                    <option value="2">{sourceText("2 seconds")}</option>
                    <option value="3">{sourceText("3 seconds")}</option>
                    <option value="5">{sourceText("5 seconds")}</option>
                    <option value="0">{sourceText("Stay on page")}</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 md:col-span-2">
                  <input
                    type="checkbox"
                    id="show-404-details"
                    defaultChecked={false}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <Label htmlFor="show-404-details" className="cursor-pointer">
                    <SourceText source="Show technical details on error pages" />
                  </Label>
                </div>
                <p className="md:col-span-2 text-sm leading-6 text-muted-foreground">
                  <SourceText source="Display preferences are applied across navigation, dashboards and forms." />
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-2xl border bg-muted/30 p-4">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">
                <SourceText source="Account summary" />
              </h3>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">
                  <SourceText source="Roles" />
                </dt>
                <dd className="text-right font-medium">
                  {(user.roles || []).join(", ") || "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">
                  <SourceText source="Joined" />
                </dt>
                <dd className="font-medium">
                  {formatProfileDateTime(user.date_joined, locale)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">
                  <SourceText source="Last login" />
                </dt>
                <dd className="font-medium">
                  {formatProfileDateTime(user.last_login, locale)}
                </dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <SourceText source="Change password" />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="current_password">
              <SourceText source="Current password" />
            </Label>
            <Input
              id="current_password"
              type="password"
              value={passwords.current}
              onChange={(event) =>
                setPasswords({ ...passwords, current: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new_password">
              <SourceText source="New password" />
            </Label>
            <Input
              id="new_password"
              type="password"
              value={passwords.next}
              onChange={(event) =>
                setPasswords({ ...passwords, next: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm_password">
              <SourceText source="Confirm new password" />
            </Label>
            <Input
              id="confirm_password"
              type="password"
              value={passwords.confirm}
              onChange={(event) =>
                setPasswords({ ...passwords, confirm: event.target.value })
              }
            />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <Button onClick={change} disabled={isSavingPassword}>
              <SourceText source="Change password" leading trailing />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoPanel({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}
