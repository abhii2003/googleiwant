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
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
      const body = await response.text();
      const $ = cheerio.load(body);

      // Remove Google's navigation elements (best-effort)
      // Remove <nav>, <header>, and common Google nav classes/ids
      $('nav, header, div#top_nav, div#hdtb, div[jsname="K32k3e"]').remove();

      // Enhanced removal of Google navigation elements
      $('[role="navigation"]').remove();
      $('.gb_g, .gb_h, .gb_i').remove();  // Google account and related bars
      $('.hdtb-mitem').remove();          // Top menu items
      $('#gb, #gbar, #guser').remove();   // Google bar containers
      $('#searchform').closest('div[style*="position: relative"]').remove(); // Search form container
      $('style:contains("gb_")').remove(); // Remove Google-specific styles

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
