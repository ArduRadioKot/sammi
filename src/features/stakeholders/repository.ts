export type StakeholderRole = "decision_maker" | "influencer" | "actual_decider" | "initiator" | "user" | "technical_expert" | "procurement" | "unknown";
export type StakeholderPosition = "supportive" | "neutral" | "skeptical" | "unknown";
export type RelationshipType = "reports_to" | "influences" | "collaborates_with" | "introduced_by";
export type Confidence = "verified" | "inferred" | "unknown";
export type InteractionType = "meeting" | "call" | "email" | "event" | "note";

export interface StakeholderAccount { id: string; name: string; industry: string; updatedAt: string; }
export interface StakeholderContact {
  id: string; accountId: string; name: string; title: string; department: string;
  role: StakeholderRole; influence: number | null; stance: StakeholderPosition;
  relationshipStrength: number | null; relationshipEvidence: string; lastInteractionAt: string | null;
  lastMeetingAt?: string | null;
  source: string; verifiedAt: string | null; stale: boolean;
}
export interface StakeholderEdge {
  id: string; accountId: string; fromId: string; toId: string; type: RelationshipType;
  strength: number | null; confidence: Confidence; evidence: string; updatedAt: string;
}
export interface StakeholderInteraction {
  id: string; accountId: string; contactIds: string[]; type: InteractionType;
  occurredAt: string; summary: string; authorName: string; source: string;
}
export interface StakeholderSnapshot {
  account: StakeholderAccount; contacts: StakeholderContact[]; edges: StakeholderEdge[];
  interactions: StakeholderInteraction[]; dataSource: "demo"; fetchedAt: string;
}
export interface StakeholderRepository {
  listAccounts(): Promise<StakeholderAccount[]>;
  getSnapshot(accountId: string): Promise<StakeholderSnapshot>;
  updateContact(accountId: string, id: string, patch: Partial<StakeholderContact>): Promise<StakeholderContact>;
  createEdge(accountId: string, input: Omit<StakeholderEdge, "id">): Promise<StakeholderEdge>;
  updateEdge(accountId: string, id: string, patch: Partial<StakeholderEdge>): Promise<StakeholderEdge>;
  addInteraction(accountId: string, input: Omit<StakeholderInteraction, "id">): Promise<StakeholderInteraction>;
  getSyncPreview(accountId: string): Promise<SyncPreview>;
  applySync(accountId: string): Promise<void>;
  reset(accountId: string): Promise<void>;
}
export interface SyncPreview { received: string[]; local: string[]; outbound: Array<{ entity: string; description: string }>; appliedAt: string | null; }

