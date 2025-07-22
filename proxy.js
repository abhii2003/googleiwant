const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const url = event.queryStringParameters.url;

  if (!url) {
    return {
      statusCode: 400,
      body: 'Missing url parameter'
    };
  }

  try {
    // Fetch the target URL
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible)'
      }
    });

    // Clone the response body as text
    const body = await response.text();

    // Prepare headers - remove headers that block iframe embedding
    const headers = {};
    response.headers.forEach((value, key) => {
      // Skip X-Frame-Options & Content-Security-Policy
      if (key.toLowerCase() !== 'x-frame-options' && key.toLowerCase() !== 'content-security-policy') {
        headers[key] = value;
      }
    });

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': response.headers.get('content-type') || 'text/html',
      },
      body
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: 'Error fetching URL: ' + error.message
    };
  }
};
