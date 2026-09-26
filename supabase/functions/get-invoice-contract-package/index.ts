import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0" },
});

const documentLabels: Record<string, string> = {
  cin_recto: "CIN — recto",
  cin_verso: "CIN — verso",
  permis_recto: "Permis de conduire — recto",
};
const allowedKinds = new Set(Object.keys(documentLabels));
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  try {
    const input = await req.json();
    const reference = String(input?.reference || "").trim().slice(0, 100);
    const phone = String(input?.phone || "").trim().slice(0, 40);
    const otp = String(input?.otp || "").trim().slice(0, 20);
    if (!reference || !phone || !otp) return response({ error: "Référence, téléphone et code requis." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return response({ error: "Service temporairement indisponible." }, 503);

    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
    const invoiceResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_public_invoice_by_otp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_reference: reference, p_phone: phone, p_otp: otp }),
    });
    if (!invoiceResponse.ok) return response({ error: "Référence, téléphone ou code incorrect." }, 403);
    const invoice = await invoiceResponse.json();
    const reservationId = String(invoice?.reservation?.id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(reservationId)) return response({ error: "Référence, téléphone ou code incorrect." }, 403);

    const query = new URLSearchParams({
      reservation_id: `eq.${reservationId}`,
      document_kind: "in.(cin_recto,cin_verso,permis_recto)",
      storage_bucket: "eq.contract-documents",
      select: "document_kind,storage_bucket,storage_path,mime_type,uploaded_at",
      order: "uploaded_at.desc",
      limit: "10",
    });
    const metadataResponse = await fetch(`${supabaseUrl}/rest/v1/contract_documents?${query.toString()}`, { headers });
    if (!metadataResponse.ok) return response({ error: "Impossible de récupérer les pièces jointes du contrat." }, 502);
    const metadata = await metadataResponse.json();

    const latestByKind = new Map<string, Record<string, unknown>>();
    for (const item of metadata) {
      const kind = String(item.document_kind || "");
      const path = String(item.storage_path || "");
      if (!allowedKinds.has(kind) || latestByKind.has(kind)) continue;
      if (item.storage_bucket !== "contract-documents" || !path.startsWith(`${reservationId}/`)) continue;
      if (!acceptedImageTypes.has(String(item.mime_type || ""))) continue;
      latestByKind.set(kind, item);
    }

    const documents: Array<{ kind: string; label: string; url: string; mimeType: string }> = [];
    for (const kind of ["cin_recto", "cin_verso", "permis_recto"]) {
      const item = latestByKind.get(kind);
      if (!item) continue;
      const bucket = "contract-documents";
      const path = String(item.storage_path);
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      const signResponse = await fetch(`${supabaseUrl}/storage/v1/object/sign/${bucket}/${encodedPath}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ expiresIn: 1800 }),
      });
      if (!signResponse.ok) return response({ error: "Impossible de préparer une pièce jointe du contrat." }, 502);
      const signed = await signResponse.json();
      const signedUrl = String(signed.signedURL || "");
      const absoluteSignedUrl = signedUrl.startsWith(`${supabaseUrl}/storage/v1/object/sign/`)
        ? signedUrl
        : signedUrl.startsWith("/storage/v1/object/sign/")
          ? `${supabaseUrl}${signedUrl}`
          : signedUrl.startsWith("/object/sign/")
            ? `${supabaseUrl}/storage/v1${signedUrl}`
            : "";
      if (!absoluteSignedUrl) return response({ error: "Lien temporaire invalide." }, 502);
      documents.push({
        kind,
        label: documentLabels[kind],
        url: absoluteSignedUrl,
        mimeType: String(item.mime_type),
      });
    }

    return response({ invoice, documents });
  } catch (error) {
    console.error("get-invoice-contract-package failed", error);
    return response({ error: "Impossible de préparer le contrat pour le moment." }, 500);
  }
});
