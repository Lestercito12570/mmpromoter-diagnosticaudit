export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    // Browser CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (request.method !== "POST") {
      return jsonResponse(
        { error: "Method not allowed. Use POST." },
        405,
        corsHeaders
      );
    }

    try {
      const body = await request.json().catch(() => null);

      if (!body || !body.target || typeof body.target !== "string") {
        return jsonResponse(
          { error: "A website URL is required." },
          400,
          corsHeaders
        );
      }

      let target;

      try {
        target = new URL(body.target.trim());
      } catch {
        return jsonResponse(
          { error: "Please enter a valid website URL." },
          400,
          corsHeaders
        );
      }

      // Only normal public web URLs
      if (!["http:", "https:"].includes(target.protocol)) {
        return jsonResponse(
          { error: "Only HTTP and HTTPS websites can be scanned." },
          400,
          corsHeaders
        );
      }

      if (isBlockedHostname(target.hostname)) {
        return jsonResponse(
          { error: "That hostname cannot be scanned." },
          400,
          corsHeaders
        );
      }

      /*
       * FETCH THE REAL WEBSITE
       */

      const response = await fetch(target.toString(), {
        method: "GET",
        redirect: "follow",
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "User-Agent":
            "Mozilla/5.0 (compatible; MM-Promoter-Diagnostic/1.0; +https://mmpromoter.com)"
        }
      });

      if (!response.ok) {
        return jsonResponse(
          {
            error: `The website returned HTTP ${response.status}.`,
            httpStatus: response.status,
            resolvedUrl: response.url
          },
          422,
          corsHeaders
        );
      }

      const contentType =
        response.headers.get("content-type") || "";

      if (!contentType.toLowerCase().includes("text/html")) {
        return jsonResponse(
          {
            error: "The target did not return an HTML webpage.",
            contentType
          },
          422,
          corsHeaders
        );
      }

      /*
       * OBSERVED EVIDENCE
       *
       * These values begin empty.
       * They are populated only if actually found
       * in the returned HTML.
       */

      const evidence = {
        requestedUrl: target.toString(),
        resolvedUrl: response.url,
        httpStatus: response.status,

        title: "",
        metaDescription: "",
        canonical: "",

        h1Count: 0,
        h1s: [],

        jsonLdBlockCount: 0,
        validJsonLdBlockCount: 0,
        invalidJsonLdBlockCount: 0,
        schemaTypes: []
      };

      let currentTitle = "";
      let currentH1 = "";

      const jsonLdBlocks = [];
      let currentJsonLd = "";

      /*
       * Cloudflare HTMLRewriter parses the actual
       * returned document rather than asking an AI
       * what might be there.
       */

      const rewritten = new HTMLRewriter()

        // TITLE
        .on("title", {
          text(text) {
            currentTitle += text.text;

            if (text.lastInTextNode) {
              evidence.title = currentTitle.trim();
            }
          }
        })

        // META DESCRIPTION
        .on('meta[name="description"]', {
          element(element) {
            const content = element.getAttribute("content");

            if (content && !evidence.metaDescription) {
              evidence.metaDescription = content.trim();
            }
          }
        })

        // CANONICAL
        .on('link[rel="canonical"]', {
          element(element) {
            const href = element.getAttribute("href");

            if (href && !evidence.canonical) {
              evidence.canonical = href.trim();
            }
          }
        })

        // H1 ELEMENTS
        .on("h1", {
          element() {
            currentH1 = "";
            evidence.h1Count += 1;
          },

          text(text) {
            currentH1 += text.text;

            if (text.lastInTextNode) {
              const value = currentH1.trim();

              if (value) {
                evidence.h1s.push(value);
              }
            }
          }
        })

        // JSON-LD
        .on('script[type="application/ld+json"]', {
          element() {
            evidence.jsonLdBlockCount += 1;
            currentJsonLd = "";
          },

          text(text) {
            currentJsonLd += text.text;

            if (text.lastInTextNode) {
              jsonLdBlocks.push(currentJsonLd.trim());
            }
          }
        })

        .transform(response);

      /*
       * Consume the transformed response so that all
       * HTMLRewriter handlers finish running.
       */

      await rewritten.text();

      /*
       * Parse JSON-LD after extraction.
       */

      const schemaTypeSet = new Set();

      for (const block of jsonLdBlocks) {
        if (!block) {
          evidence.invalidJsonLdBlockCount += 1;
          continue;
        }

        try {
          const parsed = JSON.parse(block);

          evidence.validJsonLdBlockCount += 1;

          collectSchemaTypes(parsed, schemaTypeSet);

        } catch {
          evidence.invalidJsonLdBlockCount += 1;
        }
      }

      evidence.schemaTypes = [...schemaTypeSet].sort();

      /*
       * FINAL RESPONSE
       *
       * Notice there is:
       * - no invented score
       * - no AI opinion
       * - no estimated data
       */

      return jsonResponse(
        {
          status: "Success",

          requestedUrl: evidence.requestedUrl,
          resolvedUrl: evidence.resolvedUrl,
          httpStatus: evidence.httpStatus,

          title: evidence.title || null,
          metaDescription:
            evidence.metaDescription || null,
          canonical:
            evidence.canonical || null,

          h1Count: evidence.h1Count,
          h1s: evidence.h1s,

          jsonLdBlockCount:
            evidence.jsonLdBlockCount,

          validJsonLdBlockCount:
            evidence.validJsonLdBlockCount,

          invalidJsonLdBlockCount:
            evidence.invalidJsonLdBlockCount,

          schemaTypes:
            evidence.schemaTypes
        },
        200,
        corsHeaders
      );

    } catch (error) {
      console.error("Diagnostic Worker error:", error);

      return jsonResponse(
        {
          status: "Failed",
          error:
            error?.message ||
            "The website diagnostic failed."
        },
        500,
        corsHeaders
      );
    }
  }
};


/*
 * JSON RESPONSE HELPER
 */

function jsonResponse(data, status, headers) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers
    }
  );
}


/*
 * BASIC HOST PROTECTION
 *
 * This prevents obvious attempts to make the
 * public scanner request local/private addresses.
 */

function isBlockedHostname(hostname) {
  const host = hostname.toLowerCase();

  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local")
  ) {
    return true;
  }

  // IPv4 literal
  const ipv4 =
    host.match(
      /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
    );

  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);

    // 10.0.0.0/8
    if (a === 10) return true;

    // 127.0.0.0/8
    if (a === 127) return true;

    // 169.254.0.0/16
    if (a === 169 && b === 254) return true;

    // 172.16.0.0/12
    if (
      a === 172 &&
      b >= 16 &&
      b <= 31
    ) {
      return true;
    }

    // 192.168.0.0/16
    if (a === 192 && b === 168) {
      return true;
    }
  }

  return false;
}


/*
 * WALK JSON-LD AND COLLECT EVERY @type
 */

function collectSchemaTypes(value, typeSet) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectSchemaTypes(item, typeSet);
    }

    return;
  }

  if (value["@type"]) {
    const types =
      Array.isArray(value["@type"])
        ? value["@type"]
        : [value["@type"]];

    for (const type of types) {
      if (type) {
        typeSet.add(String(type));
      }
    }
  }

  for (const child of Object.values(value)) {
    collectSchemaTypes(child, typeSet);
  }
}
