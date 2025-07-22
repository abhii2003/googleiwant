const fetch = require('node-fetch');
const cheerio = require('cheerio');

exports.handler = async (event) => {
  try {
    let url;
    let method = 'GET';
    let formData = null;

    // Handle form submissions
    if (event.httpMethod === 'POST' && event.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(event.body);
      const formAction = params.get('_proxyFormAction');
      const formMethod = params.get('_proxyFormMethod');

      if (formAction) {
        url = formAction;
        method = formMethod || 'GET';
        // Remove our special fields
        params.delete('_proxyFormAction');
        params.delete('_proxyFormMethod');
        formData = params;
      }
    }

    // If not a form submission, get URL from query params
    if (!url) {
      url = event.queryStringParameters?.url;
    }

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
    const fetchOptions = {
      method: method,
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
    };

    // Add form data if present
    if (formData) {
      if (method.toUpperCase() === 'GET') {
        // For GET requests, append form data to URL
        const searchParams = new URLSearchParams(formData);
        parsedUrl.search = searchParams.toString();
      } else {
        // For POST requests, add form data to body
        fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        fetchOptions.body = formData.toString();
      }
    }

    const response = await fetch(parsedUrl.toString(), fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove any existing base tags and CSP
    $('base').remove();
    $('meta[http-equiv="Content-Security-Policy"]').remove();

    // Special handling for Google
    if (parsedUrl.hostname.includes('google.com')) {
      // Remove elements that might cause issues
      $('script[src*="xjs/_/js/"]').remove();
      $('script[nonce]').remove();
      $('link[rel="preload"]').remove();
      $('script:contains("google.sn =")').remove();
      $('script:contains("google.pmc =")').remove();

      // Clean up forms
      $('form').each((_, form) => {
        const $form = $(form);
        // Remove onsubmit handlers
        $form.removeAttr('onsubmit');
        // Add our own target
        $form.attr('target', '_self');
      });
    }

    // Process all URLs in the page
    $('a[href], img[src], script[src], link[href], source[src], form[action], iframe[src]').each((_, el) => {
      const $el = $(el);
      const attr = el.tagName.toLowerCase() === 'a' ? 'href' :
        el.tagName.toLowerCase() === 'form' ? 'action' : 'src';
      const val = $el.attr(attr);

      if (val && !val.startsWith('data:') && !val.startsWith('#') && !val.startsWith('javascript:')) {
        try {
          const absoluteUrl = new URL(val, parsedUrl.toString());
          if (el.tagName.toLowerCase() === 'form') {
            // Add hidden input for original form action
            $el.append(`<input type="hidden" name="_proxyFormAction" value="${absoluteUrl.toString()}">`);
            // Set form to post to our proxy
            $el.attr('action', '/.netlify/functions/proxy');
            // Add input for original method
            $el.append(`<input type="hidden" name="_proxyFormMethod" value="${$el.attr('method') || 'get'}">`);
          } else {
            $el.attr(attr, '/.netlify/functions/proxy?url=' + encodeURIComponent(absoluteUrl.toString()));
          }

          // Remove target attributes from links
          if (el.tagName.toLowerCase() === 'a') {
            $el.removeAttr('target');
          }
        } catch (e) {
          // Keep invalid URLs as is
        }
      }
    });    // Add base tag and meta tags
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