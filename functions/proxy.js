const fetch = require('node-fetch');
const cheerio = require('cheerio');

exports.handler = async (event) => {
  const debug = false;

  try {
    // Get and validate URL
    const url = event.queryStringParameters?.url;
    if (!url) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Missing url parameter' })
      };
    }

    // Parse and normalize URL
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'http:') {
        parsedUrl.protocol = 'https:';
      }
    } catch (e) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Invalid URL format' })
      };
    }

    // Block certain resource types and analytics
    if (parsedUrl.pathname.includes('/gen_204') ||
      parsedUrl.hostname.includes('googleadservices.com') ||
      parsedUrl.pathname.includes('/pagead/') ||
      parsedUrl.pathname.includes('/async/')) {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      };
    }

    // Special handling for Google URLs
    if (parsedUrl.hostname.includes('google.com')) {
      parsedUrl.searchParams.set('hl', 'en');
      parsedUrl.searchParams.set('safe', 'active');
    }

    if (debug) console.log('Fetching URL:', parsedUrl.toString());

    // Fetch the content with proper headers
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (debug) console.log('Content-Type:', contentType);

    // Handle different content types
    if (contentType.toLowerCase().includes('text/html')) {
      const html = await response.text();
      const $ = cheerio.load(html, {
        decodeEntities: true,
        xmlMode: false
      });

      // Special handling for Google search results
      if (parsedUrl.hostname.includes('google.com')) {
        // Remove scripts that might cause CORS issues
        $('script').each((_, el) => {
          const src = $(el).attr('src');
          if (src && (
            src.includes('google-analytics.com') ||
            src.includes('/xjs/_/js/') ||
            src.includes('googleads') ||
            src.includes('/async/') ||
            src.includes('/gen_204')
          )) {
            $(el).remove();
          }
        });

        // Remove tracking pixels and unnecessary iframes
        $('img[src*="gen_204"], iframe[src*="google"]').remove();

        if (parsedUrl.pathname.includes('/search')) {
          // Remove unnecessary elements but keep essential structure
          $('#searchform, #gb, .gb_g, .gb_h, .gb_i').remove();
          $('#top_nav, #appbar, #hdtb').remove();
          $('#bottomads, #footcnt').remove();
          $('#consent-bump, #atvcap, .fbar').remove();
          $('style:contains("gb_")').remove();

          // Keep only the main content
          const mainContent = $('#main, #search, #center_col');
          if (mainContent.length) {
            $('body').children().not(mainContent).remove();
          }
        }
      }

      // Process all URLs in the page
      $('a[href], img[src], script[src], link[href], form[action]').each((_, el) => {
        const $el = $(el);
        const attr = el.tagName.toLowerCase() === 'a' ? 'href' :
          el.tagName.toLowerCase() === 'form' ? 'action' : 'src';
        const val = $el.attr(attr);

        if (val && !val.startsWith('data:') && !val.startsWith('#')) {
          try {
            const absoluteUrl = new URL(val, parsedUrl.toString());
            if (el.tagName.toLowerCase() === 'a') {
              // For anchor tags, keep the original URL as a data attribute
              $el.attr('data-original-url', absoluteUrl.toString());
              // Remove target attribute to prevent opening in new tab
              $el.removeAttr('target');
              // Add a special class to identify proxied links
              $el.addClass('proxied-link');
              // Set onclick attribute to handle the click in the parent window
              $el.attr('onclick', 'return window.parent.handleProxiedLink(this);');
            }
            $el.attr(attr, '/.netlify/functions/proxy?url=' + encodeURIComponent(absoluteUrl.toString()));
          } catch (e) {
            if (debug) console.log('Error processing URL:', val, e);
          }
        }
      });      // Add base tag and necessary meta tags
      $('head').prepend(`
        <base href="${parsedUrl.toString()}">
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
      `);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, must-revalidate',
          'X-Frame-Options': 'ALLOWALL',
          'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors *; connect-src *; img-src * data: blob:; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline';",
          'Access-Control-Allow-Origin': '*',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Cross-Origin-Embedder-Policy': 'unsafe-none',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        },
        body: $.html()
      };
    } else {
      // Handle non-HTML content (images, scripts, styles, etc.)
      const buffer = await response.buffer();

      return {
        statusCode: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*'
        },
        body: buffer.toString('base64'),
        isBase64Encoded: true
      };
    }
  } catch (error) {
    console.error('Proxy error:', error);
    return {
      statusCode: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Bad Gateway',
        message: error.message
      })
    };
  }
};