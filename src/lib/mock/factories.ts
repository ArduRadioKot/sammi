import type { Company, IntentLevel, Person } from "@/types/domain";

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMED: Array<
  Pick<Company, "name" | "domain" | "inn" | "industry" | "city" | "employees" | "revenue">
> = [
  { name: "Яндекс", domain: "yandex.ru", inn: "7736207543", industry: "Internet", city: "Москва", employees: 18000, revenue: 800_000_000_000 },
  { name: "VK", domain: "vk.company", inn: "7743001840", industry: "Internet", city: "Москва", employees: 12000, revenue: 140_000_000_000 },
  { name: "Ozon", domain: "ozon.ru", inn: "7719788190", industry: "E-commerce", city: "Москва", employees: 45000, revenue: 490_000_000_000 },
  { name: "Selectel", domain: "selectel.ru", inn: "7816075043", industry: "Cloud", city: "Санкт-Петербург", employees: 1400, revenue: 18_000_000_000 },
  { name: "Контур", domain: "kontur.ru", inn: "6663003127", industry: "SaaS", city: "Екатеринбург", employees: 9000, revenue: 42_000_000_000 },
  { name: "Positive Technologies", domain: "ptsecurity.com", inn: "7718668880", industry: "Security", city: "Москва", employees: 3200, revenue: 21_000_000_000 },
  { name: "HeadHunter", domain: "hh.ru", inn: "7718620740", industry: "HR Tech", city: "Москва", employees: 1100, revenue: 28_000_000_000 },
  { name: "amoCRM", domain: "amocrm.ru", inn: "7704830169", industry: "SaaS", city: "Москва", employees: 700, revenue: 6_200_000_000 },
  { name: "Битрикс24", domain: "bitrix24.ru", inn: "7717586110", industry: "SaaS", city: "Москва", employees: 1600, revenue: 12_000_000_000 },
  { name: "Skyeng", domain: "skyeng.ru", inn: "7707382264", industry: "EdTech", city: "Москва", employees: 2500, revenue: 9_400_000_000 },
  { name: "Mindbox", domain: "mindbox.ru", inn: "7709442388", industry: "MarTech", city: "Москва", employees: 420, revenue: 2_100_000_000 },
  { name: "Roistat", domain: "roistat.com", inn: "7713723286", industry: "MarTech", city: "Москва", employees: 380, revenue: 1_600_000_000 },
  { name: "Just AI", domain: "just-ai.com", inn: "7842149983", industry: "AI", city: "Санкт-Петербург", employees: 220, revenue: 890_000_000 },
  { name: "Cloud.ru", domain: "cloud.ru", inn: "7703380158", industry: "Cloud", city: "Москва", employees: 2100, revenue: 19_000_000_000 },
  { name: "Циан", domain: "cian.ru", inn: "7736207540", industry: "PropTech", city: "Москва", employees: 1800, revenue: 11_000_000_000 },
  { name: "Точка Банк", domain: "tochka.com", inn: "4401116480", industry: "FinTech", city: "Москва", employees: 3500, revenue: 24_000_000_000 },
  { name: "МойОфис", domain: "myoffice.ru", inn: "7703380150", industry: "SaaS", city: "Москва", employees: 900, revenue: 3_400_000_000 },
  { name: "Kaspersky", domain: "kaspersky.ru", inn: "7713140469", industry: "Security", city: "Москва", employees: 4500, revenue: 70_000_000_000 },
  { name: "1С", domain: "1c.ru", inn: "7709860400", industry: "Software", city: "Москва", employees: 1300, revenue: 62_000_000_000 },
  { name: "Avito", domain: "avito.ru", inn: "7704495375", industry: "Marketplace", city: "Москва", employees: 5000, revenue: 86_000_000_000 },
];

