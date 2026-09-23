import { API_BASE_URL, ENABLE_DEMO_DATA } from "@/lib/constants/config";

export const apiConfig = {
  baseUrl: API_BASE_URL,
  enableDemoData: ENABLE_DEMO_DATA,
  versionPrefix: "/api/v1",
} as const;
