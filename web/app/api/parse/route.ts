import { NextRequest, NextResponse } from "next/server";
import { parseRecipients } from "@/lib/parseRecipients";

// Allow larger file uploads (App Router route segment config).
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const month = (formData.get("month") as string | null) ?? "";

  if (!file) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  // Validate month format
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: "month must be in YYYY-MM format." },
      { status: 400 }
    );
  }

  // Validate file type
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["csv", "xlsx", "xlsm"].includes(ext)) {
    return NextResponse.json(
      { error: "Only CSV, XLSX, and XLSM files are supported." },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const result = parseRecipients(buffer, file.name, month);

  return NextResponse.json(result);
}