const PREFIX = ["Норд", "Квант", "Сигма", "Арк", "Нео", "Орион", "Вектор", "Пульс", "Астра", "Лайт"];
const SUFFIX = ["софт", "лаб", "тех", "клауд", "дата", "системс", "групп", "айди"];
const INDUSTRIES = ["SaaS", "FinTech", "IT", "AI", "Cloud", "HR Tech", "MarTech", "Security", "EdTech", "Logistics"];
const CITIES = ["Москва", "Санкт-Петербург", "Казань", "Новосибирск", "Екатеринбург", "Нижний Новгород", "Краснодар"];
const ROLES = ["CEO", "CTO", "Head of Sales", "CMO", "COO", "Head of Growth"];
const FIRST = ["Иван", "Анна", "Павел", "Мария", "Дмитрий", "Елена", "Никита", "Ольга"];
const LAST = ["Соколов", "Орлова", "Волков", "Лебедева", "Морозов", "Новикова", "Кузнецов", "Белова"];
const PRODUCTS = [
  "B2B-платформа аналитики продаж",
  "облачная инфраструктура для 1С",
  "система автоматизации outbound",
  "HR-платформа подбора и оценки",
  "AI-ассистент для клиентского сервиса",
  "продукт для электронного документооборота",
  "маркетинговая CDP для ритейла",
  "сервис мониторинга рисков контрагентов",
];

function pick<T>(rand: () => number, items: T[]): T {
  return items[Math.floor(rand() * items.length)] ?? items[0];
}

function innFromIndex(index: number): string {
  return String(7700000000 + index * 17).slice(0, 10);
}

export function createCompanies(count = 180): Company[] {
  const rand = mulberry32(42);
  const companies: Company[] = [];

  for (let i = 0; i < count; i += 1) {
    const named = NAMED[i];
    const name = named?.name ?? `${pick(rand, PREFIX)}${pick(rand, SUFFIX)} ${i + 1}`;
    const domain = named?.domain ?? `${name.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "")}.demo`;
    const employees = named?.employees ?? 12 + Math.floor(rand() * 900);
    const intentRoll = rand();
    const intent: IntentLevel = intentRoll > 0.72 ? "High" : intentRoll > 0.4 ? "Medium" : "Low";
    const score = Math.min(99, Math.max(18, Math.round(employees / 12 + rand() * 40 + (intent === "High" ? 24 : 0))));
    const first = pick(rand, FIRST);
    const last = pick(rand, LAST);
    const hasEmail = rand() > 0.28;
    const hasPhone = rand() > 0.62;
    const hasResearch = rand() > 0.35;

    companies.push({
      id: `co_${i + 1}`,
      name,
      domain,
      inn: named?.inn ?? innFromIndex(i + 11),
      ogrn: String(1027700000000 + i * 13),
      industry: named?.industry ?? pick(rand, INDUSTRIES),
      city: named?.city ?? pick(rand, CITIES),
      employees,
      revenue: named?.revenue ?? employees * (1_200_000 + Math.floor(rand() * 4_000_000)),
      website: `https://${domain}`,
      decisionMaker: `${first} ${last}`,
      role: pick(rand, ROLES),
      email: hasEmail ? `${first.toLowerCase()}.${last.toLowerCase()}@${domain.split(".")[0]}.demo` : "",
      phone: hasPhone ? "+7 000 000-00-00" : "",
      aiResearch: hasResearch
        ? `${name} развивает ${pick(rand, PRODUCTS)} и продаёт в B2B-сегмент.`
        : "",
      intent,
      score,
      crm: rand() > 0.82 ? (rand() > 0.5 ? "amoCRM" : "Bitrix24") : "",
    });
  }

  return companies;
}

export function createPeople(companies: Company[]): Person[] {
  return companies.slice(0, 80).map((company, index) => ({
    id: `pe_${index + 1}`,
    name: company.decisionMaker,
    role: company.role,
    companyId: company.id,
    companyName: company.name,
    city: company.city,
    email: company.email || `${company.domain.split(".")[0]}@corp.demo`,
    source: index % 3 === 0 ? "HeadHunter" : "Контур.Компас",
  }));
}
