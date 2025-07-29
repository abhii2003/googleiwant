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

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
      const body = await response.text();
      const $ = cheerio.load(body);

      // Remove Google's navigation elements (best-effort)
      // Remove <nav>, <header>, and common Google nav classes/ids
      $('nav, header, div#top_nav, div#hdtb, div[jsname="K32k3e"]').remove();

      // Sometimes Google wraps nav inside <div> with specific classes, try these as well
      $('[role="navigation"]').remove();
      $('.gb_g').remove();         // Google account bar
      $('.hdtb-mitem').remove();   // Top menu items
      $('#gb').remove();           // Google bar container

      // Rewrite resource URLs (script[src], link[href], img[src], iframe[src])
      $('script[src], link[href], img[src], iframe[src]').each((_, el) => {
        const attr = el.tagName === 'link' ? 'href' : 'src';
        let val = $(el).attr(attr);

        if (val && (val.startsWith('http') || val.startsWith('//'))) {
          if (val.startsWith('//')) val = 'https:' + val;

          const proxiedUrl = '/.netlify/functions/proxy?url=' + encodeURIComponent(val);
          $(el).attr(attr, proxiedUrl);
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
