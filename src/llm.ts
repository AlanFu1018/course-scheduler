export interface LlmService {
  readonly model: string;
  generate(prompt: string, schema: object): Promise<unknown>;
}

export class GeminiUnavailable extends Error {
  readonly status: number;
  readonly retryAfter: number;
  constructor(message: string, status: number, retryAfter: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export class GeminiLlmService implements LlmService {
  readonly model: string;
  private readonly apiKey: string;
  private readonly notify: (message: string) => void;

  constructor(apiKey: string | undefined, model = 'gemini-3.1-flash-lite', notify = (_message: string) => {}) {
    if (!apiKey?.trim()) throw new Error('請在 .env 設定 GEMINI_API_KEY，並重新啟動本機伺服器。');
    this.apiKey = apiKey.trim();
    this.model = model;
    this.notify = notify;
  }

  async generate(prompt: string, schema: object): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.request(prompt, schema);
      if (response.ok) return this.decode(response);
      if (![429, 503].includes(response.status)) throw new Error(`Gemini API 請求失敗（HTTP ${response.status}）。`);
      const body = await response.text();
      const daily = response.status === 429 && /per.?day|daily|requestsperday/i.test(body);
      const header = response.headers.get('retry-after');
      const headerMs = header && /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header ?? '') - Date.now();
      const hint = /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(body);
      const delay = Math.max(Number.isFinite(headerMs) ? headerMs : 0, Number(hint?.[1] ?? 0) * 1000,
        1000 * 2 ** attempt + Math.random() * 500);
      if (daily || attempt >= 3) {
        const reason = daily ? '每日配額不足' : `HTTP ${response.status}，建議等待 ${Math.ceil(delay / 1000)} 秒`;
        throw new GeminiUnavailable(`Gemini ${reason}。已保留批次進度，稍後用相同設定重新產生即可續跑。`,
          response.status, Math.ceil(delay / 1000));
      }
      this.notify(`Gemini HTTP ${response.status}，${Math.ceil(delay / 1000)} 秒後重試（${attempt + 1}/3）`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  private request(prompt: string, schema: object) {
    return fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema },
        }),
      },
    );
  }

  private async decode(response: Response) {
    const body = await response.json() as {
      candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    const candidate = body.candidates?.[0];
    const text = candidate?.content?.parts?.filter(part => !part.thought).map(part => part.text).join('');
    if (!text || candidate?.finishReason !== 'STOP') {
      throw new Error(`Gemini 未回傳完整結果（${candidate?.finishReason ?? '無候選回應'}）。`);
    }
    return JSON.parse(text);
  }
}
