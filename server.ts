import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "10kb" }));

// Lightweight in-memory rate limit for the public AI endpoint.
// This keeps the app simple while preventing accidental API overuse.
const requestBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 8;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = requestBuckets.get(ip);

  if (!bucket || bucket.resetAt < now) {
    requestBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

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
        waterDesc: "在飯前30分鐘飲用，像替身體按下「準備吃飯」的溫柔提示，也避免一坐下就太急著開吃。",
        fruit: "高維生素C綠奇異果（1顆）",
        fruitDesc: "奇異果酵素能預先在胃部協助分解隨後吃進的蛋白質，並幫助維生素A、E等多重營養素吸收。"
      },
      duringMeal: {
        snacks: "不建議，正餐應以優質全食物為主",
        snacksDesc: "專注於原態的雜糧、瘦肉與多色蔬菜，吃飯時不應穿插零食，以免擾亂血糖波幅。",
        water: "溫熱冬瓜湯或薄乾薑水 100ml",
        waterDesc: "僅作潤喉與餐間微量暖胃之用。避免一次喝太多冰水；若你本來就容易脹氣或逆流，餐中少量暖飲會比較舒服。",
        fruit: "切片青蘋果（少量，佐生菜沙拉）",
        fruitDesc: "將適量酸甜水果拌入配菜中，可以增加風味層次，也減低油膩感。"
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
      "【5分鐘餐前喚醒】在喝下餐前水時，進行3次深呼吸，讓自己從工作節奏切換到吃飯節奏。",
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
        snacksDesc: "植物性蛋白與水溶性纖維很適合先墊一下胃口，讓等一下的正餐不會一開始就失速。",
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
        fruitDesc: "將水果全數移至餐前或餐後特定時間，餐中專注在大量非澱粉類蔬菜的纖維攝取，減少正餐中甜味與多餘熱量的干擾。"
      },
      afterMeal: {
        snacks: "無糖蒟蒻果凍（低卡、高膳食纖維）",
        snacksDesc: "滿足口腹之慾的餐後甜點替代品，每份熱量幾乎為零，滿足想咬東西與吃甜的心意。",
        water: "薄荷茶或無糖檸檬水 200ml",
        waterDesc: "薄荷的清涼香氣很適合當作「進食已結束」的小儀式，檸檬片則讓水更清爽。",
        fruit: "牛番茄（1顆）或小番茄（6顆）",
        fruitDesc: "在營養學分類上極親近蔬菜的低糖水果，熱量極低且飽含茄紅素，甜味適中，是減重的夜間安全牌。"
      }
    },
    hacks: [
      "【乾濕分離進食】飯前30分鐘先補水，飯中少量潤喉，把重點放在慢慢咀嚼與感受飽足。",
      "【咀嚼次數翻倍】進食餐前芭樂或餐中大片蔬菜時，刻意默數並咀嚼20次以上，能刺激下視丘釋放飽食訊號。",
      "【薄荷斷食儀式】餐後立即喝一口熱薄荷茶或用薄荷牙膏刷牙，透過清新薄荷味打破情緒性口渴與零嘴慣性。"
    ],
    moodBooster: "減重不是跟飢餓痛苦對決，而是和「消化順序」合作的智慧游擊戰，你正在逐漸掌握身體的掌控權！"
  },
  "情緒": {
    analysis: "這套時序專注在建立溫柔的餐前、餐中、餐後儀式，用香氣、口感與小份量甜味收尾，幫助忙碌的大腦慢慢降速。",
    timeline: {
      beforeMeal: {
        snacks: "洋甘菊綠茶配南瓜子（1大匙）",
        snacksDesc: "南瓜子有咀嚼感與堅果香；洋甘菊的香氣很適合做餐前轉場，讓節奏慢下來。",
        water: "暖洋甘菊茶或玫瑰花茶 300ml",
        waterDesc: "溫熱的花草茶香氣能提醒身體進入放慢模式，讓吃飯前的節奏更安定。",
        fruit: "香蕉半根（配無糖優格）",
        fruitDesc: "香蕉像溫柔的情緒小補給，搭配優格可作為餐前不過量、也有飽足感的小點。"
      },
      duringMeal: {
        snacks: "香脆海苔片（海鹽無油）",
        snacksDesc: "微量的海苔香脆感能提供極佳的「感官壓力釋放」，脆度音效能反向干擾大腦的焦慮思考迴路。",
        water: "味噌豆腐湯 150ml",
        waterDesc: "味噌豆腐湯帶有溫暖的鮮味與 comfort food 感，餐間少量喝能讓整餐更安定。",
        fruit: "蜜烤無花果（1小切片，搭配烤主食）",
        fruitDesc: "無花果散發高雅幽香與細緻甜味，點綴在主餐內能瞬間升級感官美學享受，觸發大腦愉悅中樞。"
      },
      afterMeal: {
        snacks: "75% 橙皮黑巧克力（1小塊）",
        snacksDesc: "可可的黃烷醇碰上橙皮的柑橘精油，雙重香氣很適合當作餐後小小獎賞，幫助味覺有一個漂亮的收尾。",
        water: "薰衣草舒壓茶 150ml",
        waterDesc: "薰衣草茶的香氣很適合做餐後降速儀式，提醒自己今天可以慢慢收工了。",
        fruit: "香甜大草莓或蜜柑（2顆）",
        fruitDesc: "高含量維生素C與鮮紅色彩很適合作為餐後清爽點綴，讓整餐收在明亮的果香裡。"
      }
    },
    hacks: [
      "【正念香氣儀式】喝餐前花草茶時，雙手捧杯感受暖意，閉眼吸氣嗅聞花香 5 秒，把被繁複工作綁架的注意力收回來。",
      "【慢速美味感知】點綴水果或黑巧克力時，含入口中讓其慢慢融化，深切感受甜度與香酸的層次，開啟感官療癒。",
      "【色彩與食器】選擇溫潤、質樸的木質或手作陶器盛裝餐後水果，讓「好好吃飯」這件事更有儀式感。"
    ],
    moodBooster: "每一口食物都是你與心靈的連結。用一份講究而美麗的食序，向一整天的緊繃辛苦好好說聲謝謝吧！"
  }
};

