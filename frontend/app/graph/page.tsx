"use client";
import { useState } from "react";
import type { TreeNode } from "@/app/api/graph/upload/route";
import UploadDropzone from "./components/UploadDropzone";
import FileTree from "./components/FileTree";
import GraphView from "./components/GraphView";
import Link from "next/link";

export default function GraphPage() {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);

  return (
    <div className="graph-layout">
      <aside className="graph-sidebar">
        <div className="sidebar-header">
          <h2>Project Tree</h2>
          <Link href="/" className="underline">Home</Link>
        </div>
        {tree ? <FileTree node={tree} /> : <p className="dz-sub">Upload a .zip to see the tree.</p>}
      </aside>

      <main className="graph-main">
        <h1 className="page-title">Graph Explorer</h1>

        <UploadDropzone
          onResult={(data) => {
            setTree(data.tree);
            setNodes(data.nodes);
            setEdges(data.edges);
          }}
        />

        <div className="card" style={{ height: "70vh", padding: 0 }}>
          <GraphView nodes={nodes} edges={edges} />
        </div>
      </main>
    </div>
  );
}
