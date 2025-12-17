
import OpenAI from 'openai';
import { tools } from './tools/registry';

// Initialize OpenAI client
const apiKey = process.env.OPENAI_API_KEY;
if (apiKey) {
  console.log('LLM: OpenAI API Key found (starts with ' + apiKey.slice(0, 7) + '...)');
} else {
  console.warn('LLM: No OpenAI API Key found in environment variables. LLM features will be disabled.');
}

const openai = new OpenAI({
  apiKey: apiKey || 'dummy', 
  baseURL: process.env.OPENAI_BASE_URL,
});

// Filter out noop tools to save tokens and confusion
const activeTools = tools.filter(t => !t.name.startsWith('noop_'));

export async function planNextStep(messages: { role: 'user' | 'assistant' | 'system', content: string }[]) {
  // 1. Prepare tools for OpenAI
  const aiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = activeTools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: `Tool: ${t.name}. Tags: ${t.tags.join(', ')}`,
      parameters: t.inputSchema as any,
    },
  }));

  // 2. Add a system prompt if not present
  const msgs = [
    { 
      role: 'system', 
      content: `You are Joe, an elite AI autonomous engineer. You are capable of building complete websites, applications, and solving complex tasks without human intervention.
You have access to a set of tools to interact with the file system, network, and browser.

Your Goal:
- Understand the user's high-level request (e.g., "Build a landing page").
- Break it down into logical steps (Plan -> Create Files -> Verify).
- Execute the steps autonomously using the available tools.
- If you need to read what you wrote, use "file_read".
- If you need to check files, use "ls".
- If you need to search, use "web_search".
- If you need to install packages or run commands, use "shell_execute".
- If you need to fix a bug in a file, use "file_edit".
- If you have completed the task, use "echo" to report the final result to the user.

Rules:
- You are persistent. If a tool fails, try to fix the input or use a different approach.
- Do not repeat the same tool call if it was successful.
- If you generated an artifact (image, file), use "echo" to confirm it.
- You are professional and precise.
- You can chain multiple thoughts and actions.
- If the user asks in Arabic, you MUST reply in Arabic.
` 
    },
    ...messages
  ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: msgs,
      tools: aiTools,
      tool_choice: 'auto', 
    });

    const choice = completion.choices[0];
    const toolCall = choice.message.tool_calls?.[0];

    if (toolCall && toolCall.type === 'function') {
      return {
        name: toolCall.function.name,
        input: JSON.parse(toolCall.function.arguments),
      };
    }

    // If no tool called, fallback to echo with the content
    return {
      name: 'echo',
      input: { text: choice.message.content || "I'm not sure what to do." },
    };

  } catch (error) {
    console.error('LLM Error:', error);
    // Fallback to heuristic planner if LLM fails
    return heuristicPlanner(messages);
  }
}

export async function generateSessionTitle(messages: { role: string; content: string }[]) {
  if (!messages || messages.length === 0) return 'New Session';
  
  const msgs = [
    {
      role: 'system',
      content: 'You are a helpful assistant. Generate a short, concise title (max 6 words) for a chat session based on the following conversation start. The title should summarize the main topic. If the user speaks Arabic, the title MUST be in Arabic. Do not include quotes.'
    },
    ...messages.slice(0, 5).map(m => ({ role: 'user', content: String(m.content).slice(0, 500) }))
  ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: msgs,
      max_tokens: 20,
    });
    return completion.choices[0]?.message?.content?.trim() || 'New Session';
  } catch (e) {
    console.error('Title generation failed', e);
    return 'New Session';
  }
}

