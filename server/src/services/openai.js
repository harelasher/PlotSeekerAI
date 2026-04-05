/**
 * openai.js
 * Wrapper service for OpenAI API calls for generating
 * embeddings and AI search result explanations.
 */
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
    input: text.substring(0, 8000), // Safety truncation
  });
  return response.data[0].embedding;
}

/**
 * Generate embeddings for a batch of multiple strings (max 100 per call recommended)
 */
async function generateBatchEmbeddings(texts) {
  const client = getClient();
  if (!client) return [];
  if (!texts.length) return [];

  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts.map(t => t.substring(0, 8000)),
  });

  return response.data.map(item => item.embedding);
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
        content: `You are PlotSeekerAI, a passionate and expert book curator. Your goal is to convince the reader why these specific books are perfect for them based on their search: "${query}".

For each book provided, you MUST:
1. Write a 2-sentence atmospheric summary that captures the "vibe" and core tension.
2. Write a "Why this matches" explanation (1 sentence) addressing the reader directly as "You".
   - Use phrases like "You will love...", "If you're looking for...", "This perfectly fits your request because...".
   - Connect the book's themes explicitly to the user's search intent.

Respond ONLY with a valid JSON array of objects. Fields: "title", "summary", "whyMatch".
DO NOT use markdown, code fences, or any text outside the JSON array.`
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
      whyMatch: ''
    }));
  }
}

/**
 * Translate a complex natural language "vibe" into 3-5 optimized search keywords.
 * Essential for hitting external keyword-based APIs (Google Books).
 */
async function generateSearchKeywords(vibe) {
  const client = getClient();
  if (!client) return vibe; // Fallback to raw vibe

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a search query optimizer for PlotSeekerAI. 
          The user has provided a complex "vibe" search description. 
          Your task is to extract the 3-5 most important, high-impact keywords (nouns/themes) that would help a traditional keyword-based search engine (like Google Books) find these books.
          
          Example Input: "parents die in an alleyway and he becomes a superhero"
          Example Output: orphan superhero vigilante alleyway origins
          
          Example Input: "dark moody forest mystery with a sense of impending doom"
          Example Output: dark forest atmospheric suspense mystery doom
          
          Respond ONLY with the keywords separated by spaces. No punctuation or extra text.`
        },
        {
          role: 'user',
          content: vibe
        }
      ],
      temperature: 0.3,
      max_tokens: 50,
    });

    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error('Failed to generate keywords:', err.message);
    return vibe;
  }
}

module.exports = { generateEmbedding, generateBatchEmbeddings, generateBookExplanations, generateSearchKeywords };