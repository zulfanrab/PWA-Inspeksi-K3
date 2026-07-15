import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { systemPrompt, prompts } = req.body;

    if (!systemPrompt || !prompts || typeof prompts !== 'object') {
      return res.status(400).json({ error: 'Payload tidak valid: systemPrompt dan prompts (object) wajib ada.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Konfigurasi server salah: GEMINI_API_KEY belum dikonfigurasi.' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // Gunakan gemini-2.0-flash untuk kecepatan dan kepatuhan schema
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Buat perintah gabungan untuk menghemat kuota token & waktu eksekusi
    const promptInstructions = `
Ikuti instruksi sistem berikut secara ketat:
---
SYSTEM PROMPT:
${systemPrompt}
---

Tolong buat narasi untuk 5 bagian laporan berikut dengan instruksi khusus untuk masing-masing bagian:

1. Executive Summary:
${prompts.executiveSummary}

2. Findings Narrative:
${prompts.findings}

3. Test Results Narrative:
${prompts.testResults}

4. Recommendations:
${prompts.recommendations}

5. Conclusion:
${prompts.conclusion}

Kembalikan respon Anda strictly dalam bentuk JSON sesuai dengan schema yang ditentukan.
`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: promptInstructions }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            executiveSummary: { type: SchemaType.STRING, description: 'Narasi ringkasan eksekutif' },
            findingsNarrative: { type: SchemaType.STRING, description: 'Narasi temuan visual' },
            testResultsNarrative: { type: SchemaType.STRING, description: 'Narasi hasil pengujian teknis' },
            recommendations: { type: SchemaType.STRING, description: 'Daftar rekomendasi perbaikan' },
            conclusion: { type: SchemaType.STRING, description: 'Narasi kesimpulan kelayakan' }
          },
          required: ['executiveSummary', 'findingsNarrative', 'testResultsNarrative', 'recommendations', 'conclusion']
        },
        temperature: 0.2,
      }
    });

    const responseText = result.response.text();
    const parsedNarrative = JSON.parse(responseText);

    return res.status(200).json({
      success: true,
      data: parsedNarrative
    });

  } catch (error: any) {
    console.error('[api/report/narrative] Error:', error);
    return res.status(500).json({
      error: error.message || 'Terjadi kesalahan saat menghubungi Gemini AI Narrative Engine.'
    });
  }
}
