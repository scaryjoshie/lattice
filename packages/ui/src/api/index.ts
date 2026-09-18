import { httpApi } from "./http.ts";
import { mockApi } from "./mock.ts";
import type { Api } from "./types.ts";

export const api: Api =
  new URLSearchParams(location.search).get("mock") === "1" ? mockApi : httpApi;
export type { Api, Connection } from "./types.ts";
export { ApiError } from "./types.ts";
