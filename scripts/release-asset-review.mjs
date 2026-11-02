// 只认可已记录的具体文件与哈希；新增或变更素材须重新审查。
export function reviewAssets(assets, approval) {
  const recorded = new Map(approval.files.map(f => [f.file, f]))
  const rows = assets.map(asset => {
    const match = recorded.get(asset.file)
    return {...asset, category: match?.category ?? 'UNREVIEWED', approved: !!match && match.sha256 === asset.sha256}
  })
  const publicationCleared = rows.length === recorded.size && rows.every(a => a.approved)
  return {publicationCleared, scope: 'Static asset inclusion review only; not deployment authorization or independent rights verification',
    approvalDate: approval.date, assets: rows}
}
