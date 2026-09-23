import { DEMO_TABLE_ID } from "@/lib/constants/config";
import { createCompanies, createPeople } from "@/lib/mock/factories";
import type {
  Agent,
  Audience,
  Campaign,
  CellValue,
  ColumnDefinition,
  CreditTransaction,
  DataTable,
  Integration,
  Signal,
  TableRow,
  TableWithRows,
  UsageSummary,
} from "@/types/domain";

export const companies = createCompanies(180);
export const people = createPeople(companies);

function cell(value: unknown, extra?: Partial<CellValue>): CellValue {
  return { value, status: extra?.status ?? (value ? "success" : "idle"), ...extra };
}

const demoColumns: ColumnDefinition[] = [
  { id: "company", name: "Company", type: "company", width: 220, frozen: true },
  { id: "domain", name: "Domain", type: "url", width: 160 },
  { id: "inn", name: "ИНН", type: "text", width: 128 },
  { id: "industry", name: "Industry", type: "select", width: 120, config: { kind: "select", options: [] } },
  { id: "city", name: "City", type: "text", width: 140 },
  { id: "employees", name: "Employees", type: "number", width: 110 },
  { id: "revenue", name: "Revenue", type: "currency", width: 130 },
  { id: "decisionMaker", name: "Decision Maker", type: "person", width: 180 },
  { id: "role", name: "Role", type: "select", width: 140, config: { kind: "select", options: [] } },
  { id: "email", name: "Email", type: "email", width: 220 },
  { id: "phone", name: "Phone", type: "phone", width: 150 },
  { id: "aiResearch", name: "AI Research", type: "ai", width: 280 },
  { id: "intent", name: "Intent", type: "select", width: 110, config: { kind: "select", options: [
    { id: "low", label: "Low", color: "neutral" },
    { id: "medium", label: "Medium", color: "amber" },
    { id: "high", label: "High", color: "green" },
  ] } },
  { id: "score", name: "Score", type: "score", width: 100 },
  { id: "crm", name: "CRM", type: "status", width: 120 },
];

function companyToRow(company: (typeof companies)[number]): TableRow {
  const emailStatus = company.email
    ? "success"
    : company.employees % 7 === 0
      ? "error"
      : company.employees % 5 === 0
        ? "not_found"
        : "idle";

  return {
    id: company.id,
    cells: {
      company: cell(company.name),
      domain: cell(company.domain),
      inn: cell(company.inn, {
        provenance: {
          providerId: "egrul",
          providerName: "ЕГРЮЛ",
          source: "ФНС",
          updatedAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
          confidence: 99,
          credits: 0.5,
        },
      }),
      industry: cell(company.industry),
      city: cell(company.city),
      employees: cell(company.employees),
      revenue: cell(company.revenue),
      decisionMaker: cell(company.decisionMaker),
      role: cell(company.role),
      email: cell(company.email, {
        status: emailStatus,
        error: emailStatus === "error" ? { code: "rate_limit", message: "Rate limit" } : undefined,
        provenance: company.email
          ? {
              providerId: "dadata",
              providerName: "DaData",
              source: "ЕГРЮЛ",
              updatedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
              confidence: 94,
              credits: 1,
            }
          : undefined,
      }),
      phone: cell(company.phone, {
        status: company.phone ? "success" : "idle",
        provenance: company.phone
          ? {
              providerId: "twogis",
              providerName: "2ГИС",
              source: "2GIS",
              updatedAt: new Date(Date.now() - 1000 * 60 * 80).toISOString(),
              confidence: 81,
              credits: 1,
            }
          : undefined,
      }),
      aiResearch: cell(company.aiResearch, {
        status: company.aiResearch ? "success" : "idle",
        provenance: company.aiResearch
          ? {
              providerId: "yandex",
              providerName: "YandexGPT",
              source: "website",
              updatedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
              confidence: 86,
              credits: 2,
            }
          : undefined,
      }),
      intent: cell(company.intent),
      score: cell(company.score),
      crm: cell(company.crm, { status: company.crm ? "success" : "idle" }),
      website: cell(company.website),
      ogrn: cell(company.ogrn),
    },
  };
}

const now = Date.now();