app.post("/api/recommend", async (req, res) => {
  const rawGoal = req.body?.goal || "健康";
  const allowedGoals = ["健康", "減重", "情緒"];
  const goal = allowedGoals.includes(rawGoal) ? rawGoal : "健康";
  const userProfile = String(req.body?.userProfile || "").slice(0, 500);
  const currentHabit = String(req.body?.currentHabit || "").slice(0, 500);

  if (isRateLimited(req.ip || "unknown")) {
    return res.status(429).json({ error: "請稍後再試，AI 推薦請求稍微太密集了。" });
  }

  try {
    const ai = getGeminiClient();
    const systemPrompt = `
      你是一個有趣、溫柔、生活化的飲食順序創意助理。
      你的任務是根據使用者的目標，提供餐前、餐中、餐後的飲食順序小建議。

      風格：
      - 輕鬆、有畫面感、有趣，但不要像醫療指引。
      - 可以使用比喻，例如「收尾儀式」、「穩定小幫手」、「甜味剎車」。
      - 不要過度嚴肅，也不要每段都提醒醫療風險。
      - 保留創意與可口感，讓建議像一張可執行的小食序卡。

      限制：
      - 不要保證減重、治療疾病或改善特定醫療狀況。
      - 不要編造精確百分比、臨床效果數字或過度肯定的生化機制。
      - 少用「直接提升多巴胺」、「阻斷脂肪生成」、「降低皮質醇」、「稀釋胃酸」這類絕對說法。
      - 如果要提到效果，請用「可能有助於」、「比較適合」、「可以作為一種小習慣」。
      - 使用繁體中文。

      你必須只回傳一個嚴格、有效的 JSON object，不要加 markdown code block。

      JSON 結構如下：
      {
        "goal": "健康 或 減重 或 情緒",
        "analysis": "2-3句繁體中文，生活化且有趣的分析",
        "timeline": {
          "beforeMeal": { "snacks": "", "snacksDesc": "", "water": "", "waterDesc": "", "fruit": "", "fruitDesc": "" },
          "duringMeal": { "snacks": "", "snacksDesc": "", "water": "", "waterDesc": "", "fruit": "", "fruitDesc": "" },
          "afterMeal": { "snacks": "", "snacksDesc": "", "water": "", "waterDesc": "", "fruit": "", "fruitDesc": "" }
        },
        "hacks": ["三個可執行的小妙招"],
        "moodBooster": "一句鼓勵語"
      }
    `;

    const userPrompt = `
      Selected Goal: ${goal}
      User Description / Dilemma: ${userProfile || "未提供詳細背景"}
      Current Food Habits: ${currentHabit || "未提供習慣"}
      Please generate the tailored Arrow Sequence Matrix.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        temperature: 0.55,
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
    res.json({
      ...parsedJson,
      goal,
      source: "ai"
    });

  } catch (error: any) {
    console.error("Gemini recommendation error:", error);
    // In case of error (or missing API key), fallback to the static defaults.
    const fallback = fallbackRecommendations[goal] || fallbackRecommendations["健康"];
    res.json({
      ...fallback,
      goal,
      source: "fallback",
      warning: "目前 AI 暫時沒有回應，以下先顯示預設創意食序；不是個人化 AI 分析。",
      analysis: userProfile || currentHabit
        ? `AI 暫時沒有回應，所以先為你載入「${goal}」預設創意食序。你剛剛輸入的生活情境可以稍後再重新送出，讓 AI 產生更個人化的版本。`
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
