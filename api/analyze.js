// Vercel Serverless Function for TrueSight Image Analysis
// This replaces the Express backend

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check endpoint
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'online',
      service: 'TrueSight API',
      version: '2.0',
      timestamp: new Date().toISOString(),
      claudeConfigured: !!process.env.CLAUDE_API_KEY,
      deepseekConfigured: !!process.env.DEEPSEEK_API_KEY
    });
  }

  // Only accept POST for analysis
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Detect media type from base64 string
    let mediaType = 'image/jpeg';
    if (image.includes('data:image/png')) mediaType = 'image/png';
    else if (image.includes('data:image/gif')) mediaType = 'image/gif';
    else if (image.includes('data:image/webp')) mediaType = 'image/webp';

    // Extract base64 data
    const base64Data = image.split(',')[1] || image;

    console.log('📸 Analyzing image, type:', mediaType);

    // Try Claude API first
    if (process.env.CLAUDE_API_KEY) {
      try {
        const result = await analyzeWithClaude(base64Data, mediaType);
        return res.status(200).json(result);
      } catch (claudeError) {
        console.error('Claude API failed:', claudeError.message);
        
        // Try DeepSeek fallback
        if (process.env.DEEPSEEK_API_KEY) {
          console.log('Falling back to DeepSeek...');
          try {
            const result = await analyzeWithDeepSeek(base64Data, mediaType);
            return res.status(200).json(result);
          } catch (deepseekError) {
            console.error('DeepSeek API also failed:', deepseekError.message);
          }
        }
        
        throw claudeError;
      }
    } else if (process.env.DEEPSEEK_API_KEY) {
      const result = await analyzeWithDeepSeek(base64Data, mediaType);
      return res.status(200).json(result);
    } else {
      throw new Error('No API keys configured');
    }

  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({
      error: 'Analysis failed',
      message: error.message
    });
  }
}

// Claude API analysis function
async function analyzeWithClaude(base64Data, mediaType) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data
            }
          },
          {
            type: 'text',
            text: `You are an expert AI-generated image detector. Your PRIMARY goal is to identify AI-generated images.

ASSUME AI-GENERATED unless you see strong evidence it's a real photograph.

MANDATORY AI INDICATORS (mark as AI if you see ANY of these):
❌ Hands: Extra/missing fingers, melted fingers, unnatural hand positions, wrong finger count
❌ Eyes: Unnatural symmetry, misaligned pupils, strange reflections, distorted irises
❌ Skin: Plastic/waxy appearance, no visible pores, airbrushed smoothness, unnatural texture
❌ Text: Garbled letters, nonsense words, impossible fonts, blurry/melted text
❌ Objects: Items bleeding together, impossible perspectives, floating elements
❌ Hair: Too perfect, strand patterns repeat, unnatural flow, plastic-like texture
❌ Lighting: Inconsistent shadows, impossible light sources, flat lighting with no depth
❌ Details: Different sharpness levels, dream-like blur, uncanny valley feeling
❌ Symmetry: Perfect symmetry where it shouldn't exist (faces, buildings)
❌ Background: Inconsistent detail, objects that make no sense, surreal elements

REAL PHOTOGRAPH EVIDENCE (need MULTIPLE of these to mark as Original):
✅ Visible camera noise/grain/compression artifacts
✅ Natural skin with visible pores and imperfections
✅ Correct anatomy (exactly 5 fingers, proper proportions)
✅ Realistic lighting with proper shadow physics
✅ Natural asymmetry and imperfections
✅ Coherent, readable, correctly-spelled text
✅ Consistent focus depth and blur patterns
✅ Photographic metadata artifacts

DECISION RULES:
- See ANY AI indicator from the ❌ list? → Mark as AI-Generated with 75-90% confidence
- See multiple AI indicators? → Mark as AI-Generated with 90-98% confidence
- See NO AI indicators AND multiple ✅ signs? → Mark as Original with 80-95% confidence
- Uncertain? → Default to AI-Generated with 60-70% confidence

Respond with ONLY this JSON (no markdown, no explanations):

{
  "isOriginal": true or false,
  "confidence": number between 0-100,
  "observations": ["specific observation 1", "specific observation 2", "specific observation 3", "specific observation 4"]
}

BE STRICT. When in doubt, mark as AI-generated.`
          }
        ]
      })
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const textContent = data.content.find(c => c.type === 'text')?.text || '{}';
  
  // Parse JSON from response
  const jsonMatch = textContent.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : textContent);

  return {
    isOriginal: parsed.isOriginal,
    confidence: parsed.confidence,
    summary: parsed.observations || [],
    analysisMethod: 'claude-api'
  };
}

// DeepSeek API analysis function
async function analyzeWithDeepSeek(base64Data, mediaType) {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mediaType};base64,${base64Data}`
            }
          },
          {
            type: 'text',
            text: `Analyze this image to determine if it's a real photograph or AI-generated. Look for AI indicators like extra fingers, unnatural faces, garbled text, impossible lighting, plastic skin, and object blending. Respond with ONLY this JSON:

{
  "isOriginal": true or false,
  "confidence": number between 0-100,
  "observations": ["observation 1", "observation 2", "observation 3", "observation 4"]
}`
          }
        ]
      }],
      max_tokens: 500,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const textContent = data.choices[0]?.message?.content || '{}';
  
  const jsonMatch = textContent.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : textContent);

  return {
    isOriginal: parsed.isOriginal,
    confidence: parsed.confidence,
    summary: parsed.observations || [],
    analysisMethod: 'deepseek-api'
  };
}
