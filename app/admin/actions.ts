"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const cookieStore = await cookies();
  const secret = cookieStore.get("admin_secret")?.value;
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret || secret !== adminSecret) {
    throw new Error("Unauthorized");
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

export async function loginAdmin(formData: FormData) {
  const password = formData.get("password") as string;
  const adminSecret = process.env.ADMIN_SECRET;

  if (password === adminSecret) {
    const cookieStore = await cookies();
    cookieStore.set("admin_secret", password, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    redirect("/admin");
  } else {
    throw new Error("Invalid password");
  }
}

export async function markPinSuspicious(formData: FormData) {
  const supabase = await requireAdmin();
  const pinId = String(formData.get("pin_id") || "");
  if (!pinId) throw new Error("Missing pin_id");

  await supabase
    .from("pins")
    .update({ is_suspicious: true, updated_at: new Date().toISOString() })
    .eq("id", pinId);

  revalidatePath("/admin");
}

export async function clearPinReports(formData: FormData) {
  const supabase = await requireAdmin();
  const pinId = String(formData.get("pin_id") || "");
  if (!pinId) throw new Error("Missing pin_id");

  await supabase
    .from("pins")
    .update({
      report_count: 0,
      is_hidden: false,
      is_suspicious: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pinId);

  revalidatePath("/admin");
}

export async function addIpBan(formData: FormData) {
  const supabase = await requireAdmin();
  const rawIpOrHash = String(formData.get("ip_or_hash") || "").trim();
  const reason = String(formData.get("reason") || "").trim() || null;

  if (!rawIpOrHash) throw new Error("Missing IP/hash");

  const ipHash =
    /^[a-f0-9]{64}$/i.test(rawIpOrHash)
      ? rawIpOrHash.toLowerCase()
      : createHash("sha256")
          .update(
            `${process.env.IP_HASH_PEPPER || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "development-pepper"}:${rawIpOrHash}`,
          )
          .digest("hex");

  await supabase.from("ip_bans").upsert({
    ip_hash: ipHash,
    reason,
  });

  revalidatePath("/admin");
}

export async function removeIpBan(formData: FormData) {
  const supabase = await requireAdmin();
  const ipHash = String(formData.get("ip_hash") || "");
  if (!ipHash) throw new Error("Missing ip_hash");

  await supabase.from("ip_bans").delete().eq("ip_hash", ipHash);
  revalidatePath("/admin");
}
