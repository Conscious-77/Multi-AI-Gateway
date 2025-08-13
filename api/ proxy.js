// 文件路径: /api/proxy.js
export default async function handler(request, response) {
  // 检查请求方法是否为 POST
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // 从客户端请求中获取完整的 Google API 路径
  // 例如: v1beta/models/gemini-pro:generateContent
  const { searchParams } = new URL(request.url, `http://${request.headers.host}`);
  const googleApiPath = searchParams.get('path');

  if (!googleApiPath) {
    response.status(400).json({ error: 'Missing path parameter' });
    return;
  }

  const googleApiUrl = `https://generativelanguage.googleapis.com/${googleApiPath}`;

  try {
    const headers = {
      'Content-Type': request.headers['content-type'] || 'application/json',
      // 从 Vercel 环境变量中安全地读取你的 API Key
      'x-goog-api-key': process.env.GEMINI_API_KEY, 
    };

    const geminiResponse = await fetch(googleApiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(request.body),
    });

    // 将 Google API 的响应头和状态码原样返回
    response.setHeader('Content-Type', geminiResponse.headers.get('Content-Type'));
    response.status(geminiResponse.status);

    // 将响应体流式传输回客户端，以支持流式输出
    const reader = geminiResponse.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      response.write(value);
    }
    response.end();

  } catch (error) {
    console.error('Proxy Internal Error:', error);
    response.status(500).json({ error: 'An internal server error occurred' });
  }
}