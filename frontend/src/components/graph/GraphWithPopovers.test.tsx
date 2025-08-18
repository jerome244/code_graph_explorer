import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";

// ---- Virtual Cytoscape mock (no real pkg needed)
let handlers: Record<string, (evt: any) => void>;
let nodesById: Record<string, any>;

vi.mock("cytoscape", () => {
  return {
    default: (opts: any) => {
      // register nodes so tests can find them
      (opts.elements || []).forEach((el: any) => {
        if (el?.data?.id) {
          nodesById[el.data.id] = {
            id: el.data.id,
            data: () => el.data,
            renderedPosition: () => ({ x: 100, y: 50 }),
            nonempty: () => true,
          };
        }
      });

      return {
        // Support: on(event, selector, handler) and on(events, handler)
        on: (events: string, selectorOrHandler: any, maybeHandler?: any) => {
          const cb = typeof maybeHandler === "function" ? maybeHandler : selectorOrHandler;
          String(events)
            .split(/\s+/)
            .filter(Boolean)
            .forEach((evt) => {
              handlers[evt] = cb;
            });
        },
        $id: (id: string) => nodesById[id],
        destroy: () => {},
      };
    },
  };
}, { virtual: true });

// after the mock, import the component
import GraphWithPopovers from "./GraphWithPopovers";

// helper to simulate a node tap
function tapNode(id: string) {
  const node = nodesById[id];
  handlers["tap"]?.({ target: node });
}

beforeEach(() => {
  handlers = {};
  nodesById = {};

  // default backend response for file fetch
  server.use(
    http.get("/api/projects/:slug/file", ({ request }) => {
      const url = new URL(request.url);
      const path = url.searchParams.get("path");
      return new HttpResponse(`CODE:${path}`, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    })
  );
});

afterEach(() => {
  handlers = {};
  nodesById = {};
});

describe("<GraphWithPopovers />", () => {
  it("opens a popover on node tap and shows code text", async () => {
    render(
      <GraphWithPopovers
        slug="demo"
        nodes={[{ id: "n1", label: "foo()", path: "a.py" }]}
        edges={[]}
      />
    );

    // Wait until Cytoscape has been created and the tap handler registered
    await waitFor(() => expect(typeof handlers["tap"]).toBe("function"));

    tapNode("n1");

    await waitFor(() => {
      // title and code body appear
      expect(screen.getByText(/foo\(\)/)).toBeInTheDocument();
      expect(screen.getByText("CODE:a.py")).toBeInTheDocument();
    });
  });

  it("keeps multiple popovers open", async () => {
    render(
      <GraphWithPopovers
        slug="demo"
        nodes={[
          { id: "n1", label: "foo()", path: "a.py" },
          { id: "n2", label: "bar()", path: "b.js" },
        ]}
        edges={[]}
      />
    );

    await waitFor(() => expect(typeof handlers["tap"]).toBe("function"));

    tapNode("n1");
    tapNode("n2");

    await waitFor(() => {
      expect(screen.getByText(/foo\(\)/)).toBeInTheDocument();
      expect(screen.getByText(/bar\(\)/)).toBeInTheDocument();
      expect(screen.getByText("CODE:a.py")).toBeInTheDocument();
      expect(screen.getByText("CODE:b.js")).toBeInTheDocument();
    });
  });
});
