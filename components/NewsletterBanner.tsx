"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, X, Mail } from "lucide-react";
import { useState, useEffect } from "react";

export function NewsletterBanner() {
  const [email, setEmail] = useState("");
  const [show, setShow] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Only show if they haven't dismissed it this session
    if (!sessionStorage.getItem("newsletter_dismissed")) {
      const timer = setTimeout(() => setShow(true), 15000); // Show after 15s
      return () => clearTimeout(timer);
    }
  }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to sign up");
      }

      return res.json();
    },
    onSuccess: () => {
      setSuccess(true);
      sessionStorage.setItem("newsletter_dismissed", "true");
      setTimeout(() => setShow(false), 3000);
    },
  });

  const handleDismiss = () => {
    sessionStorage.setItem("newsletter_dismissed", "true");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 right-4 z-40 rounded-xl bg-[#16110d] p-4 text-white shadow-2xl sm:bottom-8 sm:left-8 sm:right-auto sm:w-[360px]">
      <button
        className="absolute right-2 top-2 rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
        type="button"
        onClick={handleDismiss}
      >
        <X size={16} />
      </button>

      {success ? (
        <div className="flex items-center gap-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <Mail size={16} />
          </div>
          <p className="text-sm font-medium">Thanks for subscribing!</p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <h3 className="pr-6 font-[var(--font-display)] text-lg font-bold">
            Stay in the loop
          </h3>
          <p className="mt-1 text-xs text-white/70">
            Get Bengaluru area rent trends delivered monthly.
          </p>

          <div className="mt-4 flex gap-2">
            <input
              required
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/20 focus:outline-none"
              placeholder="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              className="flex shrink-0 items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-bold text-[#16110d] transition hover:bg-white/90 disabled:opacity-50"
              disabled={mutation.isPending || !email}
              type="submit"
            >
              {mutation.isPending ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                "Subscribe"
              )}
            </button>
          </div>

          {mutation.error ? (
            <p className="mt-2 text-xs text-red-400">
              {mutation.error instanceof Error
                ? mutation.error.message
                : "Failed to subscribe"}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
