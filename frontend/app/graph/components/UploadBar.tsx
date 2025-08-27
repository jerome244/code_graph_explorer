'use client'

export default function UploadBar({
  projectName,
  setProjectName,
  onUpload,
  loading,
}: {
  projectName: string
  setProjectName: (v: string) => void
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  loading: boolean
}) {
  return (
    <header style={{ padding: '12px', borderBottom: '1px solid #eee', display: 'flex', gap: 12 }}>
      <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Project name" />
      <input type="file" accept=".zip" onChange={onUpload} />
      {loading && <span>Parsing…</span>}
    </header>
  )
}