const STORAGE_KEY = "sammi.stakeholders.demo.v1";
const MOCK_CRM_KEY = "sammi.stakeholders.mockcrm.v1";
const departments = ["Бизнес", "ИТ", "Информационная безопасность", "Финансы", "Закупки"];
const givenNames = ["Алексей", "Мария", "Илья", "Екатерина", "Дмитрий", "Анна", "Павел", "Ольга", "Сергей", "Наталья", "Михаил", "Елена", "Андрей", "Ирина", "Роман", "Татьяна", "Кирилл", "Юлия", "Виктор", "Дарья"];
const surnames = ["Волков", "Соколова", "Морозов", "Лебедева", "Кузнецов", "Смирнова", "Попов", "Фёдорова", "Новиков", "Павлова", "Козлов", "Орлова", "Зайцев", "Васильева", "Петров", "Михайлова", "Семёнов", "Егорова", "Белов", "Григорьева"];
const titles = ["Генеральный директор", "Директор по стратегии", "Руководитель направления", "Директор по ИТ", "Архитектор решений", "Руководитель ИБ", "Специалист по защите данных", "Финансовый директор", "Финансовый контролёр", "Директор по закупкам", "Менеджер по закупкам", "Владелец продукта", "Операционный директор", "Руководитель проектов", "Бизнес-аналитик", "Руководитель отдела", "Эксперт по интеграциям", "Пользователь системы"];
const accounts: StakeholderAccount[] = [
  { id: "demo-northbank", name: "Северный банк · демо", industry: "Финансы", updatedAt: "2026-11-14T10:30:00.000Z" },
  { id: "demo-vector", name: "Вектор Энерго · демо", industry: "Энергетика", updatedAt: "2026-11-12T12:00:00.000Z" },
  { id: "demo-orbit", name: "Орбита Логистика · демо", industry: "Логистика", updatedAt: "2026-11-10T09:15:00.000Z" },
];
const roleFor = (index: number, accountIndex: number): StakeholderRole => {
  if (index === 0) return "decision_maker";
  if ([1, 3, 5, 7, 11].includes(index)) return "influencer";
  if (index === 2 || index === 12) return "initiator";
  if (index % 6 === 0) return "procurement";
  if (index % 4 === 0) return "technical_expert";
  if (index % 3 === 0) return "user";
  return accountIndex === 2 && index === 14 ? "unknown" : "user";
};
const makeContacts = (account: StakeholderAccount, accountIndex: number): StakeholderContact[] =>
  Array.from({ length: 18 }, (_, index) => {
    const role = roleFor(index, accountIndex);
    const department = departments[index === 0 ? 0 : index === 5 || index === 6 ? 2 : index === 7 || index === 8 ? 3 : index === 9 || index === 10 ? 4 : index === 3 || index === 4 || index === 16 ? 1 : index % 5];
    const old = index === 6 || (accountIndex === 0 && index === 5) || (accountIndex === 1 && index === 13);
    const name = `${givenNames[(index + accountIndex * 3) % givenNames.length]} ${surnames[(index + accountIndex * 5) % surnames.length]}`;
    const updated = new Date(Date.UTC(2026, 10, old ? 14 : 15 - (index % 9), 9 + index % 8)).toISOString();
    return {
      id: `${account.id}-person-${index + 1}`, accountId: account.id, name,
      title: titles[(index + accountIndex * 2) % titles.length], department, role,
      influence: index === 0 || index === 5 ? 5 : index === 1 || index === 3 || index === 7 ? 4 : index === 4 ? 3 : index === 14 && accountIndex === 2 ? null : 2 + (index % 2),
      stance: index === 0 || index === 8 ? "unknown" : index === 5 ? "skeptical" : index % 4 === 0 ? "supportive" : "neutral",
      relationshipStrength: index === 0 || index === 8 ? null : index === 6 ? 1 : 2 + (index % 4),
      relationshipEvidence: index === 0 ? "Прямой контакт с ЛПР не подтверждён" : index === 8 ? "Оценка не проводилась" : index === 5 ? "Вопросы по срокам и модели доступа" : "Оценка менеджера по итогам разговора",
      lastInteractionAt: index === 0 || index === 8 ? null : old ? "2026-08-03T10:00:00.000Z" : updated,
      source: "Mock CRM · демонстрационный набор", verifiedAt: index === 0 || index === 8 ? null : updated,
      stale: index === 0 || index === 5 || old,
    };
  });
