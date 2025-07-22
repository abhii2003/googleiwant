exports.handler = async function(event, context) {
  const url = event.queryStringParameters.url;

  if (!url) {
    return {
      statusCode: 400,
      body: 'Missing url parameter'
    };
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible)'
      }
    });

    const body = await response.text();

    const headers = {};
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== 'x-frame-options' 
          && lowerKey !== 'content-security-policy'
          && lowerKey !== 'content-encoding') { // remove this header
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
