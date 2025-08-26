// 文件路径: /api/proxy.js (修正了 .clone() 错误的最终版)

// 辅助函数，用于将数据流从源API传输到客户端
async function streamResponse(apiResponse, clientResponse) {
  clientResponse.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  clientResponse.setHeader('Cache-Control', 'no-cache');
  clientResponse.setHeader('Connection', 'keep-alive');
  
  const reader = apiResponse.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    clientResponse.write(value);
  }
  clientResponse.end();
}

export default async function handler(request, response) {
  // Vercel 已经为我们处理好了请求体，可以直接从 request.body 获取
  // 我们不再需要 request.clone() 或手动解析 JSON
  const body = request.body;
  const { searchParams } = new URL(request.url, `http://${request.headers.host}`);
  const provider = searchParams.get('provider') || 'gemini';
  let path = searchParams.get('path');

  const isStreaming = body.stream === true;

  // --- Anthropic (Claude) 路由 ---
  if (provider.toLowerCase() === 'claude') {
    const claudeApiUrl = 'https://api.anthropic.com/v1/messages';
    try {
      const claudeResponse = await fetch(claudeApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });
      
      if (isStreaming) {
        return streamResponse(claudeResponse, response);
      } else {
        const data = await claudeResponse.json();
        return response.status(claudeResponse.status).json(data);
      }
    } catch (error) {
        console.error('Claude Proxy Error:', error);
        return response.status(500).json({ error: 'An internal error occurred while proxying to Claude' });
    }
  }

  // --- OpenAI (GPT) 路由 ---
  if (provider.toLowerCase() === 'openai') {
    if (!path) return response.status(400).json({ error: "Missing 'path' parameter" });
    const openaiApiUrl = `https://api.openai.com/v1/${path}`;
    try {
      const openaiResponse = await fetch(openaiApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      });

      if (isStreaming) {
        return streamResponse(openaiResponse, response);
      } else {
        const data = await openaiResponse.json();
        return response.status(openaiResponse.status).json(data);
      }
    } catch (error) {
        console.error('OpenAI Proxy Error:', error);
        return response.status(500).json({ error: 'An internal error occurred while proxying to OpenAI' });
    }
  }

  // --- Google (Gemini) 路由 ---
  if (provider.toLowerCase() === 'gemini') {
    if (!path) return response.status(400).json({ error: "Missing 'path' parameter" });
    if (isStreaming) {
      path = path.replace(':generateContent', ':streamGenerateContent');
    }
    const geminiApiUrl = `https://generativelanguage.googleapis.com/${path}`;
    try {
      const geminiResponse = await fetch(geminiApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify(body)
      });
      
      return streamResponse(geminiResponse, response);

    } catch (error) {
        console.error('Gemini Proxy Error:', error);
        return response.status(500).json({ error: 'An internal error occurred while proxying to Gemini' });
    }
  }
  
  return response.status(400).json({ error: "Invalid 'provider'." });
}
