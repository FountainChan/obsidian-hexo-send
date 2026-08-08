import { vi } from "vitest";

vi.stubGlobal("window", {
  setTimeout,
  clearTimeout,
});
