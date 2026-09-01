export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

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

      if (
        !body ||
        !body.target ||
        typeof body.target !== "string"
      ) {
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

      if (!["http:", "https:"].includes(target.protocol)) {
        return jsonResponse(
          {
            error:
              "Only HTTP and HTTPS websites can be scanned."
          },
          400,
          corsHeaders
        );
      }

      if (isBlockedHostname(target.hostname)) {
        return jsonResponse(
          {
            error:
              "That hostname cannot be scanned."
          },
          400,
          corsHeaders
        );
      }

      /*
       * --------------------------------------------------
       * FETCH THE ACTUAL WEBSITE
       * --------------------------------------------------
       */

      const response = await fetch(target.toString(), {
        method: "GET",
        redirect: "follow",
        headers: {
          Accept:
            "text/html,application/xhtml+xml",
          "User-Agent":
            "Mozilla/5.0 (compatible; MM-Promoter-Diagnostic/1.0; +https://mmpromoter.com)"
        }
      });

      const contentType =
        response.headers.get("content-type") || "";

      const contentLength =
        response.headers.get("content-length");

      if (!response.ok) {
        return jsonResponse(
          {
            status: "Failed",
            error:
              `The website returned HTTP ${response.status}.`,
            httpStatus: response.status,
            resolvedUrl: response.url
          },
          422,
          corsHeaders
        );
      }

      if (
        !contentType
          .toLowerCase()
          .includes("text/html")
      ) {
        return jsonResponse(
          {
            status: "Failed",
            error:
              "The target did not return an HTML webpage.",
            contentType
          },
          422,
          corsHeaders
        );
      }
/*
 * --------------------------------------------------
 * TEMPORARY RAW HTML DIAGNOSTICS
 * --------------------------------------------------
 */

const debugResponse = response.clone();
const rawHtml = await debugResponse.text();

const rawHtmlSignals = {
  hasJsonLd:
    rawHtml.includes("application/ld+json"),

  hasOgTitle:
    rawHtml.includes('property="og:title"'),

  hasOgDescription:
    rawHtml.includes('property="og:description"'),

  hasOgImage:
    rawHtml.includes('property="og:image"'),

  htmlLength:
    rawHtml.length
};
      /*
       * --------------------------------------------------
       * RAW OBSERVED EVIDENCE
       * --------------------------------------------------
       */

      const evidence = {
        requestedUrl: target.toString(),
        resolvedUrl: response.url,
        httpStatus: response.status,
        contentType,
        declaredContentLength:
          contentLength
            ? Number(contentLength)
            : null,

        html: {
          lang: "",
          viewport: "",
          titleCount: 0,
          title: "",
          titleLength: 0,

          metaDescriptionCount: 0,
          metaDescriptions: [],

          canonicalCount: 0,
          canonicals: [],

          robotsMetaCount: 0,
          robotsDirectives: []
        },

        headings: {
          h1: [],
          h2: [],
          h3: [],
          h4: [],
          h5: [],
          h6: []
        },

        openGraph: {
          title: [],
          description: [],
          image: [],
          url: [],
          type: []
        },

        twitter: {
          card: [],
          title: [],
          description: [],
          image: []
        },

        images: {
          total: 0,
          withAlt: 0,
          missingAlt: 0,
          emptyAlt: 0
        },

        links: {
          total: 0,
          internal: 0,
          external: 0,
          emptyHref: 0,
          mailto: 0,
          tel: 0,
          javascript: 0,
          uniqueInternal: 0,
          uniqueExternal: 0
        },

        structuredData: {
          blockCount: 0,
          validBlockCount: 0,
          invalidBlockCount: 0,
          schemaTypes: [],
          schemaIds: [],
          duplicateSchemaIds: []
        },

        content: {
          approximateVisibleWordCount: 0
        }
      };

      /*
       * Temporary collections used while parsing.
       */

      let currentTitle = "";

      const currentHeading = {
        h1: "",
        h2: "",
        h3: "",
        h4: "",
        h5: "",
        h6: ""
      };

      let currentJsonLd = null;

      const jsonLdBlocks = [];

      const internalLinks = new Set();
      const externalLinks = new Set();

      const visibleTextParts = [];

      /*
       * --------------------------------------------------
       * HTML PARSING
       * --------------------------------------------------
       */

      let rewriter = new HTMLRewriter();

      /*
       * HTML LANGUAGE
       */

      rewriter = rewriter.on("html", {
        element(element) {
          const lang = element.getAttribute("lang");

          if (lang && !evidence.html.lang) {
            evidence.html.lang = lang.trim();
          }
        }
      });

      /*
       * TITLE
       */

      rewriter = rewriter.on("title", {
        element() {
          evidence.html.titleCount += 1;
          currentTitle = "";
        },

        text(text) {
          currentTitle += text.text;

          if (text.lastInTextNode) {
            const value =
              normalizeWhitespace(currentTitle);

            if (!evidence.html.title && value) {
              evidence.html.title = value;
              evidence.html.titleLength =
                value.length;
            }
          }
        }
      });

      /*
       * META DESCRIPTION
       */

      rewriter = rewriter.on(
        'meta[name="description"]',
        {
          element(element) {
            evidence.html.metaDescriptionCount +=
              1;

            const content =
              element.getAttribute("content");

            if (content !== null) {
              evidence.html.metaDescriptions.push(
                content.trim()
              );
            }
          }
        }
      );

      /*
       * VIEWPORT
       */

      rewriter = rewriter.on(
        'meta[name="viewport"]',
        {
          element(element) {
            const content =
              element.getAttribute("content");

            if (
              content &&
              !evidence.html.viewport
            ) {
              evidence.html.viewport =
                content.trim();
            }
          }
        }
      );

      /*
       * ROBOTS META
       */

      rewriter = rewriter.on(
        'meta[name="robots"]',
        {
          element(element) {
            evidence.html.robotsMetaCount += 1;

            const content =
              element.getAttribute("content");

            if (content) {
              evidence.html.robotsDirectives.push(
                content.trim()
              );
            }
          }
        }
      );

      /*
       * CANONICAL
       */

      rewriter = rewriter.on(
        'link[rel~="canonical"]',
        {
          element(element) {
            evidence.html.canonicalCount += 1;

            const href =
              element.getAttribute("href");

            if (href !== null) {
              evidence.html.canonicals.push(
                href.trim()
              );
            }
          }
        }
      );

      /*
       * HEADINGS
       */

      for (const level of [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6"
      ]) {
        rewriter = rewriter.on(level, {
          element() {
            currentHeading[level] = "";
          },

          text(text) {
            currentHeading[level] +=
              text.text;

            if (text.lastInTextNode) {
              const value =
                normalizeWhitespace(
                  currentHeading[level]
                );

              if (value) {
                evidence.headings[level].push(
                  value
                );

                visibleTextParts.push(value);
              }
            }
          }
        });
      }

      /*
       * OPEN GRAPH
       */

      const ogMap = {
        "og:title": "title",
        "og:description": "description",
        "og:image": "image",
        "og:url": "url",
        "og:type": "type"
      };

      for (const [
        property,
        key
      ] of Object.entries(ogMap)) {
        rewriter = rewriter.on(
          `meta[property="${property}"]`,
          {
            element(element) {
              const content =
                element.getAttribute("content");

              if (content !== null) {
                evidence.openGraph[key].push(
                  content.trim()
                );
              }
            }
          }
        );
      }

      /*
       * TWITTER / X CARD TAGS
       */

      const twitterMap = {
        "twitter:card": "card",
        "twitter:title": "title",
        "twitter:description":
          "description",
        "twitter:image": "image"
      };

      for (const [
        name,
        key
      ] of Object.entries(twitterMap)) {
        rewriter = rewriter.on(
          `meta[name="${name}"]`,
          {
            element(element) {
              const content =
                element.getAttribute("content");

              if (content !== null) {
                evidence.twitter[key].push(
                  content.trim()
                );
              }
            }
          }
        );
      }

      /*
       * IMAGES
       */

      rewriter = rewriter.on("img", {
        element(element) {
          evidence.images.total += 1;

          const alt =
            element.getAttribute("alt");

          if (alt === null) {
            evidence.images.missingAlt += 1;
            return;
          }

          evidence.images.withAlt += 1;

          if (!alt.trim()) {
            evidence.images.emptyAlt += 1;
          }
        }
      });

      /*
       * LINKS
       */

      rewriter = rewriter.on("a", {
        element(element) {
          evidence.links.total += 1;

          const href =
            element.getAttribute("href");

          if (!href || !href.trim()) {
            evidence.links.emptyHref += 1;
            return;
          }

          const trimmed = href.trim();

          if (
            trimmed
              .toLowerCase()
              .startsWith("mailto:")
          ) {
            evidence.links.mailto += 1;
            return;
          }

          if (
            trimmed
              .toLowerCase()
              .startsWith("tel:")
          ) {
            evidence.links.tel += 1;
            return;
          }

          if (
            trimmed
              .toLowerCase()
              .startsWith("javascript:")
          ) {
            evidence.links.javascript += 1;
            return;
          }

          /*
           * Ignore fragment-only navigation
           * for internal/external counting.
           */

          if (trimmed.startsWith("#")) {
            return;
          }

          try {
            const resolved =
              new URL(
                trimmed,
                evidence.resolvedUrl
              );

            if (
              resolved.hostname ===
              new URL(
                evidence.resolvedUrl
              ).hostname
            ) {
              evidence.links.internal += 1;

              internalLinks.add(
                normalizeUrlForComparison(
                  resolved
                )
              );
            } else {
              evidence.links.external += 1;

              externalLinks.add(
                normalizeUrlForComparison(
                  resolved
                )
              );
            }
          } catch {
            /*
             * Malformed links are simply not
             * classified here.
             */
          }
        }
      });

      /*
 * JSON-LD
 *
 * Capture the complete contents of each JSON-LD
 * script block. Do not rely on lastInTextNode,
 * because Cloudflare may deliver script contents
 * in multiple text chunks.
 */

rewriter = rewriter.on(
  'script[type="application/ld+json"]',
  {
    element(element) {
      evidence.structuredData.blockCount += 1;

      let jsonText = "";

      element.onEndTag(() => {
        jsonLdBlocks.push(jsonText.trim());
      });

      /*
       * Store the collector for this script element.
       */
      currentJsonLd = {
        append(value) {
          jsonText += value;
        }
      };
    },

    text(text) {
      if (
        currentJsonLd &&
        typeof currentJsonLd.append === "function"
      ) {
        currentJsonLd.append(text.text);
      }
    }
  }
);
      
      /*
       * Approximate visible textual content.
       * Deliberately restrict this to content
       * elements rather than script/style.
       */

      for (const selector of [
        "p",
        "li",
        "blockquote"
      ]) {
        rewriter = rewriter.on(selector, {
          text(text) {
            const value =
              normalizeWhitespace(text.text);

            if (value) {
              visibleTextParts.push(value);
            }
          }
        });
      }

      /*
       * Run the parser.
       */

      const transformed =
        rewriter.transform(response);

      await transformed.text();

      /*
       * --------------------------------------------------
       * JSON-LD ANALYSIS
       * --------------------------------------------------
       */

      const schemaTypeSet = new Set();
      const schemaIds = [];

      for (const block of jsonLdBlocks) {
        if (!block) {
          evidence.structuredData
            .invalidBlockCount += 1;

          continue;
        }

        try {
          const parsed =
            JSON.parse(block);

          evidence.structuredData
            .validBlockCount += 1;

          collectSchemaEvidence(
            parsed,
            schemaTypeSet,
            schemaIds
          );
        } catch {
          evidence.structuredData
            .invalidBlockCount += 1;
        }
      }

      evidence.structuredData.schemaTypes =
        [...schemaTypeSet].sort();

      evidence.structuredData.schemaIds =
        schemaIds;

      evidence.structuredData
        .duplicateSchemaIds =
        findDuplicates(schemaIds);

      /*
       * Link uniqueness.
       */

      evidence.links.uniqueInternal =
        internalLinks.size;

      evidence.links.uniqueExternal =
        externalLinks.size;

      /*
       * Approximate visible word count.
       */

      const visibleText =
        visibleTextParts
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

      evidence.content
        .approximateVisibleWordCount =
        visibleText
          ? visibleText.split(/\s+/).length
          : 0;

      /*
       * --------------------------------------------------
       * DERIVED OBSERVATIONS
       *
       * These are rules based directly on the
       * observed evidence.
       *
       * Still NO AI and NO overall score.
       * --------------------------------------------------
       */

      const findings = [];

      /*
       * HTTP / accessibility
       */

      addFinding(
        findings,
        "site_health",
        "http_status",
        evidence.httpStatus === 200
          ? "pass"
          : "issue",
        "Page accessibility",
        evidence.httpStatus === 200
          ? "The page returned HTTP 200."
          : `The page returned HTTP ${evidence.httpStatus}.`,
        {
          observed:
            evidence.httpStatus
        }
      );

      /*
       * TITLE
       */

      if (evidence.html.titleCount === 0) {
        addFinding(
          findings,
          "metadata",
          "title_missing",
          "issue",
          "Page title is missing",
          "No HTML title element was detected."
        );
      } else if (
        evidence.html.titleCount > 1
      ) {
        addFinding(
          findings,
          "metadata",
          "title_duplicate_elements",
          "issue",
          "Multiple title elements detected",
          `${evidence.html.titleCount} title elements were found.`,
          {
            observed:
              evidence.html.titleCount
          }
        );
      } else {
        addFinding(
          findings,
          "metadata",
          "title_present",
          "pass",
          "Page title detected",
          evidence.html.title,
          {
            length:
              evidence.html.titleLength
          }
        );

        if (
          evidence.html.titleLength < 10
        ) {
          addFinding(
            findings,
            "metadata",
            "title_short",
            "warning",
            "Page title is unusually short",
            `The observed title is ${evidence.html.titleLength} characters long.`
          );
        }

        if (
          evidence.html.titleLength > 65
        ) {
          addFinding(
            findings,
            "metadata",
            "title_long",
            "warning",
            "Page title is long",
            `The observed title is ${evidence.html.titleLength} characters long.`
          );
        }
      }

      /*
       * META DESCRIPTION
       */

      if (
        evidence.html.metaDescriptionCount ===
        0
      ) {
        addFinding(
          findings,
          "metadata",
          "meta_description_missing",
          "issue",
          "Meta description is missing",
          "No meta description was detected."
        );
      } else if (
        evidence.html.metaDescriptionCount > 1
      ) {
        addFinding(
          findings,
          "metadata",
          "meta_description_multiple",
          "warning",
          "Multiple meta descriptions detected",
          `${evidence.html.metaDescriptionCount} meta description tags were found.`,
          {
            observed:
              evidence.html.metaDescriptions
          }
        );
      } else {
        const description =
          evidence.html.metaDescriptions[0] ||
          "";

        addFinding(
          findings,
          "metadata",
          "meta_description_present",
          description
            ? "pass"
            : "issue",
          "Meta description",
          description ||
            "The meta description tag is present but empty.",
          {
            length:
              description.length
          }
        );

        if (
          description &&
          description.length < 70
        ) {
          addFinding(
            findings,
            "metadata",
            "meta_description_short",
            "warning",
            "Meta description is relatively short",
            `The observed description is ${description.length} characters long.`
          );
        }

        if (
          description.length > 170
        ) {
          addFinding(
            findings,
            "metadata",
            "meta_description_long",
            "warning",
            "Meta description is long",
            `The observed description is ${description.length} characters long.`
          );
        }
      }

      /*
       * CANONICAL
       */

      if (
        evidence.html.canonicalCount === 0
      ) {
        addFinding(
          findings,
          "search_readiness",
          "canonical_missing",
          "warning",
          "Canonical URL is missing",
          "No canonical link was detected."
        );
      } else if (
        evidence.html.canonicalCount > 1
      ) {
        addFinding(
          findings,
          "search_readiness",
          "canonical_multiple",
          "issue",
          "Multiple canonical URLs detected",
          `${evidence.html.canonicalCount} canonical link elements were found.`,
          {
            observed:
              evidence.html.canonicals
          }
        );
      } else {
        addFinding(
          findings,
          "search_readiness",
          "canonical_present",
          "pass",
          "Canonical URL detected",
          evidence.html.canonicals[0]
        );
      }

      /*
       * ROBOTS / INDEXABILITY
       */

      const robotString =
        evidence.html.robotsDirectives
          .join(",")
          .toLowerCase();

      if (
        robotString.includes("noindex")
      ) {
        addFinding(
          findings,
          "search_readiness",
          "robots_noindex",
          "issue",
          "Page instructs search engines not to index it",
          evidence.html.robotsDirectives.join(
            " | "
          )
        );
      } else {
        addFinding(
          findings,
          "search_readiness",
          "robots_indexable",
          "pass",
          "No meta noindex directive detected",
          evidence.html.robotsDirectives
            .length
            ? evidence.html.robotsDirectives.join(
                " | "
              )
            : "No robots meta restriction was detected."
        );
      }

      /*
       * LANGUAGE
       */

      addFinding(
        findings,
        "page_structure",
        "html_language",
        evidence.html.lang
          ? "pass"
          : "warning",
        evidence.html.lang
          ? "HTML language declared"
          : "HTML language declaration missing",
        evidence.html.lang ||
          "No lang attribute was detected on the HTML element."
      );

      /*
       * VIEWPORT
       */

      addFinding(
        findings,
        "site_health",
        "viewport",
        evidence.html.viewport
          ? "pass"
          : "warning",
        evidence.html.viewport
          ? "Mobile viewport metadata detected"
          : "Viewport metadata missing",
        evidence.html.viewport ||
          "No viewport meta tag was detected."
      );

      /*
       * H1
       */

      if (
        evidence.headings.h1.length === 0
      ) {
        addFinding(
          findings,
          "page_structure",
          "h1_missing",
          "issue",
          "H1 heading is missing",
          "No H1 heading was detected."
        );
      } else if (
        evidence.headings.h1.length > 1
      ) {
        addFinding(
          findings,
          "page_structure",
          "h1_multiple",
          "warning",
          "Multiple H1 headings detected",
          `${evidence.headings.h1.length} H1 headings were found.`,
          {
            observed:
              evidence.headings.h1
          }
        );
      } else {
        addFinding(
          findings,
          "page_structure",
          "h1_single",
          "pass",
          "Single H1 heading detected",
          evidence.headings.h1[0]
        );
      }

      /*
       * DUPLICATE HEADINGS
       */

      for (const level of [
        "h1",
        "h2",
        "h3"
      ]) {
        const duplicates =
          findDuplicates(
            evidence.headings[level]
              .map(value =>
                value.toLowerCase()
              )
          );

        if (duplicates.length) {
          addFinding(
            findings,
            "content_quality",
            `${level}_duplicate_text`,
            "warning",
            `Duplicate ${level.toUpperCase()} text detected`,
            `${duplicates.length} duplicated heading value(s) were found.`,
            {
              observed: duplicates
            }
          );
        }
      }

      /*
       * STRUCTURED DATA
       */

      if (
        evidence.structuredData
          .blockCount === 0
      ) {
        addFinding(
          findings,
          "structured_data",
          "jsonld_missing",
          "warning",
          "JSON-LD structured data not detected",
          "No application/ld+json blocks were found."
        );
      } else {
        addFinding(
          findings,
          "structured_data",
          "jsonld_present",
          "pass",
          "JSON-LD structured data detected",
          `${evidence.structuredData.blockCount} block(s) were found.`,
          {
            schemaTypes:
              evidence.structuredData
                .schemaTypes
          }
        );
      }

      if (
        evidence.structuredData
          .invalidBlockCount > 0
      ) {
        addFinding(
          findings,
          "structured_data",
          "jsonld_invalid",
          "issue",
          "Invalid JSON-LD detected",
          `${evidence.structuredData.invalidBlockCount} structured-data block(s) could not be parsed as valid JSON.`
        );
      }

      if (
        evidence.structuredData
          .duplicateSchemaIds.length
      ) {
        addFinding(
          findings,
          "structured_data",
          "duplicate_schema_ids",
          "warning",
          "Duplicate schema entity IDs detected",
          "The same @id value appears more than once.",
          {
            observed:
              evidence.structuredData
                .duplicateSchemaIds
          }
        );
      }

      /*
       * AI DISCOVERY READINESS — factual signals only.
       */

      const schemaTypesLower =
        evidence.structuredData.schemaTypes.map(
          type => type.toLowerCase()
        );

      const hasOrganization =
        schemaTypesLower.includes(
          "organization"
        ) ||
        schemaTypesLower.includes(
          "localbusiness"
        );

      const hasWebSite =
        schemaTypesLower.includes(
          "website"
        );

      addFinding(
        findings,
        "ai_discovery_readiness",
        "entity_schema",
        hasOrganization
          ? "pass"
          : "warning",
        hasOrganization
          ? "Business/entity schema detected"
          : "Business/entity schema not detected",
        hasOrganization
          ? "Organization or LocalBusiness structured data is present."
          : "No Organization or LocalBusiness schema type was observed."
      );

      addFinding(
        findings,
        "ai_discovery_readiness",
        "website_schema",
        hasWebSite
          ? "pass"
          : "warning",
        hasWebSite
          ? "WebSite schema detected"
          : "WebSite schema not detected",
        hasWebSite
          ? "WebSite structured data is present."
          : "No WebSite schema type was observed."
      );

      /*
       * OPEN GRAPH
       */

      const ogComplete =
        evidence.openGraph.title.length > 0 &&
        evidence.openGraph.description
          .length > 0 &&
        evidence.openGraph.image.length > 0;

      addFinding(
        findings,
        "discovery_signals",
        "open_graph",
        ogComplete
          ? "pass"
          : "warning",
        ogComplete
          ? "Core Open Graph metadata detected"
          : "Open Graph metadata is incomplete",
        {
          title:
            evidence.openGraph.title[0] ||
            null,
          description:
            evidence.openGraph
              .description[0] || null,
          image:
            evidence.openGraph.image[0] ||
            null
        }
      );

      /*
       * IMAGES / ALT
       */

      if (
        evidence.images.missingAlt > 0
      ) {
        addFinding(
          findings,
          "accessibility",
          "images_missing_alt",
          "warning",
          "Images without alt attributes detected",
          `${evidence.images.missingAlt} of ${evidence.images.total} image(s) have no alt attribute.`
        );
      } else if (
        evidence.images.total > 0
      ) {
        addFinding(
          findings,
          "accessibility",
          "images_alt_present",
          "pass",
          "Image alt attributes present",
          `All ${evidence.images.total} observed image(s) include an alt attribute.`
        );
      }

      /*
       * CONTENT DEPTH
       */

      if (
        evidence.content
          .approximateVisibleWordCount <
        100
      ) {
        addFinding(
          findings,
          "content_quality",
          "limited_visible_text",
          "warning",
          "Limited textual content detected",
          `Approximately ${evidence.content.approximateVisibleWordCount} visible words were observed in headings, paragraphs, lists, and blockquotes.`
        );
      }

      /*
       * --------------------------------------------------
       * SUMMARY COUNTS
       * --------------------------------------------------
       */

      const summary = {
        passes:
          findings.filter(
            item =>
              item.status === "pass"
          ).length,

        warnings:
          findings.filter(
            item =>
              item.status === "warning"
          ).length,

        issues:
          findings.filter(
            item =>
              item.status === "issue"
          ).length,

        totalFindings:
          findings.length
      };

      /*
       * --------------------------------------------------
       * FINAL RESPONSE
       * --------------------------------------------------
       */

      return jsonResponse(
        {
          status: "Success",
          
rawHtmlSignals,
          
          scan: {
            requestedUrl:
              evidence.requestedUrl,

            resolvedUrl:
              evidence.resolvedUrl,

            timestamp:
              new Date().toISOString()
          },

          summary,

          findings,

          evidence
        },
        200,
        corsHeaders
      );
    } catch (error) {
      console.error(
        "Diagnostic Worker error:",
        error
      );

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
 * ========================================================
 * HELPERS
 * ========================================================
 */

function jsonResponse(
  data,
  status,
  headers
) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers
    }
  );
}


