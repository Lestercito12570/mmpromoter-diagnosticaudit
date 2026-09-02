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

      const fetchStartedAt = Date.now();
      
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

const responseTimeMs =
  Date.now() - fetchStartedAt;
      
      const contentType =
        response.headers.get("content-type") || "";

      const contentLength =
        response.headers.get("content-length");

      const xRobotsTag =
  response.headers.get("x-robots-tag") || "";
      
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
 * ROBOTS.TXT + SITEMAP OBSERVATION
 * --------------------------------------------------
 */

const resolvedPageUrl = new URL(response.url);
const siteOrigin = resolvedPageUrl.origin;

const robotsEvidence = {
  url: `${siteOrigin}/robots.txt`,
  status: null,
  accessible: false,
  contentType: "",
  sitemapUrls: []
};

const sitemapEvidence = {
  declaredInRobots: [],
  probedUrl: `${siteOrigin}/sitemap.xml`,
  probedStatus: null,
  accessible: false,
  contentType: ""
};

try {
  const robotsResponse = await fetch(
    robotsEvidence.url,
    {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "text/plain,*/*",
        "User-Agent":
          "Mozilla/5.0 (compatible; MM-Promoter-Diagnostic/1.0; +https://mmpromoter.com)"
      }
    }
  );

  robotsEvidence.status =
    robotsResponse.status;

  robotsEvidence.contentType =
    robotsResponse.headers.get(
      "content-type"
    ) || "";

  if (robotsResponse.ok) {
    robotsEvidence.accessible = true;

    const robotsText =
      await robotsResponse.text();

    const sitemapMatches =
      robotsText.match(
        /^\s*Sitemap:\s*(.+)$/gim
      ) || [];

    robotsEvidence.sitemapUrls =
      sitemapMatches
        .map(line =>
          line
            .replace(
              /^\s*Sitemap:\s*/i,
              ""
            )
            .trim()
        )
        .filter(Boolean);

    sitemapEvidence.declaredInRobots =
      [...robotsEvidence.sitemapUrls];
  }
} catch {
  /*
   * Leave robots evidence in its
   * observed unavailable state.
   */
}

try {
  const sitemapResponse = await fetch(
    sitemapEvidence.probedUrl,
    {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept:
          "application/xml,text/xml,*/*",
        "User-Agent":
          "Mozilla/5.0 (compatible; MM-Promoter-Diagnostic/1.0; +https://mmpromoter.com)"
      }
    }
  );

  sitemapEvidence.probedStatus =
    sitemapResponse.status;

  sitemapEvidence.contentType =
    sitemapResponse.headers.get(
      "content-type"
    ) || "";

  sitemapEvidence.accessible =
    sitemapResponse.ok;
} catch {
  /*
   * Leave sitemap evidence in its
   * observed unavailable state.
   */
}
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
        xRobotsTag,
        responseTimeMs,
        declaredContentLength:
          contentLength
            ? Number(contentLength)
            : null,

robotsTxt: robotsEvidence,

