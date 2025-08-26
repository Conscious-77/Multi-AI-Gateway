// 文件路径: /api/proxy.js (支持流式输出的最终版)

// 辅助函数，用于将数据流从源API传输到客户端
async function streamResponse(apiResponse, clientResponse) {
  // 设置响应头，告知浏览器这是一个事件流
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
  const { searchParams } = new URL(request.url, `http://${request.headers.host}`);
  const provider = searchParams.get('provider') || 'gemini';
  let path = searchParams.get('path');

  // 克隆请求体，因为请求体只能被读取一次
  const body = await request.clone().json();
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
    } catch (error) { /* ... 错误处理 ... */ }
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
    } catch (error) { /* ... 错误处理 ... */ }
  }

  // --- Google (Gemini) 路由 ---
  if (provider.toLowerCase() === 'gemini') {
    if (!path) return response.status(400).json({ error: "Missing 'path' parameter" });
    // Gemini的流式输出是通过修改URL路径实现的
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
      
      // Gemini的流式和非流式响应都需要以流的方式处理，只是格式不同
      return streamResponse(geminiResponse, response);

    } catch (error) { /* ... 错误处理 ... */ }
  }
  
  return response.status(400).json({ error: "Invalid 'provider'." });
}
