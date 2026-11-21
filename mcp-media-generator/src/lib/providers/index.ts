// سجل المزودات — طبقة واحدة تُستدعى من منسّق التوليد
import { kieAdapter } from "./kie";
import { cometapiAdapter } from "./cometapi";
import { apiframeAdapter } from "./apiframe";
import type { ProviderAdapter } from "./types";
import type { ProviderId } from "../models";

export const PROVIDERS: Record<ProviderId, ProviderAdapter> = {
  kie: kieAdapter,
  cometapi: cometapiAdapter,
  apiframe: apiframeAdapter,
};

export type { ProviderAdapter };
