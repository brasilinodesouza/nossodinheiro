import { APP_VERSION } from "@/lib/pwa";

export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    { app: "nosso-dinheiro", version: APP_VERSION },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
      },
    },
  );
}
