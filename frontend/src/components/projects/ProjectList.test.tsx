import { render, screen } from "@testing-library/react";
import React from "react";
import ProjectList from "./ProjectList";
import { vi } from "vitest";

// Mock next/link -> plain <a>
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={typeof href === "string" ? href : href?.pathname} {...rest}>
      {children}
    </a>
  ),
}));

const projects = [
  {
    id: 1,
    name: "Demo",
    slug: "demo",
    description: "hello",
    owner: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    name: "Another",
    slug: "another",
    description: "",
    owner: 1,
    created_at: new Date().toISOString(),
  },
];

describe("<ProjectList />", () => {
  it("renders empty state", () => {
    render(<ProjectList projects={[]} />);
    expect(screen.getByText(/No projects yet/i)).toBeInTheDocument();
  });

  it("renders projects and links", () => {
    render(<ProjectList projects={projects as any} />);
    // names
    expect(screen.getByText("Demo")).toBeInTheDocument();
    expect(screen.getByText("Another")).toBeInTheDocument();
    // links
    expect(screen.getAllByRole("link", { name: "Analyze" })[0]).toHaveAttribute(
      "href",
      "/projects/demo/analyze"
    );
    expect(screen.getAllByRole("link", { name: "Graph" })[0]).toHaveAttribute(
      "href",
      "/projects/demo/graph"
    );
  });
});
