import Link from 'next/link';
import DepartmentDashboard from '@/components/DepartmentDashboard';

export default function AdminDepartmentPage({ params }) {
  return (
    <>
      <p>
        <Link href="/admin">&larr; Back to admin dashboard</Link>
      </p>
      <DepartmentDashboard deptId={params.id} />
    </>
  );
}
