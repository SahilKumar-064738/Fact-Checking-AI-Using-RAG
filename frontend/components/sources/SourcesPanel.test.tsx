import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SourcesPanel } from "@/components/sources/SourcesPanel";
import type { SourceDoc } from "@/lib/types";

const baseSource: SourceDoc = {
  id: "s1",
  title: "European Climate Law",
  text: "The EU aims to be climate neutral by 2050.",
  sourceType: "text",
  url: "",
};

function renderPanel(sources: SourceDoc[] = []) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  const onInspect = vi.fn();
  render(
    <SourcesPanel
      sources={sources}
      onAdd={onAdd}
      onRemove={onRemove}
      onInspect={onInspect}
    />,
  );
  return { onAdd, onRemove, onInspect };
}

afterEach(cleanup);

describe("SourcesPanel", () => {
  it("renders exactly ONE visible 'Add source' button when empty", () => {
    renderPanel([]);
    const buttons = screen.getAllByRole("button", { name: /add source/i });
    expect(buttons).toHaveLength(1);
  });

  it("renders exactly ONE visible 'Add source' button when populated", () => {
    renderPanel([baseSource]);
    const buttons = screen.getAllByRole("button", { name: /add source/i });
    expect(buttons).toHaveLength(1);
  });

  it("empty state has no button and shows all three input paths", () => {
    renderPanel([]);
    expect(screen.getByTestId("sources-empty-state")).toBeInTheDocument();
    // The empty-state area itself must contain no buttons
    const emptyState = screen.getByTestId("sources-empty-state");
    expect(emptyState.querySelectorAll("button")).toHaveLength(0);
    expect(screen.getByText(/add text, a web link, or a document/i)).toBeInTheDocument();
  });

  it("header Add source button triggers onAdd", () => {
    const { onAdd } = renderPanel([]);
    fireEvent.click(screen.getByRole("button", { name: /add source/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("shows typed labels for each source kind", () => {
    renderPanel([
      baseSource,
      {
        ...baseSource,
        id: "s2",
        sourceType: "web",
        url: "https://eur-lex.europa.eu/climate-law",
      },
      {
        ...baseSource,
        id: "s3",
        sourceType: "file",
        fileName: "report.pdf",
        fileKind: "PDF",
      },
    ]);
    const list = screen.getByRole("list");
    expect(list.textContent).toContain("Pasted text");
    expect(list.textContent).toContain("Web");
    expect(list.textContent).toContain("PDF");
    expect(list.textContent).toContain("42 chars");
  });

  it("shows the URL domain for web sources", () => {
    renderPanel([
      { ...baseSource, id: "s2", sourceType: "web", url: "https://eur-lex.europa.eu/climate-law" },
    ]);
    expect(screen.getByText("eur-lex.europa.eu")).toBeInTheDocument();
  });

  it("inspect and remove actions work", () => {
    const { onInspect, onRemove } = renderPanel([baseSource]);
    fireEvent.click(screen.getByRole("button", { name: /view european climate law/i }));
    expect(onInspect).toHaveBeenCalledWith("s1");
    fireEvent.click(screen.getByRole("button", { name: /remove european climate law/i }));
    expect(onRemove).toHaveBeenCalledWith("s1");
  });
});
