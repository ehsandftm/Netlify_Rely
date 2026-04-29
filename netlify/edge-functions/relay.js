// netlify/edge-functions/relay.js
const TARGET_BASE = (Netlify.env.get("TARGET_DOMAIN") || "").replace(/\/$/, "");
const SECRET_PATH = "/api/v1/chat/conversation/authenticated";

const STRIP_HEADERS = new Set([
  "host", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "forwarded",
  "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port",
  "x-nf-", "x-netlify-", "cf-ray", "cf-connecting-ip", "server", "via"
]);

export default async function handler(request) {
  const url = new URL(request.url);

  // اگر TARGET_DOMAIN تنظیم نشده باشد
  if (!TARGET_BASE) {
    return new Response("Service Unavailable", { 
      status: 503,
      headers: { "content-type": "text/plain" }
    });
  }

  // فقط مسیر خاص را قبول کن — بقیه را مثل یک سایت معمولی扱 کن
  if (!url.pathname.startsWith(SECRET_PATH)) {
    // برای ریشه سایت یک پاسخ ساده HTML بده (طبیعی‌تر)
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(
        `<html><head><title>Chat Service</title></head><body><h1>Service is running</h1></body></html>`,
        { 
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        }
      );
    }
    // بقیه مسیرها 404
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
        headers.set(k, value || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36");
        continue;
      }

      headers.set(key, value);
    }

    if (clientIp) headers.set("x-forwarded-for", clientIp);
    headers.set("x-forwarded-proto", "https");

    const method = request.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    const fetchOptions = {
      method,
      headers,
      redirect: "manual",
    };

    if (hasBody) {
      fetchOptions.body = request.body;
      // duplex برای streaming بهتر (در Deno Edge)
      fetchOptions.duplex = "half";
    }

    const upstream = await fetch(targetUrl, fetchOptions);

    const responseHeaders = new Headers(upstream.headers);
    // پاک‌سازی هدرهای سرور
    responseHeaders.delete("server");
    responseHeaders.delete("x-powered-by");
    responseHeaders.delete("via");
    responseHeaders.delete("transfer-encoding");

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error("Relay error:", error);
    return new Response("Service Unavailable", { 
      status: 502,
      headers: { "content-type": "text/plain" }
    });
  }
}
