import { InMemoryRunner } from "@google/adk";
import { cupidAgent } from "./agent";

export const APP_NAME = "ditto-feature";
export const DEMO_USER_ID = "demo-user";

export const runner = new InMemoryRunner({
  appName: APP_NAME,
  agent: cupidAgent,
});
