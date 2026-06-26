import { auth } from '@/auth';
import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';

const aiRequestSchema = z.object({
  action: z.enum(['summarize', 'improve', 'suggest', 'grammar']),
  content: z.string().min(1).max(50000), // Max 50KB of content
  context: z.string().max(500).optional(), // Optional surrounding context
});

/**
 * POST /api/ai
 * AI-powered writing assistant using Google Gemini.
 * 
 * Actions:
 * - summarize: Generate a concise summary of the document content
 * - improve: Rewrite selected text for clarity and readability
 * - suggest: Suggest the next paragraph or sentence
 * - grammar: Fix grammar and spelling issues
 * 
 * Security:
 * - Authentication required
 * - Payload size limited to 50KB
 * - Content validated via Zod schema
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Size guard — prevent OOM
    const contentLenHeader = req.headers.get('content-length');
    if (contentLenHeader && parseInt(contentLenHeader, 10) > 100 * 1024) {
      return Response.json({ error: 'Payload too large (100KB limit for AI requests)' }, { status: 413 });
    }

    const body = await req.json();
    const result = aiRequestSchema.safeParse(body);

    if (!result.success) {
      return Response.json({ error: 'Invalid request', details: result.error.format() }, { status: 400 });
    }

    const { action, content, context } = result.data;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json({
        error: 'AI service not configured',
        message: 'Please set the GEMINI_API_KEY environment variable to enable AI features.',
      }, { status: 503 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    let prompt = '';

    switch (action) {
      case 'summarize':
        prompt = `You are a professional writing assistant. Please provide a concise, well-structured summary of the following document content. Focus on the key points and main ideas. Return ONLY the summary text, without any preamble or explanation.

Document content:
${content}`;
        break;

      case 'improve':
        prompt = `You are a professional editor. Rewrite the following text to improve clarity, flow, and readability while preserving the original meaning and tone. Make it more engaging and professional. Return ONLY the improved text, without any preamble or explanation.

Text to improve:
${content}

${context ? `Context (surrounding content for reference): ${context}` : ''}`;
        break;

      case 'suggest':
        prompt = `You are a skilled writer. Based on the following document content, suggest a natural and coherent continuation. Write 1-3 paragraphs that flow naturally from the existing content. Match the style, tone, and subject matter. Return ONLY the suggested continuation text.

Existing content:
${content}`;
        break;

      case 'grammar':
        prompt = `You are a professional proofreader. Fix all grammar, spelling, punctuation, and style issues in the following text while preserving the original meaning. Return ONLY the corrected text, without any preamble, explanation, or annotations about what was changed.

Text to proofread:
${content}`;
        break;
    }

    const aiResult = await model.generateContent(prompt);
    const response = aiResult.response;
    const text = response.text();

    return Response.json({
      success: true,
      action,
      result: text.trim(),
    });
  } catch (error: any) {
    console.error('========== AI ERROR ==========');
    console.error(error);

    return Response.json(
      {
        success: false,
        error: error?.message || 'Unknown error',
        details: error?.toString?.(),
        stack:
          process.env.NODE_ENV === 'development'
            ? error?.stack
            : undefined,
      },
      { status: 500 }
    );
  }
}
