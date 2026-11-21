import Link from 'next/link';
import DepartmentDashboard from '@/components/DepartmentDashboard';

// Same dashboard the head sees, but the admin can open any department.
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
