import { cookies } from "next/headers";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  addIpBan,
  clearPinReports,
  loginAdmin,
  markPinSuspicious,
  removeIpBan,
} from "./actions";

export const dynamic = "force-dynamic";

type ModerationSummary = {
  pin_id?: string;
  approved?: boolean;
  safe?: boolean;
  reason?: string;
  error?: boolean;
};

function asModerationSummary(value: Json | null): ModerationSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as ModerationSummary;
}

function money(value: number) {
  return `$${value.toFixed(4)}`;
}

export default async function AdminPage() {
  const cookieStore = await cookies();
  const secret = cookieStore.get("admin_secret")?.value;
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret || secret !== adminSecret) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fbf9f6] p-4">
        <form
          className="w-full max-w-sm space-y-4 rounded-lg border border-black/10 bg-white p-6 shadow-xl"
          action={loginAdmin}
        >
          <h1 className="text-2xl font-bold">Admin Login</h1>
          <input
            type="password"
            name="password"
            placeholder="Password"
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm"
            required
          />
          <button
            type="submit"
            className="w-full rounded-md bg-[#16110d] px-3 py-2 text-sm font-bold text-white transition hover:bg-black/80"
          >
            Login
          </button>
        </form>
      </div>
    );
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return <main className="p-8">Supabase is not configured.</main>;
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    agentRunsResult,
    pinsActiveResult,
    pinsHiddenResult,
    pinsSuspiciousResult,
    listingsActiveResult,
    seekersActiveResult,
    matchesResult,
    emailsSentResult,
    recentModerationsResult,
    ipBansResult,
    recentReportsResult,
  ] = await Promise.all([
    supabase
      .from("agent_runs")
      .select("agent_type, cost_usd, input_tokens, output_tokens, ran_at")
      .gte("ran_at", thirtyDaysAgo.toISOString()),
    supabase
      .from("pins")
      .select("*", { count: "exact", head: true })
      .eq("is_hidden", false)
      .eq("is_suspicious", false),
    supabase
      .from("pins")
      .select("*", { count: "exact", head: true })
      .eq("is_hidden", true),
    supabase
      .from("pins")
      .select("*", { count: "exact", head: true })
      .eq("is_suspicious", true),
    supabase
      .from("listings")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("seekers")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabase.from("matches").select("*", { count: "exact", head: true }),
    supabase
      .from("matches")
      .select("*", { count: "exact", head: true })
      .not("email_sent_at", "is", null),
    supabase
      .from("agent_runs")
      .select("action_summary, ran_at")
      .eq("agent_type", "moderation")
      .order("ran_at", { ascending: false })
      .limit(20),
    supabase.from("ip_bans").select("*").order("banned_at", { ascending: false }),
    supabase
      .from("pins")
      .select("id, lat, lng, report_count, comment, is_hidden, is_suspicious")
      .gt("report_count", 0)
      .order("report_count", { ascending: false })
      .limit(20),
  ]);

  const agentRuns = agentRunsResult.data ?? [];
  const recentModerations = recentModerationsResult.data ?? [];
  const ipBans = ipBansResult.data ?? [];
  const recentReports = recentReportsResult.data ?? [];

  const agentStats = agentRuns.reduce(
    (acc, run) => {
      const current = acc[run.agent_type] ?? { runs: 0, cost: 0, tokens: 0 };
      current.runs += 1;
      current.cost += run.cost_usd ?? 0;
      current.tokens += (run.input_tokens ?? 0) + (run.output_tokens ?? 0);
      acc[run.agent_type] = current;
      return acc;
    },
    {} as Record<string, { runs: number; cost: number; tokens: number }>,
  );

  const dailyCosts = agentRuns.reduce(
    (acc, run) => {
      const day = run.ran_at.slice(0, 10);
      acc[day] = (acc[day] ?? 0) + (run.cost_usd ?? 0);
      return acc;
    },
    {} as Record<string, number>,
  );
  const maxDailyCost = Math.max(...Object.values(dailyCosts), 0.001);

  return (
    <div className="min-h-screen bg-[#fbf9f6] p-4 text-[#16110d] sm:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <h1 className="font-[var(--font-display)] text-3xl font-bold">
          Admin Dashboard
        </h1>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <Stat label="Active Pins" value={pinsActiveResult.count ?? 0} />
          <Stat label="Hidden" value={pinsHiddenResult.count ?? 0} />
          <Stat label="Suspicious" value={pinsSuspiciousResult.count ?? 0} />
          <Stat label="Listings" value={listingsActiveResult.count ?? 0} />
          <Stat label="Seekers" value={seekersActiveResult.count ?? 0} />
          <Stat label="Matches" value={matchesResult.count ?? 0} />
        </div>

        <section className="rounded-lg border border-black/10 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Agent Costs</h2>
              <p className="text-sm text-[#61584e]">
                Last 30 days, {emailsSentResult.count ?? 0} match emails sent.
              </p>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10">
                  <th className="pb-2 font-semibold">Agent</th>
                  <th className="pb-2 font-semibold">Runs</th>
                  <th className="pb-2 font-semibold">Tokens</th>
                  <th className="pb-2 text-right font-semibold">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {Object.entries(agentStats).map(([type, stats]) => (
                  <tr key={type}>
                    <td className="py-3 font-medium">{type}</td>
                    <td className="py-3">{stats.runs}</td>
                    <td className="py-3">{stats.tokens.toLocaleString()}</td>
                    <td className="py-3 text-right font-bold">
                      {money(stats.cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-2">
              {Object.entries(dailyCosts)
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(-14)
                .map(([day, cost]) => (
                  <div key={day} className="grid grid-cols-[84px_1fr_64px] items-center gap-2 text-xs">
                    <span className="text-[#61584e]">{day.slice(5)}</span>
                    <span className="h-2 rounded bg-[#eadfcb]">
                      <span
                        className="block h-2 rounded bg-[#16110d]"
                        style={{ width: `${Math.max(4, (cost / maxDailyCost) * 100)}%` }}
                      />
                    </span>
                    <span className="text-right font-bold">{money(cost)}</span>
                  </div>
                ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-bold">Recent Moderation</h2>
          <div className="space-y-3">
            {recentModerations.map((moderation, index) => {
              const summary = asModerationSummary(moderation.action_summary);
              if (!summary) return null;
              const approved = summary.approved ?? summary.safe ?? false;
              return (
                <div
                  key={`${moderation.ran_at}-${index}`}
                  className="flex gap-4 rounded-lg border border-black/5 bg-[#fbf9f6] p-4 text-sm"
                >
                  <div
                    className={`h-fit shrink-0 rounded-full px-2 py-1 text-xs font-bold ${
                      approved
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {approved ? "safe" : "unsafe"}
                  </div>
                  <div>
                    <p className="font-medium">Pin: {summary.pin_id ?? "unknown"}</p>
                    <p className="mt-1 text-[#61584e]">
                      Reason: {summary.reason ?? "No reason logged"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-bold">IP Bans</h2>
          <form action={addIpBan} className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              name="ip_or_hash"
              placeholder="IP address or existing SHA-256 hash"
              className="rounded-md border border-black/10 px-3 py-2 text-sm"
            />
            <input
              name="reason"
              placeholder="Reason"
              className="rounded-md border border-black/10 px-3 py-2 text-sm"
            />
            <button className="rounded-md bg-[#16110d] px-3 py-2 text-sm font-bold text-white">
              Add ban
            </button>
          </form>
          <div className="space-y-2">
            {ipBans.map((ban) => (
              <form
                key={ban.ip_hash}
                action={removeIpBan}
                className="flex items-center gap-3 rounded-md border border-black/5 bg-[#fbf9f6] p-3 text-sm"
              >
                <input type="hidden" name="ip_hash" value={ban.ip_hash} />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  {ban.ip_hash}
                </span>
                <span className="hidden text-[#61584e] sm:inline">
                  {ban.reason ?? "No reason"}
                </span>
                <button className="rounded border border-black/10 px-2 py-1 text-xs font-bold">
                  Remove
                </button>
              </form>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-bold">Recent Reports</h2>
          <div className="space-y-3">
            {recentReports.map((pin) => (
              <div
                key={pin.id}
                className="grid gap-3 rounded-lg border border-black/5 bg-[#fbf9f6] p-4 text-sm lg:grid-cols-[1fr_auto]"
              >
                <div>
                  <p className="font-mono text-xs text-[#61584e]">{pin.id}</p>
                  <p className="mt-1 font-semibold">
                    {pin.report_count} report{pin.report_count === 1 ? "" : "s"}
                    {pin.is_hidden ? " · hidden" : ""}
                    {pin.is_suspicious ? " · suspicious" : ""}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[#61584e]">
                    {pin.comment ?? "No comment"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <form action={markPinSuspicious}>
                    <input type="hidden" name="pin_id" value={pin.id} />
                    <button className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                      Mark suspicious
                    </button>
                  </form>
                  <form action={clearPinReports}>
                    <input type="hidden" name="pin_id" value={pin.id} />
                    <button className="rounded-md border border-black/10 px-3 py-2 text-xs font-bold">
                      Clear reports
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#61584e]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold">{value.toLocaleString("en-IN")}</p>
    </div>
  );
}
