// ------------------------------ Types ------------------------------

// Persist x/y *and* hidden flag per node
export type NodeState = { x?: number; y?: number; hidden?: boolean };
export type PositionsMap = Record<string, NodeState>;

export type CyElement = cytoscape.ElementDefinition;

// >>> Realtime peers for presence + cursors
export type Peer = { id: number; username: string; color: string; x?: number; y?: number };

export type Role = "owner" | "editor" | "viewer" | "none";
export type UserLite = { id: number; username: string };
export type ProjectDetail = {
  id: number;
  name: string;
  owner: UserLite;
  editors: UserLite[];
  shared_with: UserLite[]; // viewers (may also include editors)
  my_role?: Role;
};
