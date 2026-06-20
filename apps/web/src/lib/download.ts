import { api } from "./api";

/**
 * Download a protected file from the API. Uses the axios instance so the JWT
 * auth header is attached (a plain window.open / link would be unauthenticated
 * and get a 401). Streams the response as a blob and saves it client-side.
 */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const res = await api.get(path, { responseType: "blob" });

  // Prefer the server-provided filename from Content-Disposition.
  const disposition = (res.headers["content-disposition"] as string | undefined) ?? "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? fallbackName;

  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
