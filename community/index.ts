import { handleCommunity } from "./community";

export default {
  fetch(request: Request, env: { DB: D1Database }) {
    if (new URL(request.url).pathname !== "/api/community") {
      return new Response("Unknown route", { status: 404 });
    }
    return handleCommunity(request, env.DB);
  },
};
