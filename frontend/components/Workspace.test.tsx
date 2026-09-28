import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Workspace } from "@/components/Workspace";

// The workspace talks to the backend via fetch — mock it entirely.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  // Health check: offline by default in tests
  mockFetch.mockRejectedValue(new Error("offline"));
});

afterEach(cleanup);

async function typeAndAddSource(text: string, title = "My Source") {
  // Open the dialog from the sources panel header — the single CTA
  fireEvent.click(screen.getByRole("button", { name: /add source/i }));
  const dialog = await screen.findByRole("dialog", { name: /add source/i });
  fireEvent.change(within(dialog).getByLabelText(/title/i), {
    target: { value: title },
  });
  fireEvent.change(within(dialog).getByLabelText(/^source text/i), {
    target: { value: text },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: /^add source$/i }));
}

describe("Workspace", () => {
  it("renders the empty state with instructions", () => {
    render(<Workspace />);
    expect(
      screen.getByRole("heading", { name: /verify an ai-generated answer/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/break the answer into claims/i)).toBeInTheDocument();
  });

  it("disables Verify Answer until answer and sources exist", async () => {
    render(<Workspace />);
    // The Verify CTA is unique and disabled until answer + sources exist
    const verifyButtons = () =>
      screen.getAllByRole("button", { name: /verify answer/i });
    expect(verifyButtons().length).toBe(1);
    expect(verifyButtons()[0]).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/rag-generated answer/i), {
      target: { value: "Paris is the capital of France." },
    });
    // Answer entered, still no source; the empty-state CTA is now hidden
    const [verify] = verifyButtons();
    expect(verify).toBeDisabled();

    await typeAndAddSource("Paris is the capital of France.");
    expect(verifyButtons()[0]).toBeEnabled();
  });

  it("adds and removes sources", async () => {
    render(<Workspace />);
    await typeAndAddSource("Source body text.");
    expect(screen.getByText("Source body text.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /remove my source/i }));
    expect(screen.queryByText("Source body text.")).not.toBeInTheDocument();
  });

  it("shows an error state when the backend is unreachable", async () => {
    render(<Workspace />);
    fireEvent.change(screen.getByLabelText(/rag-generated answer/i), {
      target: { value: "Paris is the capital of France." },
    });
    await typeAndAddSource("Paris is the capital of France.");

    fireEvent.click(screen.getByRole("button", { name: /verify answer/i }));

    expect(
      await screen.findByText(/couldn't reach the verification backend/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    // No fabricated claims/results while errored
    expect(screen.queryByText(/claims \(/i)).not.toBeInTheDocument();
  });

  it("renders results from a successful verification without fabricating anything", async () => {
    const response = {
      answer_score: 10.0,
      claims: [
        {
          claimString: "Paris is the capital of France.",
          startOffset: 0,
          endOffset: 31,
          segmentIds: ["0"],
          score: 1.0,
          rationale: "Directly supported by the source.",
          skipped: false,
          verdict: "supported",
          evidence: "Paris is the capital of France.",
          confidence: 0,
          document_index: 0,
        },
      ],
      segments: { "0": { id: 0, startOffset: 0, endOffset: 31 } },
    };

    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes("/stream")) {
        // Pretend the stream endpoint is missing so the client falls back
        return Promise.resolve({
          ok: false,
          status: 404,
          headers: new Headers(),
          text: async () => "",
        });
      }
      if (String(url).includes("/generate")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => response,
        });
      }
      return Promise.reject(new Error("offline"));
    });

    render(<Workspace />);
    fireEvent.change(screen.getByLabelText(/rag-generated answer/i), {
      target: { value: "Paris is the capital of France." },
    });
    await typeAndAddSource("Paris is the capital of France.");
    fireEvent.click(screen.getByRole("button", { name: /verify answer/i }));

    // The panel heading announces completion (the CTA also mentions it,
    // so query by role rather than loose text)
    expect(
      await screen.findByRole("heading", { name: /verification complete/i }),
    ).toBeInTheDocument();
    // Score card shows the backend's score label for 10/10
    expect(screen.getByText("Excellent")).toBeInTheDocument();
    // The real claim appears; no invented claims
    expect(screen.getAllByText(/paris is the capital of france\./i).length).toBeGreaterThan(0);
    expect(screen.getByText(/claims \(1\)/i)).toBeInTheDocument();
  });
});