export function createDemoTable(): TableWithRows {
  const rows = companies.map(companyToRow);
  return {
    id: DEMO_TABLE_ID,
    name: "Российские SaaS-компании",
    type: "companies",
    description: "ICP outbound: SaaS и смежные B2B-компании",
    columns: demoColumns,
    views: [
      { id: "all", name: "Все компании", filters: [], sorts: [] },
      {
        id: "icp",
        name: "ICP",
        filters: [{ id: "f1", columnId: "employees", operator: "gt", value: 100 }],
        sorts: [{ id: "s1", columnId: "score", direction: "desc" }],
      },
      {
        id: "high",
        name: "High Intent",
        filters: [{ id: "f2", columnId: "intent", operator: "eq", value: "High" }],
        sorts: [{ id: "s2", columnId: "score", direction: "desc" }],
      },
      {
        id: "research",
        name: "Needs Research",
        filters: [{ id: "f3", columnId: "aiResearch", operator: "is_empty" }],
        sorts: [],
      },
    ],
    defaultViewId: "all",
    rowCount: rows.length,
    enrichmentCount: 4,
    creditsUsed: 2140,
    owner: "Александр",
    updatedAt: new Date(now - 1000 * 60 * 18).toISOString(),
    starred: true,
    rows,
  };
}

export const tablesMeta: DataTable[] = [
  {
    id: DEMO_TABLE_ID,
    name: "Российские SaaS-компании",
    type: "companies",
    columns: demoColumns,
    views: [],
    defaultViewId: "all",
    rowCount: 180,
    enrichmentCount: 4,
    creditsUsed: 2140,
    owner: "Александр",
    updatedAt: new Date(now - 1000 * 60 * 18).toISOString(),
    starred: true,
  },
  {
    id: "fintech-msk",
    name: "Финтех Москва",
    type: "companies",
    columns: [],
    views: [],
    defaultViewId: "all",
    rowCount: 86,
    enrichmentCount: 3,
    creditsUsed: 640,
    owner: "Александр",
    updatedAt: new Date(now - 1000 * 60 * 80).toISOString(),
  },
  {
    id: "it-100",
    name: "IT-компании 100+ сотрудников",
    type: "companies",
    columns: [],
    views: [],
    defaultViewId: "all",
    rowCount: 240,
    enrichmentCount: 5,
    creditsUsed: 3180,
    owner: "Мария",
    updatedAt: new Date(now - 1000 * 60 * 140).toISOString(),
    starred: true,
  },
  {
    id: "potential",
    name: "Potential customers",
    type: "custom",
    columns: [],
    views: [],
    defaultViewId: "all",
    rowCount: 64,
    enrichmentCount: 2,
    creditsUsed: 210,
    owner: "Александр",
    updatedAt: new Date(now - 1000 * 60 * 400).toISOString(),
  },
  {
    id: "ai-startups",
    name: "AI startups Russia",
    type: "companies",
    columns: [],
    views: [],
    defaultViewId: "all",
    rowCount: 51,
    enrichmentCount: 2,
    creditsUsed: 430,
    owner: "Павел",
    updatedAt: new Date(now - 1000 * 60 * 900).toISOString(),
  },
  {
    id: "people-saas",
    name: "ЛПР SaaS",
    type: "people",
    columns: [],
    views: [],
    defaultViewId: "all",
    rowCount: 80,
    enrichmentCount: 2,
    creditsUsed: 190,
    owner: "Александр",
    updatedAt: new Date(now - 1000 * 60 * 50).toISOString(),
  },
];

export const signals: Signal[] = [
  { id: "sig1", name: "New vacancies", source: "HeadHunter", tableId: DEMO_TABLE_ID, tableName: "Российские SaaS-компании", companies: 42, frequency: "Ежедневно", lastRun: new Date(now - 1000 * 60 * 40).toISOString(), newEvents: 18, status: "active", description: "Рост вакансий как hiring signal" },
  { id: "sig2", name: "ЕГРЮЛ changes", source: "ЕГРЮЛ", tableId: DEMO_TABLE_ID, tableName: "Российские SaaS-компании", companies: 180, frequency: "Ежедневно", lastRun: new Date(now - 1000 * 60 * 90).toISOString(), newEvents: 6, status: "active", description: "Изменения карточки юрлица" },
  { id: "sig3", name: "New director", source: "Контур.Фокус", tableId: "fintech-msk", tableName: "Финтех Москва", companies: 86, frequency: "Еженедельно", lastRun: new Date(now - 1000 * 60 * 200).toISOString(), newEvents: 2, status: "active", description: "Смена руководителя" },
  { id: "sig4", name: "News mention", source: "Яндекс", tableId: DEMO_TABLE_ID, tableName: "Российские SaaS-компании", companies: 64, frequency: "Ежедневно", lastRun: new Date(now - 1000 * 60 * 25).toISOString(), newEvents: 9, status: "active", description: "Упоминания в СМИ" },
  { id: "sig5", name: "Telegram mention", source: "Telegram", tableId: "ai-startups", tableName: "AI startups Russia", companies: 22, frequency: "Каждые 6 часов", lastRun: new Date(now - 1000 * 60 * 15).toISOString(), newEvents: 4, status: "paused", description: "Упоминания в отраслевых каналах" },
  { id: "sig6", name: "Job change", source: "HeadHunter", tableId: "people-saas", tableName: "ЛПР SaaS", companies: 80, frequency: "Ежедневно", lastRun: new Date(now - 1000 * 60 * 70).toISOString(), newEvents: 3, status: "active", description: "Смена места работы ЛПР" },
  { id: "sig7", name: "Website visit", source: "Webhook", tableId: "potential", tableName: "Potential customers", companies: 12, frequency: "Realtime", lastRun: new Date(now - 1000 * 60 * 8).toISOString(), newEvents: 1, status: "active", description: "Визит на сайт" },
  { id: "sig8", name: "Company status change", source: "ЕГРЮЛ", tableId: DEMO_TABLE_ID, tableName: "Российские SaaS-компании", companies: 180, frequency: "Ежедневно", lastRun: new Date(now - 1000 * 60 * 110).toISOString(), newEvents: 0, status: "paused", description: "Ликвидация / реорганизация" },
];