sitemap: sitemapEvidence,
        
        html: {
          lang: "",
          viewport: "",
          favicon: "",
          hreflang: [],
          titleCount: 0,
          titles: [],
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
          h6: [],
          sequence: [],
          empty: 0
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
          malformed: 0,
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

      if (value) {
        evidence.html.titles.push(value);
      }

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
 * FAVICON
 */

rewriter = rewriter.on(
  'link[rel~="icon"]',
  {
    element(element) {
      const href =
        element.getAttribute("href");

      if (
        href &&
        !evidence.html.favicon
      ) {
        evidence.html.favicon =
          href.trim();
      }
    }
  }
);

/*
 * HREFLANG
 */

rewriter = rewriter.on(
  'link[hreflang]',
  {
    element(element) {
      const hreflang =
        element.getAttribute("hreflang");

      const href =
        element.getAttribute("href");

      if (hreflang) {
        evidence.html.hreflang.push({
          hreflang: hreflang.trim(),
          href: href ? href.trim() : ""
        });
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

 evidence.headings.sequence.push({
    level,
    text: value
  });
                
                visibleTextParts.push(value);
                } else {
  evidence.headings.empty += 1;              
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
  evidence.links.malformed += 1;
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
 * RESPONSE TIME
 */

addFinding(
  findings,
  "site_health",
  "response_time",
  "pass",
  "Website response time measured",
  `The diagnostic fetch completed in ${evidence.responseTimeMs} ms.`,
  {
    observedMs: evidence.responseTimeMs
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
  const uniqueCanonicals = [
    ...new Set(
      evidence.html.canonicals.map(
        value => value.trim()
      )
    )
  ];

  const canonicalsConflict =
    uniqueCanonicals.length > 1;

  addFinding(
    findings,
    "search_readiness",
    canonicalsConflict
      ? "canonical_conflicting"
      : "canonical_duplicate",
    canonicalsConflict
      ? "issue"
      : "warning",
    canonicalsConflict
      ? "Conflicting canonical URLs detected"
      : "Duplicate canonical elements detected",
    canonicalsConflict
      ? `${evidence.html.canonicalCount} canonical elements point to ${uniqueCanonicals.length} different URLs.`
      : `${evidence.html.canonicalCount} canonical elements were found, but they all point to the same URL.`,
    {
      observed:
        evidence.html.canonicals
    }
  );
}
      
/*
 * CANONICAL ALIGNMENT
 */

if (evidence.html.canonicalCount === 1) {
  try {
    const observedCanonical =
      new URL(
        evidence.html.canonicals[0],
        evidence.resolvedUrl
      );

    const resolvedPage =
      new URL(evidence.resolvedUrl);

    const normalizedCanonical =
      normalizeUrlForComparison(
        observedCanonical
      );

    const normalizedResolved =
      normalizeUrlForComparison(
        resolvedPage
      );

    if (
      normalizedCanonical ===
      normalizedResolved
    ) {
      addFinding(
        findings,
        "search_readiness",
        "canonical_aligned",
        "pass",
        "Canonical URL matches the resolved page",
        "The declared canonical points to the page that was actually retrieved.",
        {
          canonical:
            normalizedCanonical,
          resolvedUrl:
            normalizedResolved
        }
      );
    } else {
      addFinding(
        findings,
        "search_readiness",
        "canonical_mismatch",
        "warning",
        "Canonical URL differs from the resolved page",
        "The page declares a canonical URL that differs from the URL ultimately retrieved.",
        {
          canonical:
            normalizedCanonical,
          resolvedUrl:
            normalizedResolved
        }
      );
    }
  } catch {
    addFinding(
      findings,
      "search_readiness",
      "canonical_invalid",
      "issue",
      "Canonical URL is malformed",
      "The detected canonical value could not be interpreted as a valid URL.",
      {
        observed:
          evidence.html.canonicals[0]
      }
    );
  }
}      
      /*
       * ROBOTS / INDEXABILITY
       */

      const robotString =
        evidence.html.robotsDirectives
          .join(",")
          .toLowerCase();

      const xRobotsString =
  evidence.xRobotsTag
    .toLowerCase();
      
 if (
  robotString.includes("noindex") ||
  xRobotsString.includes("noindex")
) {
   addFinding(
          findings,
          "search_readiness",
          "robots_noindex",
          "issue",
          "Page instructs search engines not to index it",
          [
  ...evidence.html.robotsDirectives,
  evidence.xRobotsTag
]
  .filter(Boolean)
  .join(" | ")  
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
 * ROBOTS.TXT
 */

if (evidence.robotsTxt.accessible) {
  addFinding(
    findings,
    "search_readiness",
    "robots_txt_accessible",
    "pass",
    "robots.txt is accessible",
    `The site returned HTTP ${evidence.robotsTxt.status} for robots.txt.`,
    {
      url: evidence.robotsTxt.url,
      status: evidence.robotsTxt.status
    }
  );
} else {
  addFinding(
    findings,
    "search_readiness",
    "robots_txt_unavailable",
    "warning",
    "robots.txt was not accessible",
    "The standard robots.txt location could not be successfully retrieved.",
    {
      url: evidence.robotsTxt.url,
      status: evidence.robotsTxt.status
    }
  );
}

/*
 * SITEMAP
 */

if (
  evidence.robotsTxt.accessible &&
  evidence.sitemap.declaredInRobots.length > 0
) {
  addFinding(
    findings,
    "search_readiness",
    "sitemap_declared",
    "pass",
    "Sitemap declarations detected",
    `${evidence.sitemap.declaredInRobots.length} sitemap URL(s) were declared in robots.txt.`,
    {
      declaredUrls:
        evidence.sitemap.declaredInRobots
    }
  );
} else if (evidence.sitemap.accessible) {
  addFinding(
    findings,
    "search_readiness",
    "sitemap_accessible",
    "pass",
    "XML sitemap is accessible",
    `The site returned HTTP ${evidence.sitemap.probedStatus} for sitemap.xml.`,
    {
      url: evidence.sitemap.probedUrl,
      status: evidence.sitemap.probedStatus
    }
  );

  if (evidence.robotsTxt.accessible) {
    addFinding(
      findings,
      "search_readiness",
      "sitemap_not_declared_in_robots",
      "warning",
      "Sitemap is not declared in robots.txt",
      "A sitemap.xml file was found, but robots.txt does not contain a Sitemap directive.",
      {
        sitemapUrl:
          evidence.sitemap.probedUrl
      }
    );
  }
} else {
  addFinding(
    findings,
    "search_readiness",
    "sitemap_unavailable",
    "warning",
    "XML sitemap was not detected",
    "No sitemap declaration was found in robots.txt, and the standard /sitemap.xml location could not be successfully retrieved.",
    {
      url: evidence.sitemap.probedUrl,
      status:
        evidence.sitemap.probedStatus
    }
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
 * FAVICON
 */

addFinding(
  findings,
  "site_health",
  "favicon",
  evidence.html.favicon
    ? "pass"
    : "warning",
  evidence.html.favicon
    ? "Favicon detected"
    : "Favicon not detected",
  evidence.html.favicon ||
    "No favicon link was detected in the page HTML."
);

/*
 * HREFLANG
 */

if (evidence.html.hreflang.length > 0) {
  addFinding(
    findings,
    "search_readiness",
    "hreflang_present",
    "pass",
    "Hreflang declarations detected",
    `${evidence.html.hreflang.length} hreflang declaration(s) were found.`,
    {
      observed: evidence.html.hreflang
    }
  );
}
      
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
 * HEADING HIERARCHY
 */

const headingSequence =
  evidence.headings.sequence;

let skippedHeadingLevels = [];

for (
  let i = 1;
  i < headingSequence.length;
  i++
) {
  const previousLevel =
    Number(
      headingSequence[i - 1].level.slice(1)
    );

  const currentLevel =
    Number(
      headingSequence[i].level.slice(1)
    );

  if (
    currentLevel >
    previousLevel + 1
  ) {
    skippedHeadingLevels.push({
      from:
        headingSequence[i - 1],
      to:
        headingSequence[i]
    });
  }
}

if (
  skippedHeadingLevels.length > 0
) {
  addFinding(
    findings,
    "page_structure",
    "heading_levels_skipped",
    "warning",
    "Heading levels are skipped",
    `${skippedHeadingLevels.length} skipped heading-level transition(s) were detected.`,
    {
      observed:
        skippedHeadingLevels
    }
  );
} else if (
  headingSequence.length > 0
) {
  addFinding(
    findings,
    "page_structure",
    "heading_hierarchy",
    "pass",
    "Heading hierarchy is sequential",
    "No skipped heading levels were detected."
  );
}

/*
 * EMPTY HEADINGS
 */

if (evidence.headings.empty > 0) {
  addFinding(
    findings,
    "page_structure",
    "empty_headings",
    "warning",
    "Empty headings detected",
    `${evidence.headings.empty} empty heading element(s) were detected.`,
    {
      observed: evidence.headings.empty
    }
  );
} else {
  addFinding(
    findings,
    "page_structure",
    "empty_headings",
    "pass",
    "No empty headings detected",
    "All observed heading elements contain text."
  );
}      
      /*
       * MALFORMED LINKS
       */

      if (evidence.links.malformed > 0) {
        addFinding(
          findings,
          "site_health",
          "malformed_links",
          "warning",
          "Malformed links detected",
          `${evidence.links.malformed} link(s) could not be interpreted as valid URLs.`,
          {
            observed: evidence.links.malformed
          }
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
  ) ||
  schemaTypesLower.includes(
    "newsmediaorganization"
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
           ? "Organization-related structured data is present."
  : "No recognized organization-related schema type was observed."
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
  ogComplete
    ? "Core Open Graph title, description, and image metadata were detected."
    : "One or more core Open Graph fields are missing.",
  {
    title:
      evidence.openGraph.title[0] || null,
    description:
      evidence.openGraph.description[0] || null,
    image:
      evidence.openGraph.image[0] || null
  }
);
      
/*
 * TWITTER / X CARD METADATA
 */

const twitterComplete =
  evidence.twitter.card.length > 0 &&
  evidence.twitter.title.length > 0 &&
  evidence.twitter.description.length > 0 &&
  evidence.twitter.image.length > 0;

addFinding(
  findings,
  "discovery_signals",
  "twitter_card",
  twitterComplete
    ? "pass"
    : "warning",
twitterComplete
  ? "Twitter/X card metadata detected"
  : "Twitter/X card metadata is incomplete",
twitterComplete
  ? "Core Twitter/X card, title, description, and image metadata were detected."
  : "One or more core Twitter/X metadata fields are missing.",
{
  card:
    evidence.twitter.card[0] || null,
  title:
    evidence.twitter.title[0] || null,
  description:
    evidence.twitter.description[0] || null,
  image:
    evidence.twitter.image[0] || null
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

engineVersion: "1.0.1-canonical",
          
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
 * --------------------------------------------------
 * WEBSITE VISIBILITY HEALTH SCORING
 * --------------------------------------------------
 */

function calculateVisibilityHealth(evidence, findings) {
  const score = {
    version: "1.0",

    dimensions: {
      technicalAccessibility: {
        score: 0,
        max: 25
      },

      searchPageClarity: {
        score: 0,
        max: 25
      },

      businessEntityUnderstanding: {
        score: 0,
        max: 20
      },

      discoverySharingSignals: {
        score: 0,
        max: 20
      },

      contentExperienceQuality: {
        score: 0,
        max: 10
      }
    },

    overall: {
      score: 0,
      max: 100
    },

    constraints: []
  };

  /*
   * --------------------------------------------------
   * 1. TECHNICAL ACCESSIBILITY — 25 POINTS
   * --------------------------------------------------
   */

  let technicalScore = 0;

  // Page accessibility & connection health — 10 points
  if (evidence.httpStatus >= 200 && evidence.httpStatus < 400) {
    technicalScore += 10;
  }

  // Search indexability — 6 points
  const hasNoIndex =
    (evidence.html?.robotsDirectives || []).some(value =>
      String(value).toLowerCase().includes("noindex")
    ) ||
    String(evidence.xRobotsTag || "").toLowerCase().includes("noindex");

  if (!hasNoIndex) {
    technicalScore += 6;
  } else {
    score.constraints.push({
      code: "noindex",
      message: "The page explicitly prevents search indexing."
    });
  }

  // robots.txt accessibility — 3 points
  if (evidence.robotsTxt?.accessible) {
    technicalScore += 3;
  }

  // Sitemap discovery — 3 points
  if (
    (evidence.sitemap?.declaredInRobots || []).length > 0 ||
    evidence.sitemap?.accessible
  ) {
    technicalScore += 3;
  }

  // Mobile viewport support — 2 points
  if (evidence.html?.viewport) {
    technicalScore += 2;
  }

  // Server response — 1 point
  // v1.0 awards this point when the page was successfully retrieved.
  if (evidence.httpStatus >= 200 && evidence.httpStatus < 400) {
    technicalScore += 1;
  }

  score.dimensions.technicalAccessibility.score = technicalScore;

  /*
   * --------------------------------------------------
   * 2. SEARCH & PAGE CLARITY — 25 POINTS
   * --------------------------------------------------
   */

  let searchClarityScore = 0;

  // Page title — 7 points
  const titles = evidence.html?.titles || [];
  const titleCount = evidence.html?.titleCount || 0;
  const primaryTitle = evidence.html?.title || "";
  const primaryTitleLength = evidence.html?.titleLength || 0;

  const uniqueTitles = [
    ...new Set(
      titles
        .map(value => String(value).trim())
        .filter(Boolean)
    )
  ];

  if (titleCount === 1 && primaryTitle) {
    if (primaryTitleLength >= 30 && primaryTitleLength <= 70) {
      searchClarityScore += 7;
    } else {
      searchClarityScore += 5;
    }
  } else if (titleCount > 1) {
    if (uniqueTitles.length === 1) {
      searchClarityScore += 3;
    } else {
      searchClarityScore += 1;
    }
  }

  // Meta description — 5 points
  const metaDescriptions = evidence.html?.metaDescriptions || [];
  const uniqueMetaDescriptions = [
    ...new Set(
      metaDescriptions
        .map(value => String(value).trim())
        .filter(Boolean)
    )
  ];

  if (uniqueMetaDescriptions.length === 1) {
    const descriptionLength = uniqueMetaDescriptions[0].length;

    if (descriptionLength >= 70 && descriptionLength <= 160) {
      searchClarityScore += 5;
    } else {
      searchClarityScore += 4;
    }
  } else if (uniqueMetaDescriptions.length > 1) {
    searchClarityScore += 2;
  }

  // Canonical clarity — 5 points
  const canonicals = evidence.html?.canonicals || [];
  const uniqueCanonicals = [
    ...new Set(
      canonicals
        .map(value => String(value).trim())
        .filter(Boolean)
    )
  ];

  if (canonicals.length === 1) {
    try {
      const canonicalUrl = new URL(
        canonicals[0],
        evidence.resolvedUrl
      );

      const canonicalNormalized =
        normalizeUrlForComparison(canonicalUrl.href);

      const resolvedNormalized =
        normalizeUrlForComparison(evidence.resolvedUrl);

      if (canonicalNormalized === resolvedNormalized) {
        searchClarityScore += 5;
      } else {
        searchClarityScore += 1;
      }
    } catch {
      // malformed canonical = 0 points
    }
  } else if (canonicals.length > 1) {
    if (uniqueCanonicals.length === 1) {
      searchClarityScore += 4;
    }
    // conflicting canonicals = 0 points
  } else {
    searchClarityScore += 3;
  }

  // Primary H1 — 5 points
  const h1Count = (evidence.headings?.h1 || []).length;

  if (h1Count === 1) {
    searchClarityScore += 5;
  } else if (h1Count > 1) {
    searchClarityScore += 3;
  }

  // Language declaration — 3 points
  if (evidence.html?.lang) {
    searchClarityScore += 3;
  }

  score.dimensions.searchPageClarity.score = searchClarityScore;  

  /*
   * --------------------------------------------------
   * 3. BUSINESS & ENTITY UNDERSTANDING — 20 POINTS
   * --------------------------------------------------
   */

  let entityUnderstandingScore = 0;

 const schemaTypes = evidence.structuredData?.schemaTypes || [];
  const normalizedSchemaTypes = schemaTypes.map(type =>
    String(type).toLowerCase()
  );

  // Organization/entity identification — 9 points
  const hasOrganizationEntity =
    normalizedSchemaTypes.includes("organization") ||
    normalizedSchemaTypes.includes("localbusiness") ||
    normalizedSchemaTypes.includes("newsmediaorganization");

  if (hasOrganizationEntity) {
    entityUnderstandingScore += 9;
  }

  // Website identity — 6 points
  const hasWebsiteSchema =
    normalizedSchemaTypes.includes("website");

  if (hasWebsiteSchema) {
    entityUnderstandingScore += 6;
  }

  // Structured-data presence & validity — 5 points
 const jsonLdCount =
  evidence.structuredData?.blockCount || 0;

const validJsonLdCount =
  evidence.structuredData?.validBlockCount || 0;

const invalidJsonLdCount =
  evidence.structuredData?.invalidBlockCount || 0;

if (jsonLdCount > 0) {
  if (invalidJsonLdCount === 0) {
    entityUnderstandingScore += 5;
  } else if (validJsonLdCount > 0) {
    entityUnderstandingScore += 3;
  } else {
    entityUnderstandingScore += 1;
  }
}
  
  score.dimensions.businessEntityUnderstanding.score =
    entityUnderstandingScore;  
  
  /*
   * --------------------------------------------------
   * 4. DISCOVERY & SHARING SIGNALS — 20 POINTS
   * --------------------------------------------------
   */

  let discoverySharingScore = 0;

  // Open Graph — 10 points
  const og = evidence.openGraph || {};

  if ((og.title || []).length > 0) {
    discoverySharingScore += 3;
  }

  if ((og.description || []).length > 0) {
    discoverySharingScore += 3;
  }

  if ((og.image || []).length > 0) {
    discoverySharingScore += 4;
  }

  // Twitter/X Card — 6 points
  const twitter = evidence.twitter || {};

  if ((twitter.card || []).length > 0) {
    discoverySharingScore += 2;
  }

  if ((twitter.title || []).length > 0) {
    discoverySharingScore += 1.5;
  }

  if ((twitter.description || []).length > 0) {
    discoverySharingScore += 1;
  }

  if ((twitter.image || []).length > 0) {
    discoverySharingScore += 1.5;
  }

  // Image descriptive markup coverage — 4 points
  const totalImages = evidence.images?.total || 0;
  const imagesWithAlt = evidence.images?.withAlt || 0;

  if (totalImages > 0) {
    const altCoverage = imagesWithAlt / totalImages;
    discoverySharingScore += altCoverage * 4;
  }

  score.dimensions.discoverySharingSignals.score =
    Math.round(discoverySharingScore * 10) / 10;  
  return score;
}

/*
 * Existing helper functions
 */

function addFinding(
  findings,
  category,
  code,
  status,
  title,
  description,
  evidence = null
) {

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
  value["@type"] &&
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
