export const dynamic = "force-static";

export function GET(): Response {
  return Response.json({ success: true, data: { status: "ok" }, error: null });
}
