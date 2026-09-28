import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Header } from "@/components/layout/Header";
import type { ApiStatus } from "@/hooks/useApiStatus";

function renderHeader(status: ApiStatus, model: string | null) {
  render(
    <Header
      status={status}
      version="0.2.0"
      model={model}
      theme="light"
      onToggleTheme={() => {}}
      onNewCheck={() => {}}
      onCheckConnection={() => {}}
    />,
  );
}

beforeEach(() => {
  // jsdom lacks matchMedia; the component doesn't use it but keep tests honest
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }),
  );
});

afterEach(cleanup);

describe("Header status pill", () => {
  it("shows Connected with the backend model name when online", () => {
    renderHeader("online", "qwen/qwen3.8-omni-flash:free");
    const pill = screen.getByRole("status");
    expect(pill).toHaveTextContent("Connected");
    expect(pill).toHaveTextContent("qwen/qwen3.8-omni-flash:free");
    // Full model name available via tooltip
    expect(screen.getByTitle("qwen/qwen3.8-omni-flash:free")).toBeInTheDocument();
  });

  it("model is rendered in monospace and truncatable", () => {
    renderHeader("online", "qwen/qwen3.8-omni-flash:free");
    const modelEl = screen.getByTitle("qwen/qwen3.8-omni-flash:free");
    expect(modelEl.className).toContain("font-mono");
    expect(modelEl.className).toContain("truncate");
  });

  it("does not show a model when offline", () => {
    renderHeader("offline", null);
    const pill = screen.getByRole("status");
    expect(pill).toHaveTextContent("Offline");
    expect(pill.textContent).not.toContain("qwen");
  });

  it("checking state uses grey/unknown labeling without a model", () => {
    renderHeader("unknown", null);
    const pill = screen.getByRole("status");
    expect(pill).toHaveTextContent("Checking");
  });

  it("never renders the API key or backend URL in the pill", () => {
    renderHeader("online", "qwen/qwen3.8-omni-flash:free");
    const pill = screen.getByRole("status");
    expect(pill.textContent).not.toContain("sk-");
    expect(pill.textContent).not.toContain("http");
    expect(pill.textContent).not.toContain("localhost");
  });
});

describe("Header settings panel", () => {
  it("lists the model with full name in settings", async () => {
    renderHeader("online", "qwen/qwen3.8-omni-flash:free");
    // The panel is closed; the pill's title attribute is the only tooltip.
    // Open settings to see the model row.
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    await waitFor(() => expect(screen.getByText("Model")).toBeInTheDocument());
    expect(screen.getAllByText("qwen/qwen3.8-omni-flash:free").length).toBeGreaterThan(0);
  });
});
