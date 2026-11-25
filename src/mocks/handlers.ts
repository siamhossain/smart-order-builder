import { http, HttpResponse } from "msw";
import { menuData } from "./data/menu";

export const handlers = [
  http.get("/api/health", () => {
    return HttpResponse.json({
      status: "ok",
      message: "MSW is working!",
    });
  }),

  http.get("/api/menu", () => {
    return HttpResponse.json(menuData);
  }),
];
