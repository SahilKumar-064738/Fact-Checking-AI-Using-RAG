import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Header } from "@/components/layout/Header";
import type { ApiStatus } from "@/hooks/useApiStatus";
import type { ModelInfo } from "@/lib/modelCatalog";

const selectedModel: ModelInfo = {
  id: "qwen/qwen3.8-omni-flash:free",
  provider: "Qwen",
  name: "Qwen3.8 Omni Flash",
  description: "Fast omni model with reasoning support.",
  context: "1M",
  free: true,
  capabilities: ["text", "vision", "reasoning"],
  recommended: true,
};

function renderHeader(status: ApiStatus, model: ModelInfo | null = selectedModel) {
  const onOpenModelSelector = vi.fn();
  const onNewCheck = vi.fn();
  const onCheckConnection = vi.fn();
  render(
    <Header
      status={status}
      version="0.2.0"
      checking={false}
      lastCheckedAt={null}
      backendModel={null}
      selectedModel={model}
      onOpenModelSelector={onOpenModelSelector}
      onNewCheck={onNewCheck}
      onCheckConnection={onCheckConnection}
    />,
  );
  return { onOpenModelSelector, onNewCheck, onCheckConnection };
}

afterEach(cleanup);

/** The model pill exists twice (desktop pill + mobile bar) — use the first. */
function modelPill() {
  return screen.getAllByRole("button", { name: /model selection/i })[0];
}

describe("Header status pill", () => {
  it("shows Connected with the selected model name when online", () => {
    renderHeader("online");
    const pill = modelPill();
    expect(pill).toHaveTextContent("Connected");
    expect(pill).toHaveTextContent("Qwen3.8 Omni Flash");
    // Full model id available via tooltip
    expect(screen.getByTitle("qwen/qwen3.8-omni-flash:free")).toBeInTheDocument();
  });

  it("model name is truncatable", () => {
    renderHeader("online");
    const modelEl = screen.getByTitle("qwen/qwen3.8-omni-flash:free");
    expect(modelEl.className).toContain("truncate");
  });

  it("opens the model selector when the pill is clicked", () => {
    const { onOpenModelSelector } = renderHeader("online");
    fireEvent.click(modelPill());
    expect(onOpenModelSelector).toHaveBeenCalledTimes(1);
  });

  it("does not show a model when none is selected", () => {
    renderHeader("offline", null);
    const pill = modelPill();
    expect(pill).toHaveTextContent("Offline");
    expect(pill.textContent).not.toContain("Qwen");
  });

  it("checking state uses grey/unknown labeling without a model", () => {
    renderHeader("unknown", null);
    const pill = modelPill();
    expect(pill).toHaveTextContent("Checking");
  });

  it("never renders the API key or backend URL in the pill", () => {
    renderHeader("online");
    const pill = modelPill();
    expect(pill.textContent).not.toContain("sk-");
    expect(pill.textContent).not.toContain("http");
    expect(pill.textContent).not.toContain("localhost");
  });
});

describe("Header settings panel", () => {
  it("lists the selected model with provider and context in settings", async () => {
    renderHeader("online");
    // The panel is closed; open settings to see the model rows.
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    // The name also appears in the pill + mobile bar — the settings <dd> is
    // one of the matches, and Provider/Context rows are settings-only.
    await waitFor(() =>
      expect(screen.getAllByText("Qwen3.8 Omni Flash").length).toBeGreaterThan(0),
    );
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByText("Qwen")).toBeInTheDocument();
    expect(screen.getByText("1M tokens")).toBeInTheDocument();
  });

  it("Check connection is exposed and triggers a health re-check", async () => {
    const { onCheckConnection } = renderHeader("online");
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    const checkBtn = await screen.findByRole("button", { name: /check connection/i });
    fireEvent.click(checkBtn);
    expect(onCheckConnection).toHaveBeenCalledTimes(1);
  });

  it("Change model opens the model selector", async () => {
    const { onOpenModelSelector } = renderHeader("online");
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    const changeBtn = await screen.findByRole("button", { name: /change model/i });
    fireEvent.click(changeBtn);
    expect(onOpenModelSelector).toHaveBeenCalledTimes(1);
  });
});
