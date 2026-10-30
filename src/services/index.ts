import { ENABLE_DEMO_DATA } from "@/lib/constants/config";
import { ApiError } from "@/lib/api/client";
import type {
  Agent,
  Audience,
  Campaign,
  Company,
  Integration,
  Person,
  Signal,
} from "@/types/domain";

export { tablesService, FastApiTablesService, type TablesService } from "@/services/tables";
export { creditsService } from "@/services/credits";

export interface CompaniesService {
  listCompanies(): Promise<Company[]>;
}

export interface PeopleService {
  listPeople(): Promise<Person[]>;
}

export interface SignalsService {
  listSignals(): Promise<Signal[]>;
  createSignal(input: Partial<Signal>): Promise<Signal>;
}

export interface AudiencesService {
  listAudiences(): Promise<Audience[]>;
  createAudience(input: Partial<Audience>): Promise<Audience>;
}

export interface AgentsService {
  listAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | undefined>;
}

export interface CampaignsService {
  listCampaigns(): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | undefined>;
}

export interface IntegrationsService {
  listIntegrations(): Promise<Integration[]>;
  connect(id: string): Promise<Integration>;
}

function unavailable(message = "This resource is not available yet"): never {
  throw new ApiError(501, "NOT_IMPLEMENTED", message);
}

async function demoModule() {
  return import("@/lib/mock/data");
}

export const companiesService: CompaniesService = {
  async listCompanies() {
    if (!ENABLE_DEMO_DATA) return [];
    const { companies } = await demoModule();
    return companies;
  },
};

export const peopleService: PeopleService = {
  async listPeople() {
    if (!ENABLE_DEMO_DATA) return [];
    const { people } = await demoModule();
    return people;
  },
};

export const signalsService: SignalsService = {
  async listSignals() {
    if (!ENABLE_DEMO_DATA) return [];
    const { signals } = await demoModule();
    return signals;
  },
  async createSignal() {
    unavailable("Signals API is not available yet");
  },
};

export const audiencesService: AudiencesService = {
  async listAudiences() {
    if (!ENABLE_DEMO_DATA) return [];
    const { audiences } = await demoModule();
    return audiences;
  },
  async createAudience() {
    unavailable("Audiences API is not available yet");
  },
};

export const agentsService: AgentsService = {
  async listAgents() {
    if (!ENABLE_DEMO_DATA) return [];
    const { agents } = await demoModule();
    return agents;
  },
  async getAgent(id) {
    if (!ENABLE_DEMO_DATA) return undefined;
    const { agents } = await demoModule();
    return agents.find((agent) => agent.id === id);
  },
};

export const campaignsService: CampaignsService = {
  async listCampaigns() {
    if (!ENABLE_DEMO_DATA) return [];
    const { campaigns } = await demoModule();
    return campaigns;
  },
  async getCampaign(id) {
    if (!ENABLE_DEMO_DATA) return undefined;
    const { campaigns } = await demoModule();
    return campaigns.find((campaign) => campaign.id === id);
  },
};

export const integrationsService: IntegrationsService = {
  async listIntegrations() {
    if (!ENABLE_DEMO_DATA) return [];
    const { integrations } = await demoModule();
    return integrations;
  },
  async connect() {
    unavailable("Integrations API is not available yet");
  },
};
