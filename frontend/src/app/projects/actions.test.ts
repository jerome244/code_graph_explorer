import { describe, it, expect, vi, beforeEach } from "vitest";

// mock next/cache revalidatePath
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const { revalidatePath } = await import("next/cache");

// import after mocks
import { createProject } from "./actions";

describe("createProject (server action)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs to /api/projects and revalidates /projects", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("{}", { status: 201 })
    );

    const fd = new FormData();
    fd.set("name", "My Project");
    fd.set("description", "desc");

    await createProject(fd);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/projects$/),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Project", description: "desc" }),
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/projects");
  });

  it("no-op when name is empty", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 201 }));
    const fd = new FormData();
    fd.set("name", "");
    await createProject(fd);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
