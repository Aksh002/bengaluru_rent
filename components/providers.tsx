"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    const client = supabase;

    let cancelled = false;

    async function bootstrapAnonymousSession() {
      const {
        data: { session },
      } = await client.auth.getSession();

      if (!session && !cancelled) {
        await client.auth.signInAnonymously();
      }
    }

    void bootstrapAnonymousSession();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