export const audiences: Audience[] = [
  { id: "aud1", name: "High intent SaaS", entity: "companies", rules: [{ id: "r1", columnId: "intent", operator: "eq", value: "High" }, { id: "r2", columnId: "industry", operator: "contains", value: "SaaS" }], count: 38, updatedAt: new Date(now - 1000 * 60 * 30).toISOString(), destinations: ["amoCRM"] },
  { id: "aud2", name: "Enterprise IT", entity: "companies", rules: [{ id: "r3", columnId: "employees", operator: "gt", value: 100 }, { id: "r4", columnId: "industry", operator: "eq", value: "IT" }], count: 1284, updatedAt: new Date(now - 1000 * 60 * 90).toISOString(), destinations: ["Bitrix24"] },
  { id: "aud3", name: "Hiring fast", entity: "companies", rules: [{ id: "r5", columnId: "score", operator: "gt", value: 70 }], count: 54, updatedAt: new Date(now - 1000 * 60 * 200).toISOString(), destinations: [] },
  { id: "aud4", name: "New CEOs", entity: "people", rules: [{ id: "r6", columnId: "role", operator: "eq", value: "CEO" }], count: 19, updatedAt: new Date(now - 1000 * 60 * 400).toISOString(), destinations: ["Campaign"] },
];

export const agents: Agent[] = [
  { id: "ag1", name: "Company Research", description: "Исследует сайт и описывает продукт", providerId: "yandex", modelId: "yandexgpt-5-pro", runs: 840, successRate: 0.94, credits: 1680, updatedAt: new Date(now - 1000 * 60 * 20).toISOString(), config: { name: "Company Research", instructions: "Изучи сайт и опиши продукт", providerId: "yandex", modelId: "yandexgpt-5-pro", sources: ["website", "search"], tools: ["web_search", "read_website"], outputSchema: [{ id: "product", name: "product", type: "string", description: "Основной продукт", required: true }] } },
  { id: "ag2", name: "ICP Scorer", description: "Оценивает fit по ICP", providerId: "gigachat", modelId: "gigachat-pro", runs: 420, successRate: 0.91, credits: 840, updatedAt: new Date(now - 1000 * 60 * 80).toISOString(), config: { name: "ICP Scorer", instructions: "Оцени компанию по ICP", providerId: "gigachat", modelId: "gigachat-pro", sources: ["website"], tools: ["structured_output"], outputSchema: [{ id: "score", name: "score", type: "number", description: "0-100", required: true }] } },
  { id: "ag3", name: "News Analyzer", description: "Классифицирует новости и сигналы", providerId: "yandex", modelId: "yandexgpt-5-lite", runs: 210, successRate: 0.88, credits: 310, updatedAt: new Date(now - 1000 * 60 * 200).toISOString(), config: { name: "News Analyzer", instructions: "Классифицируй новость", providerId: "yandex", modelId: "yandexgpt-5-lite", sources: ["news"], tools: ["web_search"], outputSchema: [] } },
  { id: "ag4", name: "Website Classifier", description: "Определяет отрасль и ICP", providerId: "ollama", modelId: "qwen2.5", runs: 96, successRate: 0.86, credits: 0, updatedAt: new Date(now - 1000 * 60 * 300).toISOString(), config: { name: "Website Classifier", instructions: "Классифицируй сайт", providerId: "ollama", modelId: "qwen2.5", sources: ["website"], tools: ["read_website"], outputSchema: [] } },
  { id: "ag5", name: "Personalization Writer", description: "Пишет первый абзац письма", providerId: "gigachat", modelId: "gigachat-max", runs: 150, successRate: 0.9, credits: 450, updatedAt: new Date(now - 1000 * 60 * 60).toISOString(), config: { name: "Personalization Writer", instructions: "Напиши персонализацию", providerId: "gigachat", modelId: "gigachat-max", sources: ["website"], tools: ["read_website"], outputSchema: [] } },
];

