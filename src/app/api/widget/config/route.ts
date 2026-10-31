import { connection, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { publicConfig } from "@/lib/widget/server";

// Public widget configuration: appearance, form fields, business hours. No secrets.
export async function GET() {
  // Always read at request time: appearance changes must show up without a new deploy.
  await connection();
  try {
    const { config } = await getSettings();
    return NextResponse.json(publicConfig(config), {
      headers: {
        "cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
        // Read by widget.js on the customer's site; contains nothing private.
        "access-control-allow-origin": "*",
      },
    });
  } catch (error) {
    console.error("widget_config_failed", { error: (error as Error).message });
    return NextResponse.json({ error: "Chat indisponível no momento." }, { status: 503 });
  }
}
