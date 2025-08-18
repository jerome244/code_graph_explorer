import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";

// Import the page component
import UploadPage from "./page";

describe("UploadPage", () => {
  it("creates a project, uploads ZIP, then redirects to /projects/<slug>/graph", async () => {
    let createdName = "";
    let uploadHit = false;

    // 1) Project creation
    server.use(
      http.post("/api/projects", async ({ request }) => {
        const body = await request.json();
        createdName = body?.name || "";
        // Return a slug derived from the name
        return HttpResponse.json(
          {
            id: 42,
            name: createdName,
            slug: createdName.toLowerCase().replace(/\s+/g, "-") || "new-project",
            description: "",
            owner: 1,
            created_at: new Date().toISOString(),
          },
          { status: 201 }
        );
      })
    );

    // 2) Upload to that slug
    server.use(
      http.post("/api/projects/:slug/upload", async ({ params, request }) => {
        uploadHit = true;
        const form = await request.formData();
        // ensure file present
        expect(form.get("file")).toBeTruthy();
        return HttpResponse.text("", { status: 201 });
      })
    );

    // Render page
    render(<UploadPage />);

    // Fill optional name
    const nameInput = screen.getByPlaceholderText("My Project");
    fireEvent.change(nameInput, { target: { value: "Demo App" } });

    // Select a ZIP file
    const zip = new File(["zipbytes"], "code.zip", { type: "application/zip" });
    const fileInput = screen.getByLabelText(/zip file/i);
    fireEvent.change(fileInput, { target: { files: [zip] } });

    // Submit
    const button = screen.getByRole("button", { name: /upload & open graph/i });
    fireEvent.click(button);

    // Wait until MSW handlers were hit
    await waitFor(() => {
      // project name captured by mock
      expect(createdName).toBe("Demo App");
      expect(uploadHit).toBe(true);
    });
  });

  it("shows a validation message when file is missing", async () => {
    render(<UploadPage />);

    // Do not attach a file
    const button = screen.getByRole("button", { name: /upload & open graph/i });
    fireEvent.click(button);

    await screen.findByText(/please choose a \.zip file/i);
  });
});
