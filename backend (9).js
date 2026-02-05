// backend.js - Compatible with your TrueSight frontend
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// API Keys
const CLAUDE_KEY = process.env.CLAUDE_API_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

// Health Check Endpoint
app.get("/", (req, res) => {
  res.json({ 
    status: "TrueSight Backend is running!", 
    endpoints: ["/analyze"],
    apiKeys: {
      claude: !!CLAUDE_KEY,
      deepseek: !!DEEPSEEK_KEY
    },
    timestamp: new Date().toISOString()
  });
});

// Main Analysis Endpoint
app.post("/analyze", async (req, res) => {
  console.log("\n" + "=".repeat(60));
  console.log("📥 New Analysis Request Received");
  console.log("=".repeat(60));
  
  const { image } = req.body;
  
  if (!image) {
    console.error("❌ ERROR: No image provided in request body");
    return res.status(400).json({ 
      error: "No image provided",
      message: "Please upload an image to analyze" 
    });
  }

  try {
    // Extract base64 data and media type from data URL
    let base64Data = image;
    let mediaType = "image/jpeg";

    if (image.includes(',')) {
      const parts = image.split(',');
      const header = parts[0];
      const mimeMatch = header.match(/data:(image\/[a-zA-Z]+);/);
      if (mimeMatch) {
        mediaType = mimeMatch[1];
      }
      base64Data = parts[1];
      console.log("📎 Extracted base64 data from data URL");
    }

    console.log("✅ Image received successfully");
    console.log("   🖼️  Detected media type:", mediaType);
    console.log("   📊 Base64 length:", base64Data.length, "characters");
    console.log("   📏 Approximate size:", Math.round(base64Data.length * 0.75 / 1024), "KB");

    // Choose analysis method based on available API keys
    // Priority: Claude > DeepSeek > Mock
    let result;
    if (CLAUDE_KEY) {
      console.log("\n🤖 Using Claude API for AI-powered analysis...");
      result = await analyzeWithClaude(base64Data, mediaType);
    } else if (DEEPSEEK_KEY) {
      console.log("\n🧠 Using DeepSeek API for AI-powered analysis...");
      result = await analyzeWithDeepSeek(base64Data, mediaType);
    } else {
      console.log("\n🎲 No API key configured - Using mock analysis");
      console.log("   💡 Add CLAUDE_API_KEY or DEEPSEEK_API_KEY to .env for real AI analysis");
      result = performMockAnalysis();
    }

    console.log("\n✅ Analysis Complete!");
    console.log("   🎯 Result:", result.isOriginal ? "ORIGINAL" : "AI-GENERATED");
    console.log("   📊 Confidence:", result.confidence + "%");
    console.log("=".repeat(60) + "\n");

    res.json(result);

  } catch (err) {
    console.error("\n❌ ANALYSIS ERROR:");
    console.error("   Message:", err.message);
    console.error("   Stack:", err.stack);
    console.error("=".repeat(60) + "\n");
    
    res.status(500).json({ 
      error: "Failed to analyze image", 
      message: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Mock Analysis Function
function performMockAnalysis() {
  console.log("   🔄 Generating mock analysis results...");
  
  const isOriginal = Math.random() > 0.5;
  const confidence = Math.floor(Math.random() * 21) + 75;
  
  const summary = isOriginal ? [
    "Natural texture patterns detected throughout the image",
    "Lighting and shadow consistency appears authentic",
    "No obvious AI generation artifacts found",
    "Image metadata suggests original capture"
  ] : [
    "Unusual smoothness patterns detected in specific regions",
    "Inconsistent noise distribution across the image",
    "Texture repetition patterns typical of AI generation",
    "Subtle artifacts found in fine details"
  ];

  return { isOriginal, confidence, summary, analysisMethod: "mock" };
}

// Claude API Analysis Function
async function analyzeWithClaude(base64Data, mediaType) {
  console.log("   📡 Connecting to Claude API...");
  console.log("   🖼️  Image type:", mediaType);

  try {
    const requestBody = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64Data
            }
          },
          {
            type: "text",
            text: `You are an expert AI image detector. Analyze this image carefully to determine if it's a REAL photograph or AI-GENERATED.

Look for these AI generation indicators:
- Extra fingers, melted or distorted hands
- Unnatural facial features or asymmetry
- Garbled or nonsensical text
- Objects blending together unnaturally
- Unrealistic lighting or shadows
- Plastic-smooth skin with no pores
- Wrong number of limbs or body parts
- Impossible geometry or dream-like distortions

Also consider signs of authenticity:
- Natural camera noise and grain
- Realistic lighting and shadows
- Proper perspective and depth
- Natural skin texture with pores
- Coherent text if present
- Anatomically correct features

Please respond with ONLY a valid JSON object (no markdown, no explanations):

{
  "isOriginal": true or false,
  "confidence": number between 0-100,
  "observations": ["observation 1", "observation 2", "observation 3", "observation 4"]
}

Rules:
- isOriginal: true = real photograph, false = AI-generated
- confidence: 85-95% if very clear, 70-80% if fairly sure, 50-65% if uncertain
- observations: exactly 4 specific things you noticed in THIS image`
          }
        ]
      }]
    };

    console.log("   ⏳ Sending request to Claude...");
    
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": CLAUDE_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    console.log("   📨 Response received, status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("   ❌ Claude API Error Response:", errorText);
      throw new Error(`Claude API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const textContent = data.content.find(c => c.type === 'text')?.text || '';
    
    console.log("   📄 Claude raw response:", textContent.substring(0, 150) + "...");
    
    try {
      let jsonText = textContent.trim();
      if (jsonText.includes('```')) {
        jsonText = jsonText.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
      }
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonText = jsonMatch[0];
      
      console.log("   🔍 Parsing JSON response...");
      const parsed = JSON.parse(jsonText);
      
      if (typeof parsed.isOriginal !== 'boolean') throw new Error("isOriginal must be boolean");
      if (typeof parsed.confidence !== 'number') throw new Error("confidence must be number");
      if (!Array.isArray(parsed.observations)) throw new Error("observations must be array");
      
      console.log("   ✅ Successfully parsed Claude's analysis");
      
      return {
        isOriginal: parsed.isOriginal,
        confidence: Math.min(100, Math.max(0, Math.round(parsed.confidence))),
        summary: parsed.observations,
        analysisMethod: "claude-api"
      };
      
    } catch (parseErr) {
      console.error("   ⚠️  Failed to parse Claude response:", parseErr.message);
      console.log("   🔄 Attempting fallback parsing...");
      
      const textLower = textContent.toLowerCase();
      const isOriginal = !textLower.includes("ai-generated") && 
                        !textLower.includes("artificial") &&
                        !textLower.includes("generated") &&
                        !textLower.includes("fake");
      
      const lines = textContent.split('\n').filter(line => line.trim().length > 10);
      const observations = lines.slice(0, 4).map(line => line.replace(/^[-*•\d.)\]]+\s*/, '').trim());
      
      return {
        isOriginal,
        confidence: 70,
        summary: observations.length > 0 ? observations : [
          "Analysis completed but response format was unexpected",
          "Technical analysis performed on image structure",
          "Review recommended for accuracy verification",
          "Consider manual inspection for confirmation"
        ],
        analysisMethod: "claude-api-fallback"
      };
    }
    
  } catch (apiError) {
    console.error("   ❌ Claude API Error:", apiError.message);
    if (apiError.message.includes('401')) console.error("   🔑 Authentication failed - check your API key");
    else if (apiError.message.includes('429')) console.error("   ⏱️  Rate limit exceeded");
    
    console.log("   🔄 Falling back to mock analysis...");
    const mockResult = performMockAnalysis();
    mockResult.analysisMethod = "mock-fallback";
    mockResult.fallbackReason = apiError.message;
    return mockResult;
  }
}

