import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // AI Assistant endpoint
  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const { history, message, contextData } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(400).json({ error: "Gemini API key is missing. Please set GEMINI_API_KEY in the environment." });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const systemInstruction = `You are Gemini AI Assistant integrated inside a professional Water Quality Index (WQI) and environmental intelligence platform.

Your task is to analyze user queries using scientific reasoning and available environmental data.

You specialize in:
- Water Quality Index (WQI) computation and interpretation
- Water parameter analysis (pH, DO, BOD, COD, TDS, turbidity, etc.)
- Site-wise environmental comparison
- Geospatial water quality interpretation
- Scientific reporting and decision support

You must behave like a domain expert system for hydrology and environmental science.

---

INPUT CONTEXT:
The user will provide you with the current site-wise water quality dataset, WQI scores, and classification settings as part of their message or context.

---

PROCESSING RULES:

1. Always prioritize dataset as ground truth.
2. Perform structured scientific reasoning.
3. Identify key influencing water quality parameters.
4. Classify water quality using WQI logic:
   - Excellent
   - Good
   - Moderate
   - Poor
   - Very Poor / Unfit (depending on class system selected)
5. If multiple sites exist, compare them and highlight variation.
6. Detect anomalies or critical pollution signals.

---

OUTPUT FORMAT (STRICT):

## 1. Summary Insight
Short scientific interpretation of the result.

## 2. Technical Analysis
Breakdown of water quality parameters and their impact.

## 3. WQI Classification
- Site-wise classification
- Score interpretation
- Category logic used

## 4. Risk Assessment
- Drinking water suitability
- Agricultural suitability
- Environmental risk level

## 5. Recommendation
- Monitoring actions
- Pollution control measures
- Policy or intervention suggestions

---

STRICT RULES:
- Do not hallucinate missing data
- Do not give medical diagnosis
- Do not output informal conversation
- Do not change scientific meaning of input data
- Keep response structured and research-grade
- Only format the output if the user asks for a comprehensive analysis. If they ask a simple question, answer it directly but concisely with scientific rigor.

FINAL ROLE:
You are a Water Intelligence Decision Support Engine powered by Gemini AI inside a geospatial environmental analytics platform.`;

      // Structure context if provided
      let promptContent = message;
      if (contextData) {
        promptContent = `[CONTEXT DATA FROM PLATFORM]\n${JSON.stringify(contextData, null, 2)}\n\n[USER QUERY]\n${message}`;
      }
      
      // Let's use \`generateContent\` with history included in the prompt.
      let fullContent = promptContent;
      if (history && history.length > 0) {
        const historyText = history.map((m: any) => `${m.role.toUpperCase()}: ${m.parts[0].text}`).join('\n\n');
        fullContent = `[CHAT HISTORY]\n${historyText}\n\n[NEW TURN]\n${promptContent}`;
      }

      let response;
      let retries = 3;
      while (retries > 0) {
        try {
          response = await ai.models.generateContent({
            model: "gemini-1.5-flash",
            contents: fullContent,
            config: {
              systemInstruction: systemInstruction,
              temperature: 0.2,
            }
          });
          break;
        } catch (e: any) {
          if (e.status === 503 || e.status === 'UNAVAILABLE' || e.message?.includes('503')) {
            retries--;
            if (retries === 0) throw e;
            await new Promise(r => setTimeout(r, 2000));
          } else {
            throw e;
          }
        }
      }

      return res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      const message = error.message || error.toString();
      if (message.includes('503') || message.includes('high demand') || message.includes('UNAVAILABLE')) {
        return res.status(503).json({ error: "The AI model is currently experiencing high demand. Please try again in an hour." });
      }
      return res.status(500).json({ error: "An error occurred with the AI assistant. Please try again." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
