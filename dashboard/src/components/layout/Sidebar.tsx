import Link from 'next/link';
import { LayoutDashboard, Activity, FileText, Settings, Shield, AlertTriangle, BookOpen } from 'lucide-react';

const menuItems = [
    { name: 'Overview', icon: LayoutDashboard, href: '/' },
    { name: 'Monitoring', icon: Activity, href: '/monitoring' },
    { name: 'Knowledge Base', icon: BookOpen, href: '/knowledge' },
    { name: 'Logs', icon: FileText, href: '/logs' },
    { name: 'Alerts', icon: AlertTriangle, href: '/alerts' },
    { name: 'Security', icon: Shield, href: '/security' },
    { name: 'Settings', icon: Settings, href: '/settings' },
];

export function Sidebar() {
    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-gray-900 text-white border-r border-gray-800">
            <div className="p-6 border-b border-gray-800">
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
                    Joe Admin
                </h1>
                <p className="text-xs text-gray-400 mt-1">System Control Center</p>
            </div>

            <nav className="p-4 space-y-2">
                {menuItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors group"
                    >
                        <item.icon className="w-5 h-5 text-gray-400 group-hover:text-blue-400 transition-colors" />
                        <span className="font-medium">{item.name}</span>
                    </Link>
                ))}
            </nav>

            <div className="absolute bottom-0 w-full p-4 border-t border-gray-800">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-sm text-gray-400">System Online</span>
                </div>
            </div>
        </aside>
    );
}
