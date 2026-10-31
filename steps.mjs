import { getStore } from "@netlify/blobs";

// No names: every step entry is stored as its own blob, with the date and step count in the key,
// so the total can be read with a single list call and two people logging at once never clash.
const START = "2026-11-01";
const END = "2026-12-19";
const MAX_STEPS = 60000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const todayUK = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const KEY_RE = /^e\/\d{4}-\d{2}-\d{2}\/\d{1,5}\/[a-z0-9]{12}$/;

export default async (req) => {
  const store = getStore({ name: "lapland-walk", consistency: "strong" });

  if (req.method === "GET") {
    const { blobs } = await store.list({ prefix: "e/" });
    const days = {};
    let total = 0;
    for (const b of blobs) {
      const [, date, steps] = b.key.split("/");
      const n = Number(steps) || 0;
      days[date] = (days[date] || 0) + n;
      total += n;
    }
    return json({ total, days, today: todayUK() });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Something went wrong sending your steps. Try again." }, 400);
    }
    const date = String(body.date || "");
    const steps = Number(body.steps);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < START || date > END)
      return json({ error: "Pick a day between 1 November and 19 December." }, 400);
    if (date > todayUK()) return json({ error: "That day hasn't happened yet." }, 400);
    if (!Number.isInteger(steps) || steps < 1 || steps > MAX_STEPS)
      return json({ error: "Enter your steps as a whole number, up to 60,000." }, 400);
    const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) => "abcdefghijklmnopqrstuvwxyz0123456789"[x % 36]).join("");
    const key = `e/${date}/${steps}/${id}`;
    await store.set(key, "1");
    return json({ ok: true, key });
  }

  if (req.method === "DELETE") {
    const key = new URL(req.url).searchParams.get("key") || "";
    if (!KEY_RE.test(key)) return json({ error: "Couldn't undo that entry." }, 400);
    await store.delete(key);
    return json({ ok: true });
  }

  return json({ error: "Not allowed." }, 405);
};

export const config = { path: "/api/steps" };
