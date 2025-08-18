// src/app/projects/[slug]/analyze/page.test.tsx
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import AnalyzePage from "./page";

// base state for each test
const baseAnalysis = () => ({
  id: 1,
  name: "Analysis 1",
  created_at: new Date().toISOString(),
  summary: { files: 1, functions: 2, calls: 1, css_classes: 1, css_ids: 0 },
  graph: {
    nodes: [],
    edges: [],
    tree_by_file: { "a.py": { lang: "py", functions: ["foo"], calls: ["bar"] } },
  },
});

let analysisState: any;

beforeEach(() => {
  analysisState = baseAnalysis(); // ← reset per test

  // Use RELATIVE URLs so they match JSDOM's http://localhost origin
  server.use(
    http.get("/api/projects/:slug/analysis", () =>
      HttpResponse.json(analysisState, { status: 200 })
    ),

    http.post("/api/projects/:slug/upload", async () => {
      analysisState = {
        ...analysisState,
        id: analysisState.id + 1,
        summary: { files: 2, functions: 3, calls: 2, css_classes: 1, css_ids: 1 },
        graph: {
          ...analysisState.graph,
          tree_by_file: {
            ...analysisState.graph.tree_by_file,
            "b.js": { lang: "js", functions: ["bar"], calls: [] },
          },
        },
      };
      return HttpResponse.json({ ok: true }, { status: 201 });
    }),

    http.post("/api/projects/:slug/import/github", async () => {
      analysisState = {
        ...analysisState,
        id: analysisState.id + 1,
        summary: { files: 3, functions: 4, calls: 3, css_classes: 2, css_ids: 1 },
        graph: {
          ...analysisState.graph,
          tree_by_file: {
            ...analysisState.graph.tree_by_file,
            "index.html": { lang: "html", html_ids: ["hero"], html_classes: ["card"] },
          },
        },
      };
      return HttpResponse.json({ ok: true }, { status: 201 });
    })
  );
});

describe("AnalyzePage", () => {
  it("loads latest analysis and renders file tree and summary", async () => {
    render(<AnalyzePage params={{ slug: "demo" }} />);
    expect(await screen.findByText(/Latest:/i)).toBeInTheDocument();

    // "a.py" shows in sidebar and header; use *All* variant
    expect(screen.getAllByText("a.py").length).toBeGreaterThan(0);
  });

  it("uploads a ZIP and refreshes the analysis", async () => {
    const { container } = render(<AnalyzePage params={{ slug: "demo" }} />);
    await screen.findByText(/Latest:/i);

    // Precisely target the upload form
    const uploadBtn = screen.getByRole("button", { name: /upload & analyze/i });
    const uploadForm = uploadBtn.closest("form") as HTMLFormElement;
    const fileInput = uploadForm.querySelector('input[type="file"][name="file"]') as HTMLInputElement;

    const file = new File(["zipbytes"], "code.zip", { type: "application/zip" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // submit explicitly (more reliable than click in some jsdom cases)
    fireEvent.submit(uploadForm);

    // wait until UI reflects new analysis (b.js appears in the tree)
    await waitFor(() => {
      expect(screen.getByText("b.js")).toBeInTheDocument();
    });

    // (optional) if you still want to assert on summary numbers, use a textContent matcher:
    // expect(
    //   screen.getByText((_, el) => el?.textContent?.includes("2") && el.textContent.includes("files"))
    // ).toBeInTheDocument();
  });

  it("imports from GitHub and refreshes the analysis", async () => {
    render(<AnalyzePage params={{ slug: "demo" }} />);
    await screen.findByText(/Latest:/i);

    fireEvent.change(screen.getByPlaceholderText(/owner\/name/i), { target: { value: "owner/repo" } });
    fireEvent.change(screen.getByPlaceholderText(/branch\/tag\/sha/i), { target: { value: "main" } });

    fireEvent.click(screen.getByRole("button", { name: /import & analyze/i }));

    await waitFor(() => {
      expect(screen.getByText("index.html")).toBeInTheDocument();
    });
  });
});