// DeepSeek API Analysis Function
async function analyzeWithDeepSeek(base64Data, mediaType) {
  console.log("   📡 Connecting to DeepSeek API...");
  console.log("   🖼️  Image type:", mediaType);

  try {
    const apiUrl = "https://api.deepseek.com/v1/chat/completions";
    
    console.log("   ⏳ Sending request to DeepSeek...");
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEEPSEEK_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mediaType};base64,${base64Data}`
              }
            },
            {
              type: "text",
              text: `You are an expert image forensics analyst. Analyze this image to determine if it's an original photograph or AI-generated/heavily edited.

Please respond with ONLY a valid JSON object (no markdown formatting, no code blocks, no explanations) in this exact format:

{
  "isOriginal": true or false,
  "confidence": number between 0-100,
  "observations": ["observation 1", "observation 2", "observation 3", "observation 4"]
}

Analysis criteria:
- isOriginal: true if it appears to be a genuine unedited photograph, false if AI-generated or heavily manipulated
- confidence: your certainty level from 0-100 (be honest about uncertainty)
- observations: exactly 4 specific technical observations that support your conclusion

Focus on:
- Texture consistency and noise patterns
- Lighting and shadow coherence
- Edge artifacts and blending
- Anatomical or structural accuracy
- Common AI generation signatures`
            }
          ]
        }],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    console.log("   📨 Response received, status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("   ❌ DeepSeek API Error Response:", errorText);
      throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content || '';
    
    console.log("   📄 DeepSeek raw response:", textContent.substring(0, 150) + "...");
    
    try {
      let jsonText = textContent.trim();
      if (jsonText.includes('```')) {
        jsonText = jsonText.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
      }
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonText = jsonMatch[0];
      
      console.log("   🔍 Parsing JSON response...");
      const parsed = JSON.parse(jsonText);
      
      if (typeof parsed.isOriginal !== 'boolean') throw new Error("isOriginal must be boolean");
      if (typeof parsed.confidence !== 'number') throw new Error("confidence must be number");
      if (!Array.isArray(parsed.observations)) throw new Error("observations must be array");
      
      console.log("   ✅ Successfully parsed DeepSeek's analysis");
      
      return {
        isOriginal: parsed.isOriginal,
        confidence: Math.min(100, Math.max(0, Math.round(parsed.confidence))),
        summary: parsed.observations,
        analysisMethod: "deepseek-api"
      };
      
    } catch (parseErr) {
      console.error("   ⚠️  Failed to parse DeepSeek response:", parseErr.message);
      console.log("   🔄 Attempting fallback parsing...");
      
      const textLower = textContent.toLowerCase();
      const isOriginal = !textLower.includes("ai-generated") && 
                        !textLower.includes("artificial") &&
                        !textLower.includes("generated");
      
      const lines = textContent.split('\n').filter(line => line.trim().length > 10);
      const observations = lines.slice(0, 4).map(line => line.replace(/^[-*•\d.)\]]+\s*/, '').trim());
      
      return {
        isOriginal,
        confidence: 70,
        summary: observations.length > 0 ? observations : [
          "Analysis completed with limited data",
          "Technical pattern analysis performed",
          "Manual review recommended for accuracy",
          "Consider additional verification methods"
        ],
        analysisMethod: "deepseek-api-fallback"
      };
    }
    
  } catch (apiError) {
    console.error("   ❌ DeepSeek API Error:", apiError.message);
    if (apiError.message.includes('401')) console.error("   🔑 Authentication failed - check your DeepSeek API key");
    else if (apiError.message.includes('429')) console.error("   ⏱️  Rate limit exceeded");
    
    console.log("   🔄 Falling back to mock analysis...");
    const mockResult = performMockAnalysis();
    mockResult.analysisMethod = "mock-fallback";
    mockResult.fallbackReason = apiError.message;
    return mockResult;
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Unhandled Server Error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    message: `Cannot ${req.method} ${req.path}`,
    availableEndpoints: ["GET /", "POST /analyze"]
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log("\n" + "═".repeat(70));
  console.log("🚀 TrueSight Backend Server - Image Authenticity Detector");
  console.log("═".repeat(70));
  console.log(`✅ Server Status:     Running`);
  console.log(`🌐 Server URL:        http://localhost:${PORT}`);
  console.log(`📍 Health Check:      http://localhost:${PORT}/`);
  console.log(`📍 Analyze Endpoint:  POST http://localhost:${PORT}/analyze`);
  console.log(`🔑 Claude API:        ${CLAUDE_KEY ? '✅ Configured' : '❌ Not Configured'}`);
  console.log(`🔑 DeepSeek API:      ${DEEPSEEK_KEY ? '✅ Configured' : '❌ Not Configured'}`);
  console.log(`🤖 AI Analysis:       ${CLAUDE_KEY || DEEPSEEK_KEY ? '✅ Active' : '❌ Mock Mode'}`);
  console.log(`⏰ Started:           ${new Date().toLocaleString()}`);
  console.log("═".repeat(70));
  
  if (!CLAUDE_KEY && !DEEPSEEK_KEY) {
    console.log("\n💡 TIP: Add an API key to .env file for real AI analysis:");
    console.log("   CLAUDE_API_KEY=sk-ant-api03-xxxxx");
    console.log("   DEEPSEEK_API_KEY=your-deepseek-key");
    console.log("\n   Priority: Claude > DeepSeek > Mock");
  } else if (CLAUDE_KEY && DEEPSEEK_KEY) {
    console.log("\n✨ Both APIs configured! Using Claude as primary (higher priority)");
  } else if (CLAUDE_KEY) {
    console.log("\n🤖 Using Claude API for analysis");
  } else if (DEEPSEEK_KEY) {
    console.log("\n🧠 Using DeepSeek API for analysis");
  }
  
  console.log("\n📖 Ready to analyze images! Waiting for requests...\n");
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⏹️  SIGTERM received. Shutting down gracefully...');
  server.close(() => { console.log('✅ Server closed'); process.exit(0); });
});

process.on('SIGINT', () => {
  console.log('\n⏹️  SIGINT received. Shutting down gracefully...');
  server.close(() => { console.log('✅ Server closed'); process.exit(0); });
});
