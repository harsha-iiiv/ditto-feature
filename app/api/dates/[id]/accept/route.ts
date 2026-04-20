import { sql } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [row] = await sql`
    UPDATE proposed_dates
    SET status = 'accepted'
    WHERE id = ${id}
    RETURNING id, status
  `;

  if (!row) {
    return Response.json({ error: "Proposal not found." }, { status: 404 });
  }

  return Response.json({ ok: true, proposal: row });
}
