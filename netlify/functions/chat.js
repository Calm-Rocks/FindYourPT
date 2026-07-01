// netlify/functions/chat.js
//
// Secure proxy for the Anthropic Claude API.
// The browser calls this function at /.netlify/functions/chat rather than
// calling api.anthropic.com directly, for two important reasons:
//   1. Anthropic's API doesn't allow cross-origin (CORS) requests from
//      browsers — it's intentionally server-only.
//   2. Calling the API directly from the browser would expose the API key
//      to anyone who opened the Network tab in DevTools.
//
// This function runs server-side on Netlify, where the API key lives as
// a secure environment variable (ANTHROPIC_API_KEY) that the browser
// never sees. It proxies the request to Anthropic and returns the response.
//
// Environment variable required in Netlify dashboard:
//   ANTHROPIC_API_KEY — your Anthropic API key (Settings → Environment variables)

exports.handler = async function (event) {
  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY environment variable not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key not configured on the server.' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        // Allow the browser to call this function from the same origin
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error('Anthropic API error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to reach the AI service.' }),
    };
  }
};
