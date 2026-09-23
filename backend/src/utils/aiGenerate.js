// ============================================================
// AI question generator helper
// ------------------------------------------------------------
// Uses the configured OpenAI-compatible LLM proxy (OPENAI_API_KEY /
// OPENAI_BASE_URL) to generate quiz / assignment questions from a topic.
//
// Degrades gracefully: if the LLM is not configured or the call fails,
// isConfigured() returns false and generateQuestions() throws a clean
// error the route can surface to the teacher. No mock data is ever
// returned — the teacher always sees a clear message instead.
// ============================================================

// Resolve the API key. The Genspark LLM proxy authenticates with the
// gsk- session token (GSK_TOKEN); fall back to OPENAI_API_KEY for a
// standard OpenAI deployment.
function apiKey() {
  return (process.env.GSK_TOKEN || process.env.OPENAI_API_KEY || '').trim();
}

function isConfigured() {
  return Boolean(apiKey() && (process.env.OPENAI_BASE_URL || '').trim());
}

const MODEL = process.env.AI_MODEL || 'gpt-5-mini';

// Generate `count` questions about `topic`.
//   types: array subset of ['MCQ','SHORT','DESCRIPTIVE']
// Returns array of { text, type, options:[], correctAnswer, marks }
async function generateQuestions({ topic, count = 5, types = ['MCQ'], context = '' }) {
  if (!isConfigured()) {
    const err = new Error('AI generation is not configured on this server. Add questions manually.');
    err.statusCode = 503;
    throw err;
  }
  const base = process.env.OPENAI_BASE_URL.replace(/\/$/, '');
  const allowed = types.filter((t) => ['MCQ', 'SHORT', 'DESCRIPTIVE'].includes(t));
  const typeList = allowed.length ? allowed : ['MCQ'];

  const sys = `You are an expert university examiner. Generate high-quality exam questions strictly as JSON.
Return ONLY a JSON object of the form: {"questions":[{"text":"...","type":"MCQ|SHORT|DESCRIPTIVE","options":["A","B","C","D"],"correctAnswer":"0","marks":1}]}.
Rules:
- For MCQ: provide exactly 4 distinct options and set correctAnswer to the zero-based index (as a string) of the correct option.
- For SHORT: options must be an empty array; correctAnswer is a concise model answer.
- For DESCRIPTIVE: options must be an empty array; correctAnswer is a brief grading rubric / key points.
- Use only these question types: ${typeList.join(', ')}.
- marks: integer 1-5 reflecting difficulty.
- Do not include any commentary outside the JSON.`;

  const user = `Topic: ${topic}\nNumber of questions: ${count}\n${context ? `Course context: ${context}\n` : ''}Distribute question types across: ${typeList.join(', ')}.`;

  const resp = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    const err = new Error(`AI service error (${resp.status}). Please try again or add questions manually.`);
    err.statusCode = 502;
    err.detail = txt.slice(0, 300);
    throw err;
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';
  // Detect the Genspark proxy "no credits" refusal (returned as 200 + plain text).
  if (/credits?\b/i.test(content) && /(can'?t be used|subscribe|purchase|pricing)/i.test(content) && !content.trim().startsWith('{')) {
    const err = new Error('AI generation is unavailable on this account (no LLM credits). Please add questions manually.');
    err.statusCode = 503;
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_) {
    // Attempt to extract the first JSON object from the text.
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) {
      const err = new Error('AI returned an unparseable response. Please try again.');
      err.statusCode = 502;
      throw err;
    }
    parsed = JSON.parse(m[0]);
  }

  const list = Array.isArray(parsed.questions) ? parsed.questions : [];
  return list
    .map((q, i) => {
      const type = ['MCQ', 'SHORT', 'DESCRIPTIVE'].includes(q.type) ? q.type : 'MCQ';
      const options = type === 'MCQ' && Array.isArray(q.options) ? q.options.map((o) => String(o)).slice(0, 6) : [];
      return {
        text: String(q.text || '').trim(),
        type,
        options,
        correctAnswer: q.correctAnswer != null ? String(q.correctAnswer) : null,
        marks: Number.isFinite(Number(q.marks)) ? Math.max(1, Math.min(5, Math.round(Number(q.marks)))) : 1,
        order: i,
      };
    })
    .filter((q) => q.text.length > 0);
}

// ============================================================
// AI TUTOR CHAT (Requirement #3)
// ------------------------------------------------------------
// Conversational academic tutor. Accepts the student's message,
// optional course context and prior turns, returns an assistant
// reply. Degrades gracefully when the LLM is not configured by
// returning a helpful, deterministic study-guidance fallback
// (never a fabricated factual answer).
// ============================================================
async function chatTutor({ message, course = null, history = [], studentName = 'Student' }) {
  const courseLine = course
    ? `The student is currently studying "${course.title}"${course.code ? ` (${course.code})` : ''}. Tailor explanations to this course where relevant.`
    : 'The student has not selected a specific course.';

  if (!isConfigured()) {
    // Graceful, honest fallback — guides the student without inventing facts.
    const topic = course ? `${course.title}${course.code ? ` (${course.code})` : ''}` : 'your course';
    return {
      configured: false,
      reply:
        `I'm your AI study assistant for ${topic}. The live AI engine isn't connected on this server right now, ` +
        `so I can't generate a full answer. In the meantime, here's how to approach your question:\n\n` +
        `1. Break the problem into smaller parts and identify what's being asked.\n` +
        `2. Review your lecture slides and assigned readings for the relevant topic.\n` +
        `3. Try a worked example, then attempt a similar one yourself.\n` +
        `4. Note any step you get stuck on and raise it with your instructor or in the next live class.\n\n` +
        `Your question: "${String(message).slice(0, 200)}"`,
    };
  }

  const base = process.env.OPENAI_BASE_URL.replace(/\/$/, '');
  const sys = `You are an expert, encouraging university AI tutor. ${courseLine}
Guidelines:
- Explain concepts clearly with step-by-step reasoning and short examples.
- Adapt difficulty to an undergraduate student.
- Encourage understanding over rote answers; never do graded work dishonestly — guide instead.
- Be concise but complete. Use simple formatting (short paragraphs, numbered steps) — no markdown tables.
- If asked something outside academics, gently steer back to studying.`;

  const msgs = [{ role: 'system', content: sys }];
  // Include up to the last 8 turns of prior conversation for continuity.
  for (const h of (Array.isArray(history) ? history.slice(-8) : [])) {
    if (h && h.role && h.content) {
      msgs.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content).slice(0, 2000) });
    }
  }
  msgs.push({ role: 'user', content: String(message).slice(0, 4000) });

  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
      body: JSON.stringify({ model: MODEL, messages: msgs, temperature: 0.4 }),
    });
    if (!resp.ok) {
      return { configured: true, reply: `Sorry, the AI service returned an error (${resp.status}). Please try again in a moment.`, error: true };
    }
    const data = await resp.json();
    const content = (data?.choices?.[0]?.message?.content || '').trim();
    if (/credits?\b/i.test(content) && /(can'?t be used|subscribe|purchase|pricing)/i.test(content)) {
      return { configured: false, reply: "The AI tutor is temporarily unavailable on this account. Please try again later or ask your instructor.", error: true };
    }
    if (!content) return { configured: true, reply: 'I could not generate a response. Please rephrase your question.', error: true };
    return { configured: true, reply: content };
  } catch (err) {
    return { configured: true, reply: 'Sorry, I could not reach the AI service. Please try again.', error: true, detail: err.message };
  }
}

module.exports = { isConfigured, generateQuestions, chatTutor };
