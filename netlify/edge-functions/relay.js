// netlify/edge-functions/relay.js

const TARGET_BASE = (Netlify.env.get("TARGET_DOMAIN") || "").replace(/\/$/, "");
const SECRET_PATH = "/api/v1/chat/conversation/authenticated";

const STRIP_HEADERS = new Set([
  "host", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "forwarded",
  "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port",
  "server", "x-powered-by", "via"
]);

export default async function handler(request) {
  const url = new URL(request.url);

  if (!TARGET_BASE) {
    return new Response("Service Unavailable", { 
      status: 503,
      headers: { "content-type": "text/plain" }
    });
  }

  // فقط مسیر خاص را relay کنیم
  if (!url.pathname.startsWith(SECRET_PATH)) {
    // صفحه اصلی سایت
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(
        `<!DOCTYPE html>
        <html lang="fa">
        <head><meta charset="utf-8"><title>Service</title></head>
        <body><h1>Service Running</h1><p>Access restricted.</p></body>
        </html>`,
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" }}
      );
    }
    return new Response("Not Found", { status: 404 });
  }

  try {
    const targetUrl = TARGET_BASE + url.pathname + url.search;

    const headers = new Headers();
    let clientIp = request.headers.get("x-nf-client-connection-ip") || 
                   request.headers.get("x-real-ip") || 
                   request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

    for (const [key, value] of request.headers) {
      const k = key.toLowerCase();
      if (STRIP_HEADERS.has(k) || k.startsWith("x-nf-") || k.startsWith("x-netlify-")) continue;

      if (k === "user-agent") {
        headers.set(k, value || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
        continue;
      }
      headers.set(key, value);
    }

    if (clientIp) headers.set("x-forwarded-for", clientIp);
    headers.set("x-forwarded-proto", "https");

    const method = request.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    const fetchOptions = { method, headers, redirect: "manual" };
    if (hasBody) {
      fetchOptions.body = request.body;
      fetchOptions.duplex = "half";
    }

    const upstream = await fetch(targetUrl, fetchOptions);

    const responseHeaders = new Headers(upstream.headers);
    ["server", "x-powered-by", "via", "transfer-encoding"].forEach(h => responseHeaders.delete(h));

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error("Relay error:", error.message);
    return new Response("Service Unavailable", { 
      status: 502,
      headers: { "content-type": "text/plain" }
    });
  }
}