export const campaigns: Campaign[] = [
  { id: "cmp1", name: "SaaS outbound Q3", audienceId: "aud1", audienceName: "High intent SaaS", contacts: 38, sent: 31, replies: 6, positive: 3, status: "active", steps: [
    { id: "st1", type: "email", subject: "{{company}}: короткий вопрос", body: "Привет, {{firstName}}. Заметил, что {{company}} — {{aiResearch}}" },
    { id: "st2", type: "wait", waitDays: 2 },
    { id: "st3", type: "email", subject: "Ещё раз про {{company}}", body: "Павел, вернулся с более конкретной гипотезой." },
    { id: "st4", type: "wait", waitDays: 3 },
    { id: "st5", type: "email", subject: "Закрываю тему", body: "Если сейчас не актуально — закрою последовательность." },
  ] },
  { id: "cmp2", name: "Enterprise IT warm-up", audienceId: "aud2", audienceName: "Enterprise IT", contacts: 120, sent: 80, replies: 11, positive: 4, status: "paused", steps: [] },
  { id: "cmp3", name: "Hiring signal sequence", audienceId: "aud3", audienceName: "Hiring fast", contacts: 54, sent: 0, replies: 0, positive: 0, status: "draft", steps: [] },
];

export const integrations: Integration[] = [
  { id: "amocrm", name: "amoCRM", category: "crm", description: "Сделки, контакты и компании", connected: true },
  { id: "bitrix24", name: "Bitrix24", category: "crm", description: "CRM и коммуникация", connected: false },
  { id: "dadata", name: "DaData", category: "data", description: "Подсказки и карточки юрлиц", connected: true, supportsBYOK: true, region: "RU" },
  { id: "kontur", name: "Контур", category: "data", description: "Фокус и Компас", connected: false, supportsBYOK: true, region: "RU" },
  { id: "headhunter", name: "HeadHunter", category: "data", description: "Вакансии и профили", connected: true, region: "RU" },
  { id: "telegram", name: "Telegram", category: "communication", description: "Каналы и упоминания", connected: false },
  { id: "yandex-ai", name: "Yandex AI", category: "ai", description: "YandexGPT через AI Studio", connected: true, supportsBYOK: true },
  { id: "gigachat", name: "GigaChat", category: "ai", description: "Модели Сбера", connected: false, supportsBYOK: true },
  { id: "ollama", name: "Ollama", category: "ai", description: "Локальные и remote модели", connected: true },
  { id: "webhook", name: "Webhook", category: "automation", description: "Исходящие события", connected: false },
  { id: "http-api", name: "HTTP API", category: "automation", description: "Произвольный REST-источник", connected: false },
];

const history: CreditTransaction[] = [
  { id: "tx1", date: new Date(now - 1000 * 60 * 20).toISOString(), action: "Email waterfall", provider: "DaData", rows: 100, credits: 86, user: "Александр" },
  { id: "tx2", date: new Date(now - 1000 * 60 * 80).toISOString(), action: "AI research", provider: "YandexGPT", rows: 40, credits: 80, user: "Александр" },
  { id: "tx3", date: new Date(now - 1000 * 60 * 200).toISOString(), action: "Company enrich", provider: "Контур", rows: 60, credits: 120, user: "Мария" },
  { id: "tx4", date: new Date(now - 1000 * 60 * 400).toISOString(), action: "HH vacancies", provider: "HeadHunter", rows: 42, credits: 42, user: "Александр" },
  { id: "tx5", date: new Date(now - 1000 * 60 * 900).toISOString(), action: "ICP scoring", provider: "GigaChat", rows: 30, credits: 60, user: "Павел" },
];

export const usage: UsageSummary = {
  remaining: 8420,
  usedThisMonth: 12580,
  ai: 3120,
  enrichment: 9460,
  byProvider: [
    { provider: "DaData", credits: 4120 },
    { provider: "Контур", credits: 2880 },
    { provider: "Yandex AI", credits: 1960 },
    { provider: "GigaChat", credits: 1160 },
    { provider: "HeadHunter", credits: 860 },
  ],
  history,
};

export const templates = [
  { id: "tpl-dm", name: "Find decision makers", description: "Найти CEO / CTO / Head of Sales" },
  { id: "tpl-saas", name: "Russian SaaS outbound", description: "Companies → enrichment → ЛПР → email waterfall → AI research" },
  { id: "tpl-tender", name: "Tender monitoring", description: "ЕГРЮЛ + госзакупки + AI classification" },
  { id: "tpl-hiring", name: "Hiring signal", description: "HH вакансии → growth → ЛПР → CRM" },
  { id: "tpl-icp", name: "ICP enrichment", description: "Фирмографика, score и qualifying" },
];
