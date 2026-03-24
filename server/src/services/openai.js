const { OpenAI } = require('openai');

let openai = null;

function getClient() {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

/**
 * Generate an embedding vector for the given text.
 * Uses text-embedding-3-small (1536 dimensions).
 */
async function generateEmbedding(text) {
  const client = getClient();
  if (!client) throw new Error('OpenAI not configured');
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * Generate AI-powered book explanations.
 * Takes the user query + retrieved books and returns summaries + "why it matches".
 */
async function generateBookExplanations(query, books) {
  const bookList = books.map((b, i) => 
    `${i + 1}. "${b.title}" by ${b.author}\nDescription: ${b.description || 'No description available.'}`
  ).join('\n\n');

  const client = getClient();
  if (!client) throw new Error('OpenAI not configured');
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a book recommendation engine. The user searched for: "${query}".
Given the following books, for each book provide:
1. A concise 2-sentence summary
2. A brief "why this matches" explanation (1-2 sentences) relating the book to the user's query

Respond ONLY with valid JSON — an array of objects with fields: "title", "summary", "whyMatch".
Do not include any markdown formatting, code fences, or extra text.`
      },
      {
        role: 'user',
        content: bookList
      }
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  try {
    const content = response.choices[0].message.content.trim();
    // Strip markdown code fences if present
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse AI response:', e.message);
    // Return fallback explanations
    return books.map(b => ({
      title: b.title,
      summary: b.description ? b.description.substring(0, 200) : 'No summary available.',
      whyMatch: 'This book matches your search query.'
    }));
  }
}

module.exports = { generateEmbedding, generateBookExplanations };
