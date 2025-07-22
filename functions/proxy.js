const fetch = require('node-fetch');
const cheerio = require('cheerio');

exports.handler = async (event) => {
  const url = event.queryStringParameters.url;
  if (!url) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing url parameter' }) };
  }

  // Validate URL format
  try {
    new URL(url);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid URL format' }) };
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    }); const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
      const body = await response.text();
      const $ = cheerio.load(body);

      // Check if this is a Google search page
      const isGoogleSearch = url.includes('google.com/search');

      if (isGoogleSearch) {
        // Remove Google's UI elements but keep search results
        $('#searchform, #top_nav, #appbar, #hdtb, .gb_g, .gb_h, .gb_i, #footer, #bottomads').remove();
        $('#slim_appbar, #lb, .pdp-psy').remove();
        $('#consent-bump, #atvcap, .fbar').remove();
        $('style:contains("gb_")').remove();

        // Keep only the main search results
        const mainContent = $('#main');
        if (mainContent.length) {
          $('body').empty().append(mainContent);
        }
      } else {
        // For non-Google pages, remove navigation elements
        $('nav, header').remove();
      }

      // Enhanced URL rewriting for all resources
      $('script[src], link[href], img[src], iframe[src], a[href], form[action]').each((_, el) => {
        const $el = $(el);
        const attr = el.tagName === 'link' ? 'href' :
          el.tagName === 'form' ? 'action' :
            'src';
        let val = $el.attr(attr);

        if (val) {
          // Handle relative URLs
          if (val.startsWith('/')) {
            const baseUrl = new URL(url);
            val = `${baseUrl.protocol}//${baseUrl.host}${val}`;
          } else if (val.startsWith('//')) {
            val = 'https:' + val;
          } else if (!val.startsWith('http') && !val.startsWith('data:') && !val.startsWith('#')) {
            const baseUrl = new URL(url);
            val = `${baseUrl.protocol}//${baseUrl.host}/${val}`;
          }

          // Only proxy non-data and non-anchor URLs
          if (val.startsWith('http')) {
            const proxiedUrl = '/.netlify/functions/proxy?url=' + encodeURIComponent(val);
            $el.attr(attr, proxiedUrl);
          }
        }
      });

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html',
          'X-Frame-Options': 'ALLOWALL',
          'Content-Security-Policy': "frame-ancestors * 'self' data: blob:;",
        },
        body: $.html()
      };

    } else {
      // Non-HTML (images, CSS, JS), stream raw content
      const buffer = await response.buffer();
      const contentLength = response.headers.get('content-length');

      return {
        statusCode: 200,
        headers: {
          'Content-Type': contentType,
          ...(contentLength ? { 'Content-Length': contentLength } : {}),
          'Cache-Control': 'public, max-age=3600'
        },
        body: buffer.toString('base64'),
        isBase64Encoded: true,
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: 'Error: ' + err.message,
    };
  }
};
