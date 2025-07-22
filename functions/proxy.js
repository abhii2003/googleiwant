const cheerio = require('cheerio');

exports.handler = async function(event) {
  const url = event.queryStringParameters.url;
  if (!url) return { statusCode: 400, body: 'Missing url' };

  const response = await fetch(url);
  let html = await response.text();

  const $ = cheerio.load(html);

  // Rewrite all src and href URLs to go through proxy
  $('script[src], link[href], img[src]').each((i, el) => {
    const attr = el.tagName === 'link' ? 'href' : 'src';
    let val = $(el).attr(attr);
    if (val && val.startsWith('http')) {
      $(el).attr(attr, `/.netlify/functions/proxy?url=${encodeURIComponent(val)}`);
    }
  });

  // Return modified HTML
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: $.html()
  };
};
