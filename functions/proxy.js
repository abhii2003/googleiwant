const fetch = require('node-fetch');
const cheerio = require('cheerio');

exports.handler = async (event) => {
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

    // Fetch the content with realistic browser headers
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Ch-Ua': '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove any existing base tags and CSP
    $('base').remove();
    $('meta[http-equiv="Content-Security-Policy"]').remove();

    // Process all URLs in the page
    $('a[href], img[src], script[src], link[href], source[src], form[action], iframe[src]').each((_, el) => {
      const $el = $(el);
      const attr = el.tagName.toLowerCase() === 'a' ? 'href' :
        el.tagName.toLowerCase() === 'form' ? 'action' : 'src';
      const val = $el.attr(attr);

      if (val && !val.startsWith('data:') && !val.startsWith('#') && !val.startsWith('javascript:')) {
        try {
          const absoluteUrl = new URL(val, parsedUrl.toString());
          $el.attr(attr, '/.netlify/functions/proxy?url=' + encodeURIComponent(absoluteUrl.toString()));

          // Remove target attributes from links
          if (el.tagName.toLowerCase() === 'a') {
            $el.removeAttr('target');
          }
        } catch (e) {
          // Keep invalid URLs as is
        }
      }
    });

    // Add base tag and meta tags
    $('head').prepend(`
      <base href="${parsedUrl.toString()}">
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="referrer" content="no-referrer">
    `);

    // Get the original content type or default to html
    const contentType = response.headers.get('content-type') || 'text/html; charset=utf-8';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors *; connect-src *; img-src * data: blob:; media-src * data: blob:; object-src * data: blob:; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline';",
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cross-Origin-Embedder-Policy': 'unsafe-none',
        'Feature-Policy': '*',
        'Referrer-Policy': 'no-referrer'
      },
      body: $.html()
    };
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