function heuristicPlanner(messages: { role: 'user' | 'assistant' | 'system' | 'tool', content: string | null, tool_calls?: any[], tool_call_id?: string }[]) {
  // Extract user intent
  const userMsg = messages.find(m => m.role === 'user')?.content || '';
  const lastMsg = messages[messages.length - 1];

  // Check if we are in a loop or done
  if (messages.length > 15) return { name: 'echo', input: { text: 'I have completed the maximum number of steps.' } };

  // 1. E-commerce / Store Builder Scenario
  if (/(متجر|ecommerce|shop|store|site|website|موقع)/i.test(String(userMsg))) {
    // Check history to see what we've done
    const toolsCalled = messages
      .filter(m => m.role === 'assistant' && m.tool_calls)
      .flatMap(m => m.tool_calls?.map(tc => tc.function.name) || []);
    
    const textToolsCalled = messages
      .filter(m => m.role === 'assistant' && !m.tool_calls && typeof m.content === 'string')
      .map(m => {
        const match = m.content?.match(/execute tool: (\w+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean) as string[];

    const allToolsCalled = [...toolsCalled, ...textToolsCalled];
    
    const filesWritten = messages
      .filter(m => m.role === 'assistant' && m.tool_calls)
      .flatMap(m => m.tool_calls?.filter(tc => tc.function.name === 'file_write').map(tc => JSON.parse(tc.function.arguments).filename) || []);

    const textFilesWritten = messages
      .filter(m => m.role === 'assistant' && !m.tool_calls && typeof m.content === 'string')
      .map(m => {
        // Match pattern: ... with input: {"filename":"index.html",...}
        if (m.content?.includes('file_write')) {
          try {
            const inputMatch = m.content.match(/input: (\{.*\})/);
            if (inputMatch) {
              const input = JSON.parse(inputMatch[1]);
              return input.filename;
            }
          } catch {}
        }
        return null;
      })
      .filter(Boolean) as string[];

    const allFilesWritten = [...filesWritten, ...textFilesWritten];

    if (!allFilesWritten.includes('index.html')) {
      return {
        name: 'file_write',
        input: {
          filename: 'index.html',
          content: `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>متجر النخبة الإلكتروني</title>
    <link rel="stylesheet" href="styles.css">
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
</head>
<body>
    <header>
        <div class="container">
            <h1>متجر النخبة</h1>
            <nav>
                <ul>
                    <li><a href="#">الرئيسية</a></li>
                    <li><a href="#">المنتجات</a></li>
                    <li><a href="#">من نحن</a></li>
                    <li><a href="#">اتصل بنا</a></li>
                </ul>
            </nav>
            <div class="cart-icon">🛒 <span id="cart-count">0</span></div>
        </div>
    </header>

    <section class="hero">
        <div class="container">
            <h2>أفضل المنتجات بأسعار لا تقبل المنافسة</h2>
            <p>تسوق الآن واحصل على خصومات تصل إلى 50%</p>
            <button class="btn">تسوق الآن</button>
        </div>
    </section>

    <section class="products container">
        <h3>منتجاتنا المميزة</h3>
        <div class="product-grid">
            <!-- Product 1 -->
            <div class="product-card">
                <div class="product-image" style="background-color: #eee; height: 200px; display: flex; align-items: center; justify-content: center;">📱</div>
                <h4>هاتف ذكي حديث</h4>
                <p class="price">999 $</p>
                <button class="btn-add">أضف للسلة</button>
            </div>
            <!-- Product 2 -->
            <div class="product-card">
                <div class="product-image" style="background-color: #eee; height: 200px; display: flex; align-items: center; justify-content: center;">💻</div>
                <h4>لابتوب احترافي</h4>
                <p class="price">1200 $</p>
                <button class="btn-add">أضف للسلة</button>
            </div>
            <!-- Product 3 -->
            <div class="product-card">
                <div class="product-image" style="background-color: #eee; height: 200px; display: flex; align-items: center; justify-content: center;">🎧</div>
                <h4>سماعات بلوتوث</h4>
                <p class="price">150 $</p>
                <button class="btn-add">أضف للسلة</button>
            </div>
            <!-- Product 4 -->
            <div class="product-card">
                <div class="product-image" style="background-color: #eee; height: 200px; display: flex; align-items: center; justify-content: center;">⌚</div>
                <h4>ساعة ذكية</h4>
                <p class="price">250 $</p>
                <button class="btn-add">أضف للسلة</button>
            </div>
        </div>
    </section>

    <footer>
        <div class="container">
            <p>© 2024 متجر النخبة الإلكتروني. جميع الحقوق محفوظة.</p>
        </div>
    </footer>
</body>
</html>`
        }
      };
    }

    if (!allFilesWritten.includes('styles.css')) {
      return {
        name: 'file_write',
        input: {
          filename: 'styles.css',
          content: `:root {
    --primary-color: #FFD700;
    --secondary-color: #1a1a1a;
    --text-color: #333;
    --bg-light: #f4f4f4;
}

body {
    font-family: 'Tajawal', sans-serif;
    margin: 0;
    padding: 0;
    background-color: var(--bg-light);
    color: var(--text-color);
}

.container {
    width: 90%;
    max-width: 1200px;
    margin: 0 auto;
}

header {
    background-color: var(--secondary-color);
    color: #fff;
    padding: 1rem 0;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

header .container {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

header h1 {
    margin: 0;
    color: var(--primary-color);
}

nav ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    gap: 20px;
}

nav a {
    color: #fff;
    text-decoration: none;
    font-weight: bold;
    transition: color 0.3s;
}

nav a:hover {
    color: var(--primary-color);
}

.hero {
    background: linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url('https://source.unsplash.com/random/1600x900/?shopping');
    background-size: cover;
    background-position: center;
    color: #fff;
    text-align: center;
    padding: 100px 0;
}

.hero h2 {
    font-size: 2.5rem;
    margin-bottom: 10px;
}

.btn {
    background-color: var(--primary-color);
    color: #000;
    padding: 10px 20px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-weight: bold;
    font-size: 1rem;
}

.products {
    padding: 50px 0;
}

.products h3 {
    text-align: center;
    margin-bottom: 30px;
    color: var(--secondary-color);
}

.product-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
}

.product-card {
    background: #fff;
    padding: 15px;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
    text-align: center;
    transition: transform 0.3s;
}

.product-card:hover {
    transform: translateY(-5px);
}

.product-image {
    font-size: 50px;
    margin-bottom: 15px;
    border-radius: 8px;
}

.price {
    color: #e67e22;
    font-weight: bold;
    font-size: 1.2rem;
}

.btn-add {
    background-color: var(--secondary-color);
    color: #fff;
    border: none;
    padding: 8px 15px;
    border-radius: 4px;
    cursor: pointer;
}

.btn-add:hover {
    background-color: #333;
}

footer {
    background-color: #111;
    color: #888;
    text-align: center;
    padding: 20px 0;
    margin-top: 50px;
}`
        }
      };
    }

    if (!allToolsCalled.includes('browser_snapshot')) {
      // Assume API is running on port 8080 by default or PORT env
      const port = process.env.PORT || '8080';
      return {
        name: 'browser_snapshot',
        input: { url: `http://localhost:${port}/artifacts/index.html`, title: 'معاينة المتجر' }
      };
    }
    
    // If all done
    return {
      name: 'echo',
      input: { text: 'تم بناء المتجر الإلكتروني بنجاح! لقد قمت بإنشاء ملفات الموقع (index.html, styles.css) ويمكنك معاينتها الآن. هل ترغب في إضافة ميزات أخرى مثل بوابة الدفع؟' }
    };
  }

  // Default fallback for unknown intent
  return {
    name: 'echo',
    input: { text: 'عذراً، لم أتمكن من معالجة طلبك بدقة في الوقت الحالي. يرجى المحاولة مرة أخرى.' }
  };
}

export async function summarizeToolOutput(userQuery: string, toolName: string, toolOutput: any) {
  try {
    const msgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are Joe, an intelligent, professional, and engaging AI assistant. 
Your task is to synthesize the tool's output into a comprehensive, professional, and beautifully formatted response.
- Use Markdown to structure your answer (headings, bullet points, bold text, code blocks) where appropriate to make it visually appealing.
- Be engaging and conversational, not robotic.
- If the user asked in Arabic, reply in professional and elegant Arabic.
- If the tool output implies a direct answer (like a price, status, or short fact), state it clearly first, then add interesting details if available.
- If the output is an error, explain it politely and suggest next steps.
- Do not just dump the JSON; explain what it means in a helpful way.`
      },
      { role: 'user', content: userQuery },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: toolName, arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'call_1', content: JSON.stringify(toolOutput) }
    ];

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: msgs,
    });

    return completion.choices[0].message.content || "I couldn't generate a summary, but the tool executed successfully.";
  } catch (error) {
    console.error('LLM Summary Error:', error);
    return "Tool executed, but I couldn't summarize the results due to an error.";
  }
}
