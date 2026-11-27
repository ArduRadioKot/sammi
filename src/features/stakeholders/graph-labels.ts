import type { RelationshipType, StakeholderPosition, StakeholderRole } from "./repository";

export const roleNames: Record<StakeholderRole, string> = {
  decision_maker: "ЛПР",
  influencer: "Влияет на выбор",
  actual_decider: "ЧФПР",
  initiator: "Инициатор",
  user: "Пользователь",
  technical_expert: "Технический эксперт",
  procurement: "Закупки",
  unknown: "Роль неизвестна",
};

export const stanceNames: Record<StakeholderPosition, string> = {
  supportive: "Поддерживает",
  neutral: "Нейтрально",
  skeptical: "Скептически",
  unknown: "Не оценено",
};

export const edgeNames: Record<RelationshipType, string> = {
  reports_to: "Подчинение",
  influences: "Влияние на решение",
  collaborates_with: "Сотрудничество",
  introduced_by: "Познакомил",
  shared_event: "Общее публичное событие",
};
