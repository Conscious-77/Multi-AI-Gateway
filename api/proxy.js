// 文件路径: /api/proxy.js (修正了 Gemini stream body 问题的最终版)

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

    // 复制请求体，以便我们可以安全地修改它
    const geminiBody = { ...body };
    
    // 如果是流式请求，修改URL并从请求体中删除stream字段
    if (isStreaming) {
      path = path.replace(':generateContent', ':streamGenerateContent');
      delete geminiBody.stream; // <-- 这是关键的修正！
    }

    const geminiApiUrl = `https://generativelanguage.googleapis.com/${path}`;
    try {
      const geminiResponse = await fetch(geminiApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        // 使用我们处理过的、不含stream字段的请求体
        body: JSON.stringify(geminiBody)
      });
      
      return streamResponse(geminiResponse, response);

    } catch (error) {
        console.error('Gemini Proxy Error:', error);
        return response.status(500).json({ error: 'An internal error occurred while proxying to Gemini' });
    }
  }
  
  return response.status(400).json({ error: "Invalid 'provider'." });
}
