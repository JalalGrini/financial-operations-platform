"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export function PublicInfoPage({
  titleSource,
  descriptionSource,
  children,
}: {
  titleSource: string;
  descriptionSource: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-3xl space-y-6 py-12">
        <Button asChild variant="outline">
          <Link href="/login">
            <ArrowLeft className="me-2 h-4 w-4" />
            <SourceText source="Back to sign in" leading trailing />
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <SourceText source={titleSource} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              <SourceText source={descriptionSource} />
            </p>
            {children}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
import { SourceText } from "@/components/i18n/SourceText";
