'use client'

export default function UploadBar({
  projectName,
  setProjectName,
  onUpload,
  loading,
  onSave,
  canSave,
  saving,
  onOpenLoad, // 👈 new
}: {
  projectName: string
  setProjectName: (v: string) => void
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  loading: boolean
  onSave: () => void
  canSave: boolean
  saving: boolean
  onOpenLoad: () => void
}) {
  return (
    <header
      style={{
        padding: '12px',
        borderBottom: '1px solid #eee',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Project name"
        />
        <input type="file" accept=".zip" onChange={onUpload} />
        {loading && <span>Parsing…</span>}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onOpenLoad} style={{ padding: '6px 10px', cursor: 'pointer' }}>
          Load…
        </button>
        <button
          disabled={!canSave || saving}
          onClick={onSave}
          style={{ padding: '6px 10px', cursor: !canSave || saving ? 'not-allowed' : 'pointer' }}
        >
          {saving ? 'Saving…' : 'Save Project'}
        </button>
      </div>
    </header>
  )
}
