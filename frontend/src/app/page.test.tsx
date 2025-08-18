import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import HomePage from "./page";

describe("HomePage", () => {
  it("links Graph card to /graph", () => {
    render(<HomePage />);
    const link = screen.getByRole("link", { name: /open graph/i });
    expect(link).toHaveAttribute("href", "/graph");
  });
});
