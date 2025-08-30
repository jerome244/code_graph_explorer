// Row.tsx
import React from 'react';
import { UserLite } from './types'; // Make sure you import the UserLite type from the appropriate file

interface RowProps {
  u: UserLite;
  role: 'viewer' | 'editor';
  canEdit: boolean;
  onRemove: () => void;
  onRoleChange: (r: 'viewer' | 'editor') => void;
}

const Row: React.FC<RowProps> = ({ u, role, canEdit, onRemove, onRoleChange }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderTop: '1px solid #eee' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 24, height: 24, borderRadius: 999, background: '#eee', display: 'grid', placeItems: 'center', fontSize: 12 }}>
          {u.username[0]?.toUpperCase()}
        </div>
        <div style={{ fontWeight: 600 }}>{u.username}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <select
          value={role}
          onChange={(e) => onRoleChange(e.target.value as 'viewer' | 'editor')}
          disabled={!canEdit}
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
        </select>
        <button
          onClick={onRemove}
          disabled={!canEdit}
          title="Remove"
          style={{ border: '1px solid #ddd', background: 'white', padding: '4px 6px', borderRadius: 6 }}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default Row;
