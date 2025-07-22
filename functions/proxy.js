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

    // Fetch the content
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Process links to maintain proxy
    $('a[href]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      if (href && !href.startsWith('#')) {
        try {
          const absoluteUrl = new URL(href, parsedUrl.toString());
          $el.attr('href', '/.netlify/functions/proxy?url=' + encodeURIComponent(absoluteUrl.toString()));
        } catch (e) {
          // Ignore invalid URLs
        }
      }
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors *;",
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