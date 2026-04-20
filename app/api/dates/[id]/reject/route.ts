import { sql } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  const [proposal] = await sql`
    UPDATE proposed_dates
    SET status = 'rejected'
    WHERE id = ${id}
    RETURNING id, status
  `;

  if (!proposal) {
    return Response.json({ error: "Proposal not found." }, { status: 404 });
  }

  return Response.json({ ok: true, proposal, reason });
}
