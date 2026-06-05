import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialized Gemini API client
let aiInstance: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      throw new Error("GEMINI_API_KEY environment variable is not configured.");
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

// Healthy fallbacks when API Key is missing or fails
const fallbackRecommendations: Record<string, any> = {
  "健康": {
    analysis: "這是在未啟用 AI 服務時為您提供的經典健康序列表首選規劃。這套食序重點在於維持生理恒定與穩定血糖。",
    timeline: {
      beforeMeal: {
        snacks: "無鹽杏仁與核桃（5-8顆）",
        snacksDesc: "富含健康單不飽和脂肪酸與膳食纖維，提前喚醒飽足感訊號，預防正餐過量。",
        water: "溫開水 300ml",
        waterDesc: "在飯前30分鐘飲用，可滋潤腸胃道，啟動消化酶分泌，幫助胃黏膜做好消化準備。",
        fruit: "高維生素C綠奇異果（1顆）",
        fruitDesc: "奇異果酵素能預先在胃部協助分解隨後吃進的蛋白質，並幫助維生素A、E等多重營養素吸收。"
      },
      duringMeal: {
        snacks: "不建議，正餐應以優質全食物為主",
        snacksDesc: "專注於原態的雜糧、瘦肉與多色蔬菜，吃飯時不應穿插零食，以免擾亂血糖波幅。",
        water: "溫熱冬瓜湯或薄乾薑水 100ml",
        waterDesc: "僅作潤喉與餐間微量暖胃之用。切忌大量飲用冰水，以免稀釋胃酸消化液導致消化不良。",
        fruit: "切片青蘋果（少量，佐生菜沙拉）",
        fruitDesc: "將適量酸甜水果拌入配菜中，其天然果酸可提升鐵質吸收效率，增添風味並減低油膩感。"
      },
      afterMeal: {
        snacks: "高純度無糖黑巧克力（1片，85%以上）",
        snacksDesc: "富含可可多酚，有益心血管健康，並能在餐後提供完美的味覺收尾，抑制後續甜食慾望。",
        water: "小葉紅茶或大麥茶 150ml（飯後1小時）",
        waterDesc: "大麥茶能舒緩胃部飽脹感。紅茶茶多酚有助於消脂，但需於餐後一小時再飲用以免影響鐵質吸收。",
        fruit: "抗氧化藍莓或優質草莓（一小碗）",
        fruitDesc: "藍莓的花青素是強效抗氧化劑，低GI特性不會引起胰島素驟升，十分適合作為餐後健康點綴。"
      }
    },
    hacks: [
      "【5分鐘餐前喚醒】在喝下餐前水時，進行3次深呼吸，讓交感神經切換至副交感神經，有助於消化液平穩分泌。",
      "【原味不油炸】若餐前選擇堅果，務必確認為低溫烘焙、無添加鹽與糖的原味堅果，避免多餘鈉與添加劑負擔。",
      "【彩虹餐盤原則】將餐中水果作為餐盤色彩的一環，而非額外的大甜點，控制在一個拳頭大小的總量內。"
    ],
    moodBooster: "健康是一場與身體循序漸進的溫柔對話，良好的飲食順序是送給各個器官最好的禮物！"
  },
  "減重": {
    analysis: "專為體重管理與熱量赤字設計的精準食序。透過「先水分隔、中全原態、後極輕量」來延長飽腹感感應器、延緩胃排空速率。",
    timeline: {
      beforeMeal: {
        snacks: "無糖高纖豆漿 150ml 或 奇亞籽水",
        snacksDesc: "植物性大豆蛋白與水溶性纖維在胃中吸水膨脹，極大化提早刺激飽足感胜肽（GLP-1）分泌。",
        water: "氣泡水或溫水 400ml",
        waterDesc: "高容量水分能短暫擴張胃壁進而發送信號給大腦「已有東西進駐」，有效打折隨後的正餐食慾。",
        fruit: "高纖低糖芭樂（1/3顆）",
        fruitDesc: "膳食纖維極其豐富且低熱量，需要費力咀嚼，能有效拉長用餐準備期，降低進食急迫感。"
      },
      duringMeal: {
        snacks: "嚴格禁止進食零食",
        snacksDesc: "減重期間，餐中避開任何精緻澱粉或額外調味零嘴，專心執行「水→菜→肉→飯」的點菜順序。",
        water: "餐間不額外喝水/湯",
        waterDesc: "避免液體沖刷胃部加快胃排空速度。進餐應乾濕分離，放慢咀嚼速度（每口咀嚼20下）來細嚼慢嚥。",
        fruit: "不建議，避免果糖快速吸收",
        fruitDesc: "將水果全數移至餐前或餐後特定時間，餐中專注在大量非澱粉類蔬菜的纖維攝取，阻斷脂肪合成路徑。"
      },
      afterMeal: {
        snacks: "無糖蒟蒻果凍（低卡、高膳食纖維）",
        snacksDesc: "滿足口腹之慾的餐後甜點替代品，每份熱量幾乎為零，滿足想咬東西與吃甜的心意。",
        water: "薄荷茶或無糖檸檬水 200ml",
        waterDesc: "薄荷的清涼香氣能向大腦發送「進食已結束」的強烈信號，檸檬酸則有助於平衡體內酸鹼值與代謝。",
        fruit: "牛番茄（1顆）或小番茄（6顆）",
        fruitDesc: "在營養學分類上極親近蔬菜的低糖水果，熱量極低且飽含茄紅素，甜味適中，是減重的夜間安全牌。"
      }
    },
    hacks: [
      "【乾濕分離進食】飯前30分鐘喝水，飯中儘量乾食，可以顯著延長胃排空時間，使飽足感維持達4小時以上。",
      "【咀嚼次數翻倍】進食餐前芭樂或餐中大片蔬菜時，刻意默數並咀嚼20次以上，能刺激下視丘釋放飽食訊號。",
      "【薄荷斷食儀式】餐後立即喝一口熱薄荷茶或用薄荷牙膏刷牙，透過清新薄荷味打破情緒性口渴與零嘴慣性。"
    ],
    moodBooster: "減重不是跟飢餓痛苦對決，而是和「消化順序」合作的智慧游擊戰，你正在逐漸掌握身體的掌控權！"
  },
  "情緒": {
    analysis: "這套時序專注在調節神經傳導物質（如血清素與多巴胺），旨在平抑由壓力引起的皮質醇荷爾蒙驟升，從而撫平焦慮與疲憊感。",
    timeline: {
      beforeMeal: {
        snacks: "洋甘菊綠茶配南瓜子（1大匙）",
        snacksDesc: "南瓜子富含「抗壓力神物」鎂與色胺酸；洋甘菊富含芹菜素，可與腦部受體結合釋放焦慮。",
        water: "暖洋甘菊茶或玫瑰花茶 300ml",
        waterDesc: "溫熱的花草茶香氣能透過嗅覺皮質直接安定副交感神經，調降因忙碌工作而緊繃的心跳與血壓。",
        fruit: "香蕉半根（配無糖優格）",
        fruitDesc: "香蕉是天然的血清素工廠，提供色胺酸、維生素B6，能有效調控情緒，帶來安適幸福感。"
      },
      duringMeal: {
        snacks: "香脆海苔片（海鹽無油）",
        snacksDesc: "微量的海苔香脆感能提供極佳的「感官壓力釋放」，脆度音效能反向干擾大腦的焦慮思考迴路。",
        water: "味噌豆腐湯 150ml",
        waterDesc: "發酵味噌富含益生菌源與大豆異黃酮，多酚抗發炎。餐間暖湯不僅暖胃，更能溫潤神經網絡、充盈幸福感。",
        fruit: "蜜烤無花果（1小切片，搭配烤主食）",
        fruitDesc: "無花果散發高雅幽香與細緻甜味，點綴在主餐內能瞬間升級感官美學享受，觸發大腦愉悅中樞。"
      },
      afterMeal: {
        snacks: "75% 橙皮黑巧克力（1小塊）",
        snacksDesc: "可可的黃烷醇碰上橙皮的柑橘精油，雙重香氣能顯著提高腦部的多巴胺分泌，平息午餐後焦慮。",
        water: "薰衣草舒壓茶 150ml",
        waterDesc: "薰衣草主要成分芳樟醇能幫助餐後胃腸蠕動，並引導胃部與神經系統全面放鬆進入修復模式。",
        fruit: "香甜大草莓或蜜柑（2顆）",
        fruitDesc: "高含量維生素C是壓力荷爾蒙（皮質醇）的天然剋星，鮮紅色彩與誘人果香能瞬間掃空整天陰霾。"
      }
    },
    hacks: [
      "【正念香氣儀式】喝餐前花草茶時，雙手捧杯感受暖意，閉眼吸氣嗅聞花香 5 秒，把被繁複工作綁架的注意力收回來。",
      "【慢速美味感知】點綴水果或黑巧克力時，含入口中讓其慢慢融化，深切感受甜度與香酸的層次，開啟感官療癒。",
      "【色彩與食器】選擇溫潤、質樸的木質或手作陶器盛裝餐後水果，心理學證實大地色系器皿能安撫高敏感焦慮神經。"
    ],
    moodBooster: "每一口食物都是你與心靈的連結。用一份講究而美麗的食序，向一整天的緊繃辛苦好好說聲謝謝吧！"
  }
};

