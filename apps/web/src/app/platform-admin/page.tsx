"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** `/platform-admin` redirects straight to the one section built in Stage 17 — Affiliates. */
export default function PlatformAdminHomePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/platform-admin/affiliates");
  }, [router]);
  return null;
}
