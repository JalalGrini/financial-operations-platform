"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PersonnelIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/personnel/personnel");
  }, [router]);
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}
