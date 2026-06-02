import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const revalidate = 86400; // Revalidate daily

const topNeighbourhoods = [
  "Koramangala",
  "Indiranagar",
  "HSR Layout",
  "Whitefield",
  "Electronic City",
  "Bellandur",
  "Marathahalli",
  "BTM Layout",
  "Jayanagar",
  "JP Nagar",
  "Yelahanka",
  "Malleshwaram",
  "Hebbal",
  "Banashankari",
  "Domlur",
  "Rajajinagar",
  "Basavanagudi",
  "Hennur",
  "Brookefield",
  "Sarjapur Road",
  "CV Raman Nagar",
  "Kalyan Nagar",
  "RT Nagar",
  "Frazer Town",
  "Malleswaram",
  "Vidyaranyapura",
  "Bannerghatta Road",
  "Kaggadasapura",
  "Mahadevapura",
  "Horamavu",
];

export async function generateStaticParams() {
  return topNeighbourhoods.map((name) => ({
    neighbourhood: name.toLowerCase().replace(/\s+/g, "-"),
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ neighbourhood: string }>;
}): Promise<Metadata> {
  const { neighbourhood } = await params;
  const name = topNeighbourhoods.find(
    (n) => n.toLowerCase().replace(/\s+/g, "-") === neighbourhood,
  );

  if (!name) return { title: "Not Found" };

  return {
    title: `Rent prices in ${name}, Bengaluru | bengaluru.rent`,
    description: `Check the latest average rent prices for 1BHK, 2BHK, and 3BHK flats in ${name}, Bengaluru. Real data from real tenants.`,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export default async function NeighbourhoodPage({
  params,
}: {
  params: Promise<{ neighbourhood: string }>;
}) {
  const { neighbourhood } = await params;
  const name = topNeighbourhoods.find(
    (n) => n.toLowerCase().replace(/\s+/g, "-") === neighbourhood,
  );

  if (!name) {
    notFound();
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) return <div>Database error</div>;

  const { data: pins } = await supabase
    .from("pins")
    .select("bhk, rent")
    .ilike("neighbourhood", `%${name}%`)
    .eq("is_hidden", false)
    .eq("is_suspicious", false);

  const bhkGroups = new Map<number, number[]>();
  for (const p of pins || []) {
    const arr = bhkGroups.get(p.bhk) || [];
    arr.push(p.rent);
    bhkGroups.set(p.bhk, arr);
  }

  const medians = new Map<number, number>();
  for (const [bhk, rents] of bhkGroups) {
    medians.set(bhk, median(rents));
  }

  const formatRent = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

  return (
    <div className="min-h-screen bg-[#fbf9f6] px-6 py-12 text-[#16110d] sm:px-12 lg:px-24">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-[var(--font-display)] text-4xl font-bold sm:text-5xl">
          Rent prices in {name}, Bengaluru
        </h1>
        <p className="mt-4 text-lg text-[#61584e]">
          Based on {pins?.length || 0} community-submitted rent data points.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((bhk) => {
            const med = medians.get(bhk);
            const count = bhkGroups.get(bhk)?.length || 0;
            return (
              <div
                key={bhk}
                className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm"
              >
                <h3 className="font-[var(--font-display)] text-xl font-bold text-[#61584e]">
                  {bhk} BHK
                </h3>
                {med ? (
                  <>
                    <p className="mt-2 text-3xl font-bold">
                      {formatRent.format(med)}
                      <span className="text-sm font-normal text-[#61584e]">
                        /mo
                      </span>
                    </p>
                    <p className="mt-2 text-xs text-[#8c8378]">
                      Median from {count} data point{count !== 1 ? "s" : ""}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-[#8c8378]">Not enough data</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-[#16110d] px-8 py-4 font-bold text-white transition hover:bg-black/80"
          >
            Explore the Rent Map
          </Link>
        </div>
      </div>
    </div>
  );
}
