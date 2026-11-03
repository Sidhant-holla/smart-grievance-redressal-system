import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata = {
  title: 'Smart Grievance Redressal System',
  description: 'Complaint tracking with enforced workflow, SLA escalation and duplicate detection',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
