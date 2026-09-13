const raw =
  import.meta.env.VITE_API_BASE_URL ?? "https://api.gymforge.artsolutions.tech";

export const API_BASE_URL = raw.replace(/\/$/, "");
