import { tablesService } from "@/services/tables";
import type { ColumnDefinition, DataTable, TableRow } from "@/types/domain";

const ROW_PAGE_SIZE = 500;
const TABLE_BATCH_SIZE = 4;

const CONTACT_COLUMNS = {
  fullName: ["fullname", "contactname", "personname", "фио", "фиоконтакта", "полноеимя", "имяифамилия", "фамилияиимя", "контактноелицо"],
  firstName: ["firstname", "givenname", "имя"],
  lastName: ["lastname", "surname", "familyname", "фамилия"],
  name: ["name", "имя", "контакт"],
  company: ["companyname", "company", "organization", "accountname", "компания", "названиекомпании", "организация"],
  jobTitle: ["jobtitle", "должность", "position", "title"],
  decisionRole: ["decisionrole", "рольврешении", "рольвпринятиирешения"],
  role: ["role", "роль"],
  department: ["department", "подразделение", "отдел"],
  city: ["city", "город", "населенныйпункт"],
  email: ["email", "workemail", "почта", "электроннаяпочта", "рабочаяпочта"],
  phone: ["phone", "phonenumber", "mobilephone", "телефон", "номертелефона", "мобильныйтелефон"],
  source: ["source", "источник", "источникданных"],
} as const;

type ContactFields = Record<keyof typeof CONTACT_COLUMNS, string | undefined>;

export type WorkspaceContact = {
  id: string;
  name: string;
  company: string;
  jobTitle: string;
  decisionRole: string;
  department: string;
  city: string;
  email: string;
  phone: string;
  source: string;
  tableId: string;
  tableName: string;
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replaceAll("ё", "е").replace(/[^a-zа-я0-9]/g, "");
}

function resolveFields(columns: ColumnDefinition[]) {
  const byName = new Map(columns.map((column) => [normalizeHeader(column.name), column.id]));
  return Object.fromEntries(
    Object.entries(CONTACT_COLUMNS).map(([field, aliases]) => [
      field,
      aliases.map((alias) => byName.get(normalizeHeader(alias))).find(Boolean),
    ]),
  ) as ContactFields;
}

function isContactTable(table: DataTable, fields: ContactFields) {
  if (fields.fullName || (fields.firstName && fields.lastName)) return true;
  if (!fields.name && !fields.firstName) return false;
  return table.type === "people" || Boolean(
    fields.jobTitle || fields.decisionRole || fields.role || fields.department ||
    (fields.company && (fields.email || fields.phone)),
  );
}

function readContact(row: TableRow, table: DataTable, fields: ContactFields): WorkspaceContact | undefined {
  const read = (field: keyof ContactFields) => {
    const columnId = fields[field];
    const value = columnId ? row.cells[columnId]?.value : undefined;
    return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  };
  const firstName = read("firstName");
  const lastName = read("lastName");
  const name = read("fullName") ||
    (firstName && lastName ? `${firstName} ${lastName}` : read("name") || firstName);
  if (!name) return;

  const jobTitle = read("jobTitle");
  const role = read("role");
  return {
    id: row.id,
    name,
    company: read("company"),
    jobTitle: jobTitle || role,
    decisionRole: read("decisionRole") || (jobTitle && role !== jobTitle ? role : ""),
    department: read("department"),
    city: read("city"),
    email: read("email"),
    phone: read("phone"),
    source: read("source"),
    tableId: table.id,
    tableName: table.name,
  };
}

async function readTableContacts(table: DataTable, signal: AbortSignal) {
  const columns = await tablesService.listColumns(table.id, signal);
  const fields = resolveFields(columns);
  if (!isContactTable(table, fields)) return [];

  const contacts: WorkspaceContact[] = [];
  let offset = 0;
  let total: number;
  do {
    const page = await tablesService.listRows(table.id, columns, ROW_PAGE_SIZE, offset, signal);
    for (const row of page.rows) {
      const contact = readContact(row, table, fields);
      if (contact) contacts.push(contact);
    }
    if (page.rows.length === 0) break;
    total = page.total;
    offset += page.rows.length;
  } while (offset < total);
  return contacts;
}

export async function listWorkspaceContacts(workspaceId: string, signal: AbortSignal) {
  const tables = (await tablesService.listTables(workspaceId, signal))
    .filter((table) => table.type !== "companies" && table.rowCount > 0);
  const contacts: WorkspaceContact[] = [];
  let failedTables = 0;

  for (let offset = 0; offset < tables.length; offset += TABLE_BATCH_SIZE) {
    signal.throwIfAborted();
    const batch = tables.slice(offset, offset + TABLE_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((table) => readTableContacts(table, signal)));
    for (const result of results) {
      if (result.status === "fulfilled") contacts.push(...result.value);
      else failedTables += 1;
    }
  }

  return { contacts, failedTables };
}
