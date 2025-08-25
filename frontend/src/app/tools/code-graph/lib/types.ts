export type SupportedType = 'c' | 'py' | 'html' | 'css' | 'js';

export type ParsedFile = {
  path: string;
  name: string;
  dir: string;
  ext: SupportedType;
  content: string;
  size: number;
};

export type TreeNode =
  | {
      id: string; type: 'folder'; name: string; path: string | null;
      children: TreeNode[]; open: boolean; count: number;
    }
  | {
      id: string; type: 'file'; name: string; path: string; ext: SupportedType;
    };
