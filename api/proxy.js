// 文件路径: /api/proxy.js (支持 Gemini, OpenAI, Claude 的最终版本)

export default async function handler(request, response) {
  // 我们通过一个查询参数 'provider' 来决定请求发往哪里
  const { searchParams } = new URL(request.url, `http://${request.headers.host}`);
  const provider = searchParams.get('provider') || 'gemini'; // 如果不指定，默认为 'gemini'
  const path = searchParams.get('path');

  // 对于 Claude，路径是固定的，所以我们不需要 path 参数
  // 对于其他 provider，path 参数是必须的
  if (provider.toLowerCase() !== 'claude' && !path) {
    return response.status(400).json({ error: "Missing 'path' parameter for this provider" });
  }

  // --- Anthropic (Claude) 路由 ---
  if (provider.toLowerCase() === 'claude') {
    const claudeApiUrl = 'https://api.anthropic.com/v1/messages';

    try {
      const claudeResponse = await fetch(claudeApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Claude 的 Key 是通过 x-api-key 头发送的
          'x-api-key': process.env.CLAUDE_API_KEY,
          // Claude API 要求必须指定版本号
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(request.body)
      });

      const data = await claudeResponse.json();
      return response.status(claudeResponse.status).json(data);

    } catch (error) {
      console.error('Claude Proxy Error:', error);
      return response.status(500).json({ error: 'An internal error occurred while proxying to Claude' });
    }
  }

  // --- OpenAI (GPT) 路由 ---
  if (provider.toLowerCase() === 'openai') {
    const openaiApiUrl = `https://api.openai.com/v1/${path}`;

    try {
      const openaiResponse = await fetch(openaiApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify(request.body)
      });

      const data = await openaiResponse.json();
      return response.status(openaiResponse.status).json(data);

    } catch (error) {
      console.error('OpenAI Proxy Error:', error);
      return response.status(500).json({ error: 'An internal error occurred while proxying to OpenAI' });
    }
  }

  // --- Google (Gemini) 路由 (默认) ---
  if (provider.toLowerCase() === 'gemini') {
    const geminiApiUrl = `https://generativelanguage.googleapis.com/${path}`;
    
    try {
      const geminiResponse = await fetch(geminiApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify(request.body)
      });
      
      const data = await geminiResponse.json();
      return response.status(geminiResponse.status).json(data);

    } catch (error) {
      console.error('Gemini Proxy Error:', error);
      return response.status(500).json({ error: 'An internal error occurred while proxying to Gemini' });
    }
  }

  // 如果 provider 参数不匹配任何已知提供商
  return response.status(400).json({ error: "Invalid 'provider'. Must be 'gemini', 'openai', or 'claude'." });
}
