// app/api/chat/route.ts
import { NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const DEEPINFRA_API_KEY = process.env.DEEPINFRA_API_KEY;
const HF_API_KEY = process.env.HF_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "mistral/mixtral-8x7b-instruct";
const DEEPINFRA_MODEL = process.env.DEEPINFRA_MODEL ?? "mixtral-8x7b-instruct";
const HF_MODEL = process.env.HF_MODEL ?? "mistralai/Mistral-7B-Instruct-v0.2";
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama3-70b-8192";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// util: timeout fetch
async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
}

// util: try extract text from many shapes
function extractTextGeneric(data: any): string | null {
    if (!data) return null;

    // OpenAI-like: choices[0].message.content (string or object)
    try {
        const c0 = data?.choices?.[0];
        if (c0) {
            // message.content could be string or { content: [{ text: "..." }] } etc.
            const msg = c0.message ?? c0;
            if (typeof msg === "string") return msg.trim();
            if (typeof msg?.content === "string") return msg.content.trim();
            if (Array.isArray(msg?.content)) {
                // e.g. [{ type: "output_text", text: "..." }]
                const joined = msg.content.map((p: any) => p?.text ?? p?.parts?.map((x: any) => x.text).join("") ?? "").join("\n");
                if (joined.trim()) return joined.trim();
            }
            // sometimes choice has text directly
            if (typeof c0.text === "string") return c0.text.trim();
        }
    } catch { }

    // HuggingFace style: data[0].generated_text or .generated_text
    if (Array.isArray(data) && data[0]?.generated_text) return data[0].generated_text.trim();
    if (typeof data?.generated_text === "string") return data.generated_text.trim();

    // Gemini style: candidates[0].content.parts[].text
    try {
        const cand = data?.candidates?.[0];
        if (cand) {
            if (Array.isArray(cand?.content?.parts)) {
                const joined = cand.content.parts.map((p: any) => p?.text ?? "").join("\n").trim();
                if (joined) return joined;
            }
            if (typeof cand?.output === "string") return cand.output.trim();
        }
    } catch { }

    // fallback: find longest string in object
    function findLongest(obj: any): string | null {
        let longest = "";
        function recur(x: any) {
            if (typeof x === "string") {
                if (x.length > longest.length) longest = x;
            } else if (Array.isArray(x)) x.forEach(recur);
            else if (x && typeof x === "object") Object.values(x).forEach(recur);
        }
        recur(obj);
        return longest || null;
    }
    return findLongest(data);
}

/* ---------- provider callers ---------- */

// OpenRouter (OpenRouter API ~ OpenAI chat shape)
async function callOpenRouter(prompt: string) {
    if (!OPENROUTER_API_KEY) return null;
    const url = "https://openrouter.ai/api/v1/chat/completions";
    const body = {
        model: OPENROUTER_MODEL,
        messages: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 512,
    };
    try {
        const res = await fetchWithTimeout(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }, 12000);
        if (!res.ok) {
            const t = await res.text().catch(() => "");
            console.error("OpenRouter error:", res.status, t);
            return null;
        }
        const data = await res.json();
        const text = extractTextGeneric(data);
        return text;
    } catch (e: any) {
        console.error("OpenRouter fetch failed:", e?.message ?? e);
        return null;
    }
}

// DeepInfra (example)
async function callDeepInfra(prompt: string) {
    if (!DEEPINFRA_API_KEY) return null;
    const url = `https://api.deepinfra.com/v1/inference/${DEEPINFRA_MODEL}`;
    const body = { inputs: prompt, parameters: { max_new_tokens: 512, temperature: 0.3 } };
    try {
        const res = await fetchWithTimeout(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${DEEPINFRA_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }, 12000);
        if (!res.ok) {
            const t = await res.text().catch(() => "");
            console.error("DeepInfra error:", res.status, t);
            return null;
        }
        const data = await res.json();
        return extractTextGeneric(data);
    } catch (e: any) {
        console.error("DeepInfra fetch failed:", e?.message ?? e);
        return null;
    }
}

// HuggingFace
async function callHuggingFace(prompt: string) {
    if (!HF_API_KEY) return null;
    const url = `https://api-inference.huggingface.co/models/${HF_MODEL}`;
    try {
        const res = await fetchWithTimeout(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${HF_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 256, temperature: 0.3 } }),
        }, 20000);
        if (!res.ok) {
            const t = await res.text().catch(() => "");
            console.error("HuggingFace error:", res.status, t);
            return null;
        }
        const data = await res.json();
        return extractTextGeneric(data);
    } catch (e: any) {
        console.error("HuggingFace fetch failed:", e?.message ?? e);
        return null;
    }
}

// Groq
async function callGroq(prompt: string) {
    if (!GROQ_API_KEY) return null;
    const url = `https://api.groq.com/openai/v1/chat/completions`;
    const body = { model: GROQ_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0.3 };
    try {
        const res = await fetchWithTimeout(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }, 12000);
        if (!res.ok) {
            const t = await res.text().catch(() => "");
            console.error("Groq error:", res.status, t);
            return null;
        }
        const data = await res.json();
        return extractTextGeneric(data);
    } catch (e: any) {
        console.error("Groq fetch failed:", e?.message ?? e);
        return null;
    }
}

// Gemini (last fallback)
async function callGemini(prompt: string) {
    if (!GOOGLE_API_KEY) return null;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 512, temperature: 0.3 } };
    try {
        const res = await fetchWithTimeout(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": GOOGLE_API_KEY },
            body: JSON.stringify(body),
        }, 20000);
        if (!res.ok) {
            const t = await res.text().catch(() => "");
            console.error("Gemini error:", res.status, t);
            return null;
        }
        const data = await res.json();
        return extractTextGeneric(data);
    } catch (e: any) {
        console.error("Gemini fetch failed:", e?.message ?? e);
        return null;
    }
}

/* ---------- main handler ---------- */

export async function POST(req: Request) {
    try {
        const { message } = await req.json();
        if (!message || typeof message !== "string") {
            return NextResponse.json({ reply: "Invalid request" }, { status: 400 });
        }

        // Try providers in order (only if the key exists)
        const providers = [
            { name: "OpenRouter", fn: callOpenRouter, enabled: Boolean(OPENROUTER_API_KEY) },
            { name: "DeepInfra", fn: callDeepInfra, enabled: Boolean(DEEPINFRA_API_KEY) },
            { name: "HuggingFace", fn: callHuggingFace, enabled: Boolean(HF_API_KEY) },
            { name: "Groq", fn: callGroq, enabled: Boolean(GROQ_API_KEY) },
            { name: "Gemini", fn: callGemini, enabled: Boolean(GOOGLE_API_KEY) },
        ];

        for (const p of providers) {
            if (!p.enabled) {
                console.log(`${p.name} skipped (no API key).`);
                continue;
            }
            console.log(`Trying ${p.name}...`);
            const reply = await p.fn(message);
            if (reply) {
                console.log(`${p.name} succeeded.`);
                return NextResponse.json({ reply, provider: p.name });
            } else {
                console.warn(`${p.name} failed or returned nothing.`);
            }
        }

        // all failed
        return NextResponse.json({ reply: "عذراً، لم نتمكن من الحصول على رد من أي مزود AI الآن. حاول لاحقاً." }, { status: 500 });
    } catch (err) {
        console.error("Server error in /api/chat:", err);
        return NextResponse.json({ reply: "Internal server error" }, { status: 500 });
    }
}