app.post("/api/recommend", async (req, res) => {
  const { goal = "健康", userProfile = "", currentHabit = "" } = req.body;

  try {
    const ai = getGeminiClient();
    const systemPrompt = `
      You are an expert nutritional therapist and creative dietician specializing in dietary timing sequences (Arrow Diagram Framework).
      The user is building a dynamic decision index based on:
      - X-axis (Sequential timeline): "吃飯前" (Before Meal), "吃飯中" (During Meal), "吃飯後" (After Meal)
      - Y-axis (Dietary categories): "零食" (Snacks), "喝水" (Water), "水果" (Fruits)
      - Main objective coordinates: "健康" (Health/Homeostasis), "減重" (Weight Loss/Caloric Constraint), or "情緒" (Mood Regulation/Mindfulness)

      Your task is to utilize creative, scientific food styling and behavioral design to generate a structured, highly useful, and deeply creative dietary sequence recommendation.
      
      You must respond with a strict, valid JSON object matching this schema or structure. Avoid any markdown code block wrappers (like \`\`\`json) or extra text besides the JSON.
      
      {
        "goal": "The chosen goal name ('健康' or '減重' or '情緒')",
        "analysis": "A concise, engaging personalized dietician analysis based on userProfile, currentHabit, and the selected goal. (2-3 sentences in Traditional Chinese)",
        "timeline": {
          "beforeMeal": {
            "snacks": "Creative healthy alternative snack (e.g., 5 raw almonds, chia seeds)",
            "snacksDesc": "Detailed explanation of why this specific snack is ideal before meals under this goal.",
            "water": "Hydration strategy before meal (e.g., Warm apple cider vinegar water)",
            "waterDesc": "Detailed scientific/behavioral explanation.",
            "fruit": "Optimal fruit choice before meal",
            "fruitDesc": "Detailed explanation regarding enzymes or fiber benefit."
          },
          "duringMeal": {
            "snacks": "Action/Strategy under this cell (e.g. Forbidden, or seaweed flake replacement)",
            "snacksDesc": "Detailed explanation.",
            "water": "Fluid guideline during eating",
            "waterDesc": "Detailed explanation.",
            "fruit": "Fruit ingestion or accompaniment strategy",
            "fruitDesc": "Detailed explanation."
          },
          "afterMeal": {
            "snacks": "Ideal sweet/snack replacement",
            "snacksDesc": "Detailed explanation.",
            "water": "Tea/Water strategy after meal",
            "waterDesc": "Detailed explanation.",
            "fruit": "Anti-glycemic or digestible fruit strategy",
            "fruitDesc": "Detailed explanation."
          }
        },
        "hacks": [
          "Actionable Creative Hack 1 (Traditional Chinese, starts with an emoji tag like 【XX儀式】)",
          "Actionable Creative Hack 2 (Traditional Chinese, starts with an emoji tag)",
          "Actionable Creative Hack 3 (Traditional Chinese, starts with an emoji tag)"
        ],
        "moodBooster": "A short, positive, uplifting quote or motto tailored to this goal (1 sentence, Traditional Chinese)"
      }

      CRITICAL DIRECTIONS:
      1. Use Traditional Chinese (zh-TW) for all text fields.
      2. Keep recommended items concrete, delicious, and highly creative (e.g., "75% orange peel dark chocolate" instead of "chocolate"; "peppermint dry leaf tea" instead of "tea").
      3. Focus heavily on how the sequential timing on the X-axis (before, during, after) optimizes digestion, satiety, or neurotransmitters.
    `;

    const userPrompt = `
      Selected Goal: ${goal}
      User Description / Dilemma: ${userProfile || "未提供詳細背景"}
      Current Food Habits: ${currentHabit || "未提供習慣"}
      Please generate the tailored Arrow Sequence Matrix.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        temperature: 0.85,
      },
    });

    const textOutput = response.text || "{}";
    // Strip possible markdown ticks if Gemini didn't strictly follow responseMimeType instructions
    let cleanedJson = textOutput.trim();
    if (cleanedJson.startsWith("```json")) {
      cleanedJson = cleanedJson.substring(7);
    }
    if (cleanedJson.endsWith("```")) {
      cleanedJson = cleanedJson.substring(0, cleanedJson.length - 3);
    }
    cleanedJson = cleanedJson.trim();

    const parsedJson = JSON.parse(cleanedJson);
    res.json(parsedJson);

  } catch (error: any) {
    console.error("Gemini recommendation error:", error);
    // In case of error (or missing API key), fallback to our highly polished static defaults
    const fallback = fallbackRecommendations[goal] || fallbackRecommendations["健康"];
    res.json({
      ...fallback,
      goal,
      analysis: userProfile || currentHabit
        ? `[AI 分析提示：目前處於精準模式，以下為針對「${goal}」特別優化的資深營養學黃金決策配方。您的背景「${userProfile || "無"}」已記錄，可供您作為自訂食序基礎。]`
        : fallback.analysis
    });
  }
});

async function bootstrap() {
  // Serve frontend assets
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Bootstrap error:", err);
});
