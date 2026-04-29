const TARGET_BASE = (Netlify.env.get("TARGET_DOMAIN") || "").replace(/\/$/, "");
const SECRET_PATH = "/api/v1/chat/conversation/authenticated";

const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

export default async function handler(request) {
  if (!TARGET_BASE) {
    return new Response(JSON.stringify({ status: "success", message: "Service is running" }), { 
        status: 200,
        headers: { "content-type": "application/json" }
    });
  }

  try {
    const url = new URL(request.url);
    
    
    if (!url.pathname.startsWith(SECRET_PATH)) {
      return new Response(JSON.stringify({
        code: 200,
        message: "Authentication required",
        data: null
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    const targetUrl = TARGET_BASE + url.pathname + url.search;

    const headers = new Headers();
    let clientIp = null;

    for (const [key, value] of request.headers) {
      const k = key.toLowerCase();
      if (STRIP_HEADERS.has(k)) continue;
      if (k.startsWith("x-nf-")) continue;
      if (k.startsWith("x-netlify-")) continue;
      
      
      if (k === "user-agent") {
        headers.set(k, value || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36");
        continue;
      }

      if (k === "x-real-ip") {
        clientIp = value;
        continue;
      }
      if (k === "x-forwarded-for") {
        if (!clientIp) clientIp = value;
        continue;
      }
      headers.set(k, value);
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
    }

    const upstream = await fetch(targetUrl, fetchOptions);

    const responseHeaders = new Headers();
    for (const [key, value] of upstream.headers) {
      if (key.toLowerCase() === "transfer-encoding") continue;
      responseHeaders.set(key, value);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { 
        status: 500,
        headers: { "content-type": "application/json" }
    });
  }
}
