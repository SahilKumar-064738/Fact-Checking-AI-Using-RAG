import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AddSourceDialog } from "@/components/sources/AddSourceDialog";
import { ApiError } from "@/lib/api";
import type { SourceDoc } from "@/lib/types";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockRejectedValue(new Error("offline"));
});

afterEach(cleanup);

function openDialog(onAdd = vi.fn()) {
  render(<AddSourceDialog open onClose={vi.fn()} onAdd={onAdd} />);
  return { onAdd };
}

async function switchTab(name: string | RegExp) {
  fireEvent.click(screen.getByRole("tab", { name }));
}

describe("AddSourceDialog — tabs", () => {
  it("opens with Paste text tab active and all three tabs present", () => {
    openDialog();
    expect(screen.getByRole("tab", { name: /paste text/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /web link/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /upload document/i })).toBeInTheDocument();
  });

  it("arrow keys move between tabs", () => {
    openDialog();
    const firstTab = screen.getByRole("tab", { name: /paste text/i });
    fireEvent.keyDown(firstTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /web link/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("AddSourceDialog — paste text", () => {
  it("Add source stays disabled until meaningful text exists", () => {
    openDialog();
    const submit = screen.getByRole("button", { name: /^add source$/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^source text/i), {
      target: { value: "Paris is the capital of France." },
    });
    expect(submit).toBeEnabled();
  });

  it("shows a live character count", () => {
    openDialog();
    const text = "12345";
    fireEvent.change(screen.getByLabelText(/^source text/i), {
      target: { value: text },
    });
    expect(screen.getByText("5 characters")).toBeInTheDocument();
  });

  it("creates a text source on submit", async () => {
    const { onAdd } = openDialog();
    fireEvent.change(screen.getByLabelText(/source title/i), {
      target: { value: "Climate Law" },
    });
    fireEvent.change(screen.getByLabelText(/^source text/i), {
      target: { value: "The EU aims to be climate neutral by 2050." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add source$/i }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const source: SourceDoc = onAdd.mock.calls[0][0];
    expect(source.sourceType).toBe("text");
    expect(source.title).toBe("Climate Law");
    expect(source.text).toContain("climate neutral");
  });
});

describe("AddSourceDialog — web link (backend does not fetch URLs)", () => {
  it("requires URL AND source text; explains the URL is metadata only", async () => {
    openDialog();
    await switchTab(/web link/i);
    const submit = screen.getByRole("button", { name: /^add source$/i });

    // URL only → still disabled (backend does not fetch page content)
    fireEvent.change(screen.getByLabelText(/source url/i), {
      target: { value: "https://example.com/law" },
    });
    expect(submit).toBeDisabled();

    // URL + text → enabled
    fireEvent.change(screen.getByLabelText(/^source text/i), {
      target: { value: "The page body text." },
    });
    expect(submit).toBeEnabled();

    // The honest disclosure is visible
    expect(
      screen.getByText(/URL is stored as source metadata/i),
    ).toBeInTheDocument();
  });

  it("rejects invalid URLs", async () => {
    openDialog();
    await switchTab(/web link/i);
    fireEvent.change(screen.getByLabelText(/source url/i), {
      target: { value: "not a url" },
    });
    fireEvent.change(screen.getByLabelText(/^source text/i), {
      target: { value: "Some text." },
    });
    expect(screen.getByRole("button", { name: /^add source$/i })).toBeDisabled();
  });

  it("creates a web source carrying the URL", async () => {
    const { onAdd } = openDialog();
    await switchTab(/web link/i);
    fireEvent.change(screen.getByLabelText(/source url/i), {
      target: { value: "https://eur-lex.europa.eu/climate-law" },
    });
    fireEvent.change(screen.getByLabelText(/^source text/i), {
      target: { value: "Article 1: The EU shall be climate neutral by 2050." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add source$/i }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const source: SourceDoc = onAdd.mock.calls[0][0];
    expect(source.sourceType).toBe("web");
    expect(source.url).toBe("https://eur-lex.europa.eu/climate-law");
    expect(source.text).toContain("climate neutral");
  });

  it("never performs a URL fetch", async () => {
    const { onAdd } = openDialog();
    await switchTab(/web link/i);
    fireEvent.change(screen.getByLabelText(/source url/i), {
      target: { value: "https://example.com/page" },
    });
    fireEvent.change(screen.getByLabelText(/^source text/i), {
      target: { value: "Text." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add source$/i }));
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    // The dialog must not have issued any fetch: the backend does not fetch
    // URLs and the dialog must never pretend otherwise.
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("AddSourceDialog — upload document", () => {
  function filePicker() {
    // The file input is sr-only; access it via its container
    const dropzone = screen.getByRole("button", {
      name: /upload document — drop a file here/i,
    });
    const input = dropzone.parentElement?.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    return input;
  }

  function uploadErr(detail: unknown, status = 422) {
    return Promise.resolve({
      ok: false,
      status,
      text: async () => JSON.stringify({ detail }),
    });
  }

  it("extraction success enables Add source and shows char count", async () => {
    const { onAdd } = openDialog();
    await switchTab(/upload document/i);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        filename: "law.pdf",
        text: "Extracted PDF body text.",
        chars: 24,
      }),
    });

    const file = new File(["%PDF fake"], "law.pdf", { type: "application/pdf" });
    fireEvent.change(filePicker(), { target: { files: [file] } });

    expect(await screen.findByText(/✓ text extracted/i)).toBeInTheDocument();
    expect(screen.getByText(/24 characters/)).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: /^add source$/i });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const source: SourceDoc = onAdd.mock.calls[0][0];
    expect(source.sourceType).toBe("file");
    expect(source.fileKind).toBe("PDF");
    expect(source.text).toBe("Extracted PDF body text.");
  });

  it("extraction failure surfaces the backend message and disables submit", async () => {
    openDialog();
    await switchTab(/upload document/i);
    mockFetch.mockResolvedValueOnce(uploadErr("This PDF does not contain extractable text. OCR is not currently supported."));

    const file = new File(["%PDF scan"], "scan.pdf", { type: "application/pdf" });
    fireEvent.change(filePicker(), { target: { files: [file] } });

    expect(
      await screen.findByText(/does not contain extractable text/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^add source$/i })).toBeDisabled();
  });

  it("unsupported extension rejected client-side without a network call", async () => {
    openDialog();
    await switchTab(/upload document/i);
    const file = new File(["MZ"], "evil.exe", { type: "application/x-msdownload" });
    fireEvent.change(filePicker(), { target: { files: [file] } });

    expect(await screen.findByText(/unsupported file type/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("oversized file rejected client-side", async () => {
    openDialog();
    await switchTab(/upload document/i);
    const big = new File([new Uint8Array(11)], "big.txt", { type: "text/plain" });
    Object.defineProperty(big, "size", { value: 10 * 1024 * 1024 + 1 });
    fireEvent.change(filePicker(), { target: { files: [big] } });

    expect(await screen.findByText(/too large/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("empty file rejected client-side", async () => {
    openDialog();
    await switchTab(/upload document/i);
    const empty = new File([], "empty.txt", { type: "text/plain" });
    fireEvent.change(filePicker(), { target: { files: [empty] } });

    expect(await screen.findByText(/file is empty/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns to the dropzone after failure so another document can be chosen", async () => {
    openDialog();
    await switchTab(/upload document/i);
    mockFetch.mockResolvedValueOnce(uploadErr("No extractable text."));
    const file = new File(["x"], "broken.docx", { type: "application/octet-stream" });
    fireEvent.change(filePicker(), { target: { files: [file] } });
    await screen.findByText(/no extractable text/i);
    // The dropzone is back — clicking it opens the file picker again
    expect(
      screen.getByRole("button", { name: /upload document — drop a file here/i }),
    ).toBeInTheDocument();
  });
});
