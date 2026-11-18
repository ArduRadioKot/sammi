import { Reveal } from "@/components/motion/Reveal";
import { ProductScreenshot } from "./ProductScreenshot";
import { WorkflowStory, type WorkflowStep } from "./WorkflowStory";
import { stakeholderShot } from "./landingShots";

const PROBLEMS = [
  ["Данные разбросаны", "Контакты остаются в таблицах, переписке и заметках разных менеджеров."],
  ["Связи теряются", "Когда сотрудник уходит, команда может потерять доступ к другим участникам сделки."],
  ["Роли неясны", "По должности не всегда видно, кто рекомендует решение, согласует бюджет и утверждает покупку."],
];

const INSIGHTS = [
  ["Покрытие клиента", "Посмотрите, в каких отделах есть подтверждённый контакт и где давно не было разговора."],
  ["Зависимость от одного человека", "Проследите связи до ЛПР и проверьте, есть ли другой путь знакомства."],
  ["История взаимодействий", "Вспомните, о чём договорились на последней встрече и кто в ней участвовал."],
];

const RISK_SHOT = {
  src: "/product/one-route/risks.webp",
  width: 780,
  height: 1075,
  title: "Покрытие и активность",
  alt: "Панель покрытия: участники, активные контакты, пробелы по отделам и недавние взаимодействия за выбранный период.",
};

const TABLE_SHOT = {
  src: "/product/one-route/table.webp",
  width: 1710,
  height: 900,
  title: "Таблица контактов",
  alt: "Таблица Северного банка с именами, должностями, подразделениями, ролями и городами.",
};

const MAP_SHOT = {
  src: "/product/one-route/contacts-map.webp",
  width: 1220,
  height: 900,
  title: "Географическая карта контактов",
  alt: "Экран карты контактов с точками на OpenStreetMap по адресам из таблицы.",
};

const STEPS = [
  {
    title: "Данные",
    description: "Импортируйте CSV. Для каждого контакта укажите компанию, должность и роль в решении.",
    shot: TABLE_SHOT,
  },
  {
    title: "Карта отношений",
    description: "Разложите контакты по подразделениям. Отметьте, кто принимает решение, кто влияет на выбор и кто может вас познакомить.",
    shot: stakeholderShot,
  },
  {
    title: "Анализ",
    description: "Проверьте, где давно не было контакта и какие связи требуют подтверждения.",
    shot: RISK_SHOT,
  },
  {
    title: "Действие",
    description: "Наметьте следующее знакомство. После встречи запишите договорённости в истории контакта.",
    shot: {
      src: "/product/one-route/interaction-history.webp",
      width: 525,
      height: 505,
      title: "История контакта",
      alt: "Запись о встрече с Марией Соколовой в истории контакта.",
    },
  },
] satisfies readonly WorkflowStep[];

export function RelationshipSections() {
  return (
    <>
      <section id="challenges" className="route-challenges">
        <div className="route-wrap route-split">
          <Reveal><h2>Что теряется между сделками</h2></Reveal>
          <dl className="route-points">
            {PROBLEMS.map(([title, description], index) => (
              <Reveal key={title} delay={index * 0.07}>
                <dt>{title}</dt>
                <dd>{description}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      <section id="insights" className="route-wrap route-analysis">
        <div className="route-analysis-copy">
          <Reveal><h2>Где отношения уязвимы</h2></Reveal>
          <dl className="route-points">
            {INSIGHTS.map(([title, description], index) => (
              <Reveal key={title} delay={index * 0.07}>
                <dt>{title}</dt>
                <dd>{description}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
        <Reveal delay={0.10} className="route-analysis-media">
          <figure>
            <ProductScreenshot shot={RISK_SHOT} />
            <figcaption>Покрытие и активность · тестовые данные</figcaption>
          </figure>
        </Reveal>
      </section>

      <WorkflowStory steps={STEPS} />

      <section id="platform" className="route-platform">
        <div className="route-wrap">
          <div className="route-split route-platform-heading">
            <Reveal><h2>С чего начать работу</h2></Reveal>
            <Reveal delay={0.07}><p>Соберите исходные данные о клиенте, чтобы аккаунт-менеджеры и команда продаж могли планировать следующие встречи, а руководители видели, где помогают связи команды.</p></Reveal>
          </div>
          <div className="route-platform-media">
            <Reveal>
              <figure>
                <ProductScreenshot shot={TABLE_SHOT} />
                <figcaption><strong>Таблицы и CSV</strong> Импортируйте списки, уточняйте роли и выгружайте данные. На экране тестовые контакты.</figcaption>
              </figure>
            </Reveal>
            <Reveal delay={0.10}>
              <figure>
                <ProductScreenshot shot={MAP_SHOT} />
                <figcaption><strong>География контактов</strong> Посмотрите, где находятся контакты из таблицы с адресами. На экране тестовые точки.</figcaption>
              </figure>
            </Reveal>
          </div>
          <Reveal className="route-roadmap">
            <p><strong>В планах</strong> CRM-интеграция для обмена контактами и AI-подсказки для анализа отношений.</p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
