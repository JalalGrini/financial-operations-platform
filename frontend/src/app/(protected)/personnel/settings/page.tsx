"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import React, { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Save, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PageHero } from "@/components/ui/page-hero";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { settingsApi } from "@/features/personnel/api";
import { ConfirmDialog } from "@/features/personnel/components/common";
export default function PersonnelSettingsPage() {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [settings, setSettings] = useState({
    // General
    defaultPageSize: "25",
    defaultDensity: "comfortable",
    showArchivedByDefault: false,
    autoRefreshInterval: "0",
    // Notifications
    emailOnArchive: true,
    emailOnRestore: false,
    emailOnPayrollApproval: true,
    emailOnCNSSSubmission: true,
    // Payroll
    defaultWorkingDays: 26,
    autoCalculatePayroll: false,
    requirePayrollApproval: true,
    // CNSS
    autoSubmitCNSS: false,
    cnssReminderDays: 5,
    // Security
    sessionTimeout: "30",
    requireMFA: false,
  });
  const handleChange = (key: string, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };
  // Load the stored preferences on mount; the GET response always contains
  // the complete shape (server-side defaults merged with stored values).
  useEffect(() => {
    let mounted = true;
    settingsApi
      .get()
      .then((preferences) => {
        if (mounted) {
          setSettings(preferences);
        }
      })
      .catch(() => {
        // Keep the built-in defaults if the load fails; the form stays usable.
        toast.error(
          sourceText("Failed to load settings \u2014 showing defaults"),
        );
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saved = await settingsApi.update(settings);
      setSettings(saved);
      toast.success(sourceText("Settings saved successfully"));
    } catch (error) {
      toast.error(sourceText("Failed to save settings"));
    } finally {
      setIsSaving(false);
    }
  };
  const handleReset = () => setResetConfirmOpen(true);
  const executeReset = async () => {
    setResetConfirmOpen(false);
    try {
      const defaults = await settingsApi.reset();
      setSettings(defaults);
      toast.success(sourceText("Settings reset to defaults"));
    } catch (error) {
      toast.error(sourceText("Failed to reset settings"));
    }
  };
  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb
        items={[
          {
            get label() {
              return sourceText("Personnel");
            },
            href: "/personnel/personnel",
          },
          {
            get label() {
              return sourceText("Settings");
            },
            isCurrent: true,
          },
        ]}
      />

      <PageHero
        icon={Save}
        eyebrow="Module configuration"
        title={sourceText("Personnel Settings")}
        description={sourceText("Configure personnel module preferences and defaults for your workspace.")}
        action={
          <Button
            variant="outline"
            onClick={handleReset}
          >
            <RefreshCw className="me-2 h-4 w-4" />
            <SourceText source="Reset to Defaults" leading trailing />
          </Button>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="space-y-6"
      >
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <SourceText source="Loading settings..." leading trailing />
          </div>
        )}
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle>
              <SourceText source="General Settings" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="defaultPageSize">
                  <SourceText source="Default Page Size" />
                </Label>
                <Select
                  value={settings.defaultPageSize}
                  onValueChange={(value) =>
                    handleChange("defaultPageSize", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={sourceText("Select page size")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">
                      <SourceText source="10 per page" />
                    </SelectItem>
                    <SelectItem value="25">
                      <SourceText source="25 per page" />
                    </SelectItem>
                    <SelectItem value="50">
                      <SourceText source="50 per page" />
                    </SelectItem>
                    <SelectItem value="100">
                      <SourceText source="100 per page" />
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultDensity">
                  <SourceText source="Default Table Density" />
                </Label>
                <Select
                  value={settings.defaultDensity}
                  onValueChange={(value) =>
                    handleChange("defaultDensity", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={sourceText("Select density")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comfortable">
                      <SourceText source="Comfortable" />
                    </SelectItem>
                    <SelectItem value="compact">
                      <SourceText source="Compact" />
                    </SelectItem>
                    <SelectItem value="dense">
                      <SourceText source="Dense" />
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="autoRefreshInterval">
                  <SourceText source="Auto Refresh Interval" leading trailing />
                </Label>
                <Select
                  value={settings.autoRefreshInterval}
                  onValueChange={(value) =>
                    handleChange("autoRefreshInterval", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={sourceText("Select interval")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">
                      <SourceText source="Disabled" />
                    </SelectItem>
                    <SelectItem value="30000">
                      <SourceText source="30 seconds" />
                    </SelectItem>
                    <SelectItem value="60000">
                      <SourceText source="1 minute" />
                    </SelectItem>
                    <SelectItem value="300000">
                      <SourceText source="5 minutes" />
                    </SelectItem>
                    <SelectItem value="600000">
                      <SourceText source="10 minutes" />
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>
                      <SourceText source="Show Archived by Default" />
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      <SourceText
                        source="Include archived records in list views"
                        leading
                        trailing
                      />
                    </p>
                  </div>
                  <Switch
                    checked={settings.showArchivedByDefault}
                    onCheckedChange={(checked) =>
                      handleChange("showArchivedByDefault", checked)
                    }
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>
              <SourceText source="Notifications" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  key: "emailOnArchive",
                  get label() {
                    return sourceText("Email on Archive");
                  },
                  get description() {
                    return sourceText("Notify when personnel is archived");
                  },
                },
                {
                  key: "emailOnRestore",
                  get label() {
                    return sourceText("Email on Restore");
                  },
                  get description() {
                    return sourceText("Notify when personnel is restored");
                  },
                },
                {
                  key: "emailOnPayrollApproval",
                  get label() {
                    return sourceText("Email on Payroll Approval");
                  },
                  get description() {
                    return sourceText("Notify when payroll is approved");
                  },
                },
                {
                  key: "emailOnCNSSSubmission",
                  get label() {
                    return sourceText("Email on CNSS Submission");
                  },
                  get description() {
                    return sourceText(
                      "Notify when CNSS declaration is submitted",
                    );
                  },
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <Label>{item.label}</Label>
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <Switch
                    checked={
                      settings[item.key as keyof typeof settings] as boolean
                    }
                    onCheckedChange={(checked) =>
                      handleChange(item.key, checked)
                    }
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Payroll Settings */}
        <Card>
          <CardHeader>
            <CardTitle>
              <SourceText source="Payroll Defaults" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="defaultWorkingDays">
                  <SourceText
                    source="Default Working Days per Month"
                    leading
                    trailing
                  />
                </Label>
                <Input
                  id="defaultWorkingDays"
                  type="number"
                  min="1"
                  max="31"
                  value={settings.defaultWorkingDays}
                  onChange={(e) =>
                    handleChange(
                      "defaultWorkingDays",
                      parseInt(e.target.value) || 26,
                    )
                  }
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>
                      <SourceText source="Auto Calculate Payroll" />
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      <SourceText
                        source="Automatically calculate when creating payroll records"
                        leading
                        trailing
                      />
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoCalculatePayroll}
                    onCheckedChange={(checked) =>
                      handleChange("autoCalculatePayroll", checked)
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>
                      <SourceText source="Require Payroll Approval" />
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      <SourceText
                        source="Payroll must be approved before payment"
                        leading
                        trailing
                      />
                    </p>
                  </div>
                  <Switch
                    checked={settings.requirePayrollApproval}
                    onCheckedChange={(checked) =>
                      handleChange("requirePayrollApproval", checked)
                    }
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CNSS Settings */}
        <Card>
          <CardHeader>
            <CardTitle>
              <SourceText source="CNSS Settings" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>
                      <SourceText source="Auto Submit CNSS" />
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      <SourceText
                        source="Automatically submit monthly CNSS declarations"
                        leading
                        trailing
                      />
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoSubmitCNSS}
                    onCheckedChange={(checked) =>
                      handleChange("autoSubmitCNSS", checked)
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cnssReminderDays">
                  <SourceText source="CNSS Reminder Days" />
                </Label>
                <Input
                  id="cnssReminderDays"
                  type="number"
                  min="1"
                  max="30"
                  value={settings.cnssReminderDays}
                  onChange={(e) =>
                    handleChange(
                      "cnssReminderDays",
                      parseInt(e.target.value) || 5,
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  <SourceText
                    source="Days before month-end to remind about CNSS submission"
                    leading
                    trailing
                  />
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card>
          <CardHeader>
            <CardTitle>
              <SourceText source="Security" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sessionTimeout">
                  <SourceText
                    source="Session Timeout (minutes)"
                    leading
                    trailing
                  />
                </Label>
                <Select
                  value={settings.sessionTimeout}
                  onValueChange={(value) =>
                    handleChange("sessionTimeout", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={sourceText("Select timeout")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">
                      <SourceText source="15 minutes" />
                    </SelectItem>
                    <SelectItem value="30">
                      <SourceText source="30 minutes" />
                    </SelectItem>
                    <SelectItem value="60">
                      <SourceText source="1 hour" />
                    </SelectItem>
                    <SelectItem value="120">
                      <SourceText source="2 hours" />
                    </SelectItem>
                    <SelectItem value="240">
                      <SourceText source="4 hours" />
                    </SelectItem>
                    <SelectItem value="480">
                      <SourceText source="8 hours" />
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>
                      <SourceText source="Require MFA for Personnel Module" />
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      <SourceText
                        source="Enforce multi-factor authentication"
                        leading
                        trailing
                      />
                    </p>
                  </div>
                  <Switch
                    checked={settings.requireMFA}
                    onCheckedChange={(checked) =>
                      handleChange("requireMFA", checked)
                    }
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4" />
            <SourceText source="Cancel" leading trailing />
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                <SourceText source="Saving..." leading trailing />
              </>
            ) : (
              <>
                <Save className="me-2 h-4 w-4" />
                <SourceText source="Save Settings" leading trailing />
              </>
            )}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        isOpen={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={executeReset}
        title={sourceText("Reset Settings")}
        description={sourceText("Are you sure you want to reset all settings to defaults?")}
        confirmLabel={sourceText("Reset")}
        variant="destructive"
        isLoading={false}
      />
    </div>
  );
}
import { SourceText } from "@/components/i18n/SourceText";