const makeEdges = (account: StakeholderAccount, contacts: StakeholderContact[]): StakeholderEdge[] => {
  const edges: StakeholderEdge[] = [];
  const add = (from: number, to: number, type: RelationshipType, confidence: Confidence = "verified", strength = 2 + ((from + to) % 4)) => {
    edges.push({ id: `${account.id}-edge-${edges.length + 1}`, accountId: account.id, fromId: contacts[from].id, toId: contacts[to].id, type, strength, confidence, evidence: confidence === "verified" ? "Подтверждено менеджером" : "Требует проверки", updatedAt: account.updatedAt });
  };
  for (let i = 1; i < contacts.length; i++) add(i, 0, i < 5 ? "reports_to" : "influences", i === 6 ? "inferred" : "verified");
  for (let i = 1; i < contacts.length - 1; i += 2) add(i, i + 1, i % 4 === 1 ? "collaborates_with" : "influences");
  add(4, 5, "introduced_by"); add(2, 9, "collaborates_with"); add(3, 16, "influences"); add(11, 12, "collaborates_with"); add(13, 14, "influences");
  return edges;
};
const makeInteractions = (account: StakeholderAccount, contacts: StakeholderContact[]): StakeholderInteraction[] =>
  Array.from({ length: 14 }, (_, index) => {
    const historyContacts = [1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    const contact = contacts[historyContacts[index % historyContacts.length]];
    return {
      id: `${account.id}-interaction-${index + 1}`, accountId: account.id,
      contactIds: [contact.id, ...(index % 4 === 0 ? [contacts[(index + 1) % contacts.length].id] : [])],
      type: (["meeting", "call", "email", "event", "note"] as InteractionType[])[index % 5],
      occurredAt: new Date(Date.UTC(2026, 10, 15 - index * 2, 10 + index % 6)).toISOString(),
      summary: ["Обсудили контур инициативы и критерии успеха", "Сверили технические ограничения и интеграции", "Отправили материалы по модели внедрения", "Уточнили участников согласования", "Зафиксировали вопросы к следующей встрече"][index % 5],
      authorName: "Мария Волкова", source: "Mock CRM · демонстрационная история",
    };
  });
const seeds = accounts.map((account, index) => {
  const contacts = makeContacts(account, index);
  return { account, contacts, edges: makeEdges(account, contacts), interactions: makeInteractions(account, contacts), dataSource: "demo" as const, fetchedAt: new Date().toISOString() };
});

function readSnapshots(key = STORAGE_KEY): StakeholderSnapshot[] {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored) as StakeholderSnapshot[];
  } catch { /* a storage error is surfaced on the next write */ }
  return structuredClone(seeds);
}
function persist(snapshots: StakeholderSnapshot[], key = STORAGE_KEY) {
  try { localStorage.setItem(key, JSON.stringify(snapshots)); }
  catch { throw new Error("Не удалось сохранить демо-изменение в локальном хранилище браузера."); }
}
const snapshotFor = (items: StakeholderSnapshot[], accountId: string) => {
  const snapshot = items.find((item) => item.account.id === accountId);
  if (!snapshot) throw new Error("Демонстрационная компания не найдена.");
  return snapshot;
};
const demoRepository: StakeholderRepository = {
  async listAccounts() { return accounts.map((account) => ({ ...account })); },
  async getSnapshot(accountId) { return structuredClone(snapshotFor(readSnapshots(), accountId)); },
  async updateContact(accountId, id, patch) {
    const items = readSnapshots(); const snapshot = snapshotFor(items, accountId);
    const index = snapshot.contacts.findIndex((contact) => contact.id === id);
    if (index < 0) throw new Error("Контакт не найден.");
    const updated = { ...snapshot.contacts[index], ...patch, accountId, id };
    if (!updated.name.trim()) throw new Error("Укажите имя контакта.");
    snapshot.contacts[index] = updated; persist(items); return structuredClone(updated);
  },
  async createEdge(accountId, input) {
    const items = readSnapshots(); const snapshot = snapshotFor(items, accountId);
    if (input.fromId === input.toId || !snapshot.contacts.some((c) => c.id === input.fromId) || !snapshot.contacts.some((c) => c.id === input.toId)) throw new Error("Выберите двух разных участников этой компании.");
    if (snapshot.edges.some((edge) => edge.fromId === input.fromId && edge.toId === input.toId && edge.type === input.type)) throw new Error("Такая связь уже есть.");
    const created = { ...input, id: `${accountId}-edge-${crypto.randomUUID()}`, accountId };
    snapshot.edges.push(created); persist(items); return structuredClone(created);
  },
  async updateEdge(accountId, id, patch) {
    const items = readSnapshots(); const snapshot = snapshotFor(items, accountId);
    const index = snapshot.edges.findIndex((edge) => edge.id === id);
    if (index < 0) throw new Error("Связь не найдена.");
    snapshot.edges[index] = { ...snapshot.edges[index], ...patch, id, accountId }; persist(items); return structuredClone(snapshot.edges[index]);
  },
  async addInteraction(accountId, input) {
    const items = readSnapshots(); const snapshot = snapshotFor(items, accountId);
    if (!input.contactIds.length || input.contactIds.some((id) => !snapshot.contacts.some((contact) => contact.id === id))) throw new Error("Добавьте хотя бы одного участника компании.");
    if (!input.summary.trim()) throw new Error("Добавьте краткое содержание взаимодействия.");
    const created = { ...input, id: `${accountId}-interaction-${crypto.randomUUID()}`, accountId, summary: input.summary.trim() };
    snapshot.interactions.unshift(created);
    for (const id of created.contactIds) {
      const contact = snapshot.contacts.find((item) => item.id === id)!;
      if (!contact.lastInteractionAt || created.occurredAt > contact.lastInteractionAt) contact.lastInteractionAt = created.occurredAt;
      contact.stale = false;
    }
    persist(items); return structuredClone(created);
  },
  async getSyncPreview(accountId) {
    const snapshot = snapshotFor(readSnapshots(), accountId);
    const mockSnapshot = snapshotFor(readSnapshots(MOCK_CRM_KEY), accountId);
    const changed = snapshot.contacts.filter((contact) => { const baseline = mockSnapshot.contacts.find((item) => item.id === contact.id); return baseline && JSON.stringify(contact) !== JSON.stringify(baseline); });
    const addedEdges = snapshot.edges.filter((edge) => !mockSnapshot.edges.some((item) => item.id === edge.id));
    const changedEdges = snapshot.edges.filter((edge) => { const baseline = mockSnapshot.edges.find((item) => item.id === edge.id); return baseline && JSON.stringify(edge) !== JSON.stringify(baseline); });
    const addedInteractions = snapshot.interactions.filter((event) => !mockSnapshot.interactions.some((item) => item.id === event.id));
    return {
      received: ["Название клиента", "Имя и должность", "Подразделение", "Базовая история взаимодействий"],
      local: ["Роль в принятии решения", "Влияние", "Позиция к инициативе", "Связи между участниками", "Оценки и пояснения менеджера"],
      appliedAt: mockSnapshot.fetchedAt,
      outbound: [
        ...changed.map((contact) => ({ entity: "Оценка контакта", description: `${contact.name}: роль, влияние или позиция` })),
        ...addedEdges.map((edge) => ({ entity: "Связь", description: `${snapshot.contacts.find((c) => c.id === edge.fromId)?.name} → ${snapshot.contacts.find((c) => c.id === edge.toId)?.name}` })),
        ...changedEdges.map((edge) => ({ entity: "Изменение связи", description: `${snapshot.contacts.find((c) => c.id === edge.fromId)?.name} → ${snapshot.contacts.find((c) => c.id === edge.toId)?.name}` })),
        ...addedInteractions.map((event) => ({ entity: "Взаимодействие", description: `${new Date(event.occurredAt).toLocaleDateString("ru-RU")} · ${event.summary}` })),
      ],
    };
  },
  async applySync(accountId) {
    const local = readSnapshots();
    const current = snapshotFor(local, accountId);
    const mock = readSnapshots(MOCK_CRM_KEY);
    const index = mock.findIndex((item) => item.account.id === accountId);
    if (index < 0) throw new Error("Mock CRM клиент не найден.");
    mock[index] = { ...structuredClone(current), fetchedAt: new Date().toISOString() };
    persist(mock, MOCK_CRM_KEY);
  },
  async reset(accountId) {
    const items = readSnapshots(); const index = items.findIndex((item) => item.account.id === accountId);
    if (index < 0) throw new Error("Демонстрационная компания не найдена.");
    items[index] = structuredClone(seeds[index]); persist(items);
    const mock = readSnapshots(MOCK_CRM_KEY); mock[index] = structuredClone(seeds[index]); persist(mock, MOCK_CRM_KEY);
  },
};
export const stakeholderRepository = demoRepository;
