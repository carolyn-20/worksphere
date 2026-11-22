import './globals.css';
import Providers from './providers';
export const metadata = { title: 'WorkSphere' };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="min-h-screen bg-slate-50 text-slate-900"><Providers>{children}</Providers></body></html>;
}
