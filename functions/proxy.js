const fetch = require('node-fetch');
const cheerio = require('cheerio');

exports.handler = async (event) => {
  const url = event.queryStringParameters.url;
  if (!url) {
    return { statusCode: 400, body: 'Missing url parameter' };
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    // Get content type
    const contentType = response.headers.get('content-type') || '';

    // For HTML, rewrite resource URLs
    if (contentType.includes('text/html')) {
      const body = await response.text();

      const $ = cheerio.load(body);

      // Rewrite src, href URLs to proxy URLs
      $('script[src], link[href], img[src], iframe[src]').each((_, el) => {
        const attr = el.tagName === 'link' ? 'href' : 'src';
        let val = $(el).attr(attr);

        if (val && (val.startsWith('http') || val.startsWith('//'))) {
          // Fix protocol-relative URLs
          if (val.startsWith('//')) val = 'https:' + val;

          const proxiedUrl = '/.netlify/functions/proxy?url=' + encodeURIComponent(val);
          $(el).attr(attr, proxiedUrl);
        }
      });

      // You can add more selectors if needed (e.g. CSS url(), AJAX calls, etc.)

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html',
          // Remove frame blocking headers from original site:
          'X-Frame-Options': 'ALLOWALL',
          'Content-Security-Policy': "frame-ancestors * 'self' data: blob:;",
        },
        body: $.html()
      };

    } else {
      // For non-HTML (images, CSS, JS), just stream the response

      const buffer = await response.buffer();

      // Get content length if any
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
