import DepartmentDashboard from '@/components/DepartmentDashboard';

// Department head dashboard. The API uses the head's own department from their login,
// so a head cannot view another department by changing the URL.
export default function HeadDashboardPage() {
  return <DepartmentDashboard />;
}