function addFinding(
  findings,
  category,
  code,
  status,
  title,
  description,
  evidence = null
) {
  findings.push({
    category,
    code,
    status,
    title,
    description,
    evidence
  });
}


function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}


function normalizeUrlForComparison(url) {
  const normalized =
    new URL(url.toString());

  normalized.hash = "";

  return normalized.toString();
}


function findDuplicates(values) {
  const counts = new Map();

  for (const value of values) {
    if (!value) continue;

    counts.set(
      value,
      (counts.get(value) || 0) + 1
    );
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value);
}


/*
 * --------------------------------------------------------
 * HOST PROTECTION
 * --------------------------------------------------------
 */

function isBlockedHostname(hostname) {
  const host =
    hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host ===
      "169.254.169.254"
  ) {
    return true;
  }

  const ipv4 = host.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  );

  if (ipv4) {
    const octets =
      ipv4
        .slice(1)
        .map(Number);

    if (
      octets.some(
        value =>
          value < 0 ||
          value > 255
      )
    ) {
      return true;
    }

    const [a, b] = octets;

    if (a === 10) return true;

    if (a === 127) return true;

    if (
      a === 169 &&
      b === 254
    ) {
      return true;
    }

    if (
      a === 172 &&
      b >= 16 &&
      b <= 31
    ) {
      return true;
    }

    if (
      a === 192 &&
      b === 168
    ) {
      return true;
    }

    /*
     * Carrier-grade NAT / non-public range.
     */

    if (
      a === 100 &&
      b >= 64 &&
      b <= 127
    ) {
      return true;
    }
  }

  /*
   * Obvious private/local IPv6 literals.
   */

  if (
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:")
  ) {
    return true;
  }

  return false;
}


/*
 * --------------------------------------------------------
 * STRUCTURED-DATA WALKER
 * --------------------------------------------------------
 */

function collectSchemaEvidence(
  value,
  typeSet,
  schemaIds
) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectSchemaEvidence(
        item,
        typeSet,
        schemaIds
      );
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
        typeSet.add(
          String(type)
        );
      }
    }
  }

  if (
    typeof value["@id"] === "string" &&
    value["@id"].trim()
  ) {
    schemaIds.push(
      value["@id"].trim()
    );
  }

  for (
    const child of
      Object.values(value)
  ) {
    collectSchemaEvidence(
      child,
      typeSet,
      schemaIds
    );
  }
}
