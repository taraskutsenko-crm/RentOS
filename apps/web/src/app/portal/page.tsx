"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { usePortalMe } from "../../hooks/use-portal-auth";

export default function PortalRootPage() {
  const router = useRouter();
  const { data, isLoading, isError } = usePortalMe();

  useEffect(() => {
    if (isLoading) {
      return;
    }
    router.replace(data ? "/portal/dashboard" : "/portal/login");
  }, [data, isLoading, isError, router]);

  return null;
}
