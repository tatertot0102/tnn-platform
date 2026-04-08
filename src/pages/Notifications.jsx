import PageHeader from '../components/ui/PageHeader'

export default function Notifications() {
  return (
    <div>
      <PageHeader title="Notifications" />
      <div className="card p-6">
        <p className="text-gray-400 text-sm">No new notifications.</p>
      </div>
    </div>
  )
